"""Submission routes.

Two ways in, both gated on record_audio consent:

    POST /submissions        typed text, stored straight as the transcript
    POST /submissions/upload an audio recording, transcribed by the worker
"""

from __future__ import annotations

import logging
import os
import tempfile
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import get_current_user, require_consent
from app.core.uploads import (
    ALLOWED_CONTENT_TYPES,
    CHUNK_SIZE,
    COMPATIBLE_CONTAINERS,
    EXTENSION_BY_CONTAINER,
    MAGIC_PREFIX_BYTES,
    MAX_UPLOAD_BYTES,
    human_size,
    normalise_content_type,
    sniff_container,
)
from app.models.submission import InputType, Submission, SubmissionStatus
from app.models.user import User
from app.models.extracted_problem import ExtractedProblem as ExtractedProblemRow
from app.models.match import Match
from app.models.provider import Provider
from app.schemas.submission import (
    MatchedProvider,
    SubmissionCreateRequest,
    SubmissionDetailResponse,
    SubmissionMatch,
    SubmissionResponse,
)
from app.services import scanning, storage
from app.workers.tasks import extract_task, start_pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/submissions", tags=["submissions"])


def _storage_key(user_id: int, container: str) -> str:
    """Per-user prefix keeps listing and lifecycle rules simple later."""
    extension = EXTENSION_BY_CONTAINER.get(container, ".bin")
    return f"audio/{user_id}/{uuid4().hex}{extension}"


@router.post("", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
def create_text_submission(
    payload: SubmissionCreateRequest,
    current_user: User = Depends(require_consent("record_audio")),
    db: Session = Depends(get_db),
) -> Submission:
    """Accept a typed description and go straight to extraction.

    There is nothing to transcribe, so the text is stored as the transcript and
    the pipeline is entered at extract_task - transcription is skipped, not
    stubbed.
    """
    submission = Submission(
        user_id=current_user.id,
        input_type=InputType.text,
        video_path=None,
        transcript=payload.text.strip(),
        status=SubmissionStatus.SUBMITTED,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    logger.info(
        "submission: user=%s submission=%s input=text chars=%d",
        current_user.id,
        submission.id,
        len(submission.transcript or ""),
    )

    extract_task.delay(submission.id)
    return submission


@router.post(
    "/upload",
    response_model=SubmissionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_audio(
    audio: UploadFile = File(..., description="Audio recording (mp3, wav or webm)"),
    current_user: User = Depends(require_consent("record_audio")),
    db: Session = Depends(get_db),
) -> Submission:
    """Accept an audio recording, store it, and start the pipeline.

    Order of checks: declared content type, then the actual leading bytes, then
    size while streaming, then a malware scan. The hard size ceiling is also
    enforced ahead of this handler by the Content-Length middleware in
    app.main - that catches an honest client early; this loop catches a client
    that lied or omitted the header.
    """
    declared = normalise_content_type(audio.content_type)
    if declared not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported content type {declared or '(none)'!r}. "
                f"Allowed: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}."
            ),
        )

    tmp_path: str | None = None
    total = 0
    container: str | None = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".upload") as tmp:
            tmp_path = tmp.name

            while chunk := await audio.read(CHUNK_SIZE):
                if container is None:
                    # Check the magic bytes on the first chunk so a bogus file
                    # is rejected before the rest of it is written to disk.
                    container = sniff_container(chunk[:MAGIC_PREFIX_BYTES])
                    if container is None:
                        raise HTTPException(
                            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                            detail=(
                                "File content is not a supported audio recording. "
                                "Expected MP3, WAV or WebM/Ogg audio; the declared "
                                f"type was {declared!r} but the file's own bytes "
                                "say otherwise."
                            ),
                        )
                    if container not in COMPATIBLE_CONTAINERS[declared]:
                        raise HTTPException(
                            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                            detail=(
                                f"File content does not match its declared type. "
                                f"Declared {declared!r} but the bytes are {container}."
                            ),
                        )

                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=(
                            f"File is too large. The limit is "
                            f"{human_size(MAX_UPLOAD_BYTES)}."
                        ),
                    )
                tmp.write(chunk)

        if total == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The uploaded file is empty.",
            )

        # ---- malware scan, before anything reaches storage ------------------
        with open(tmp_path, "rb") as fh:
            scan = scanning.scan_stream(fh)

        if scan.scanner_unavailable:
            # Fail closed: an unscanned file must never reach storage.
            logger.error(
                "upload: scanner unavailable, refusing upload from user %s",
                current_user.id,
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Upload is temporarily unavailable. Please try again shortly.",
            )

        if scan.infected:
            # The threat name goes to the audit trail and the server log, never
            # to the client - naming the signature would let an attacker tune
            # their payload against our scanner.
            logger.warning(
                "upload: malware rejected for user %s: %s (%d bytes, %s)",
                current_user.id,
                scan.threat_name,
                total,
                audio.filename,
            )
            log_audit(
                db,
                actor=f"user:{current_user.id}",
                action="upload.rejected_malware",
                target_table="users",
                target_id=current_user.id,
                metadata={
                    "threat_name": scan.threat_name,
                    "filename": audio.filename,
                    "declared_content_type": declared,
                    "size_bytes": total,
                    "container": container,
                },
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This file was rejected by a security check.",
            )

        key = _storage_key(current_user.id, container or "webm")
        try:
            with open(tmp_path, "rb") as fh:
                storage.upload_video_stream(fh, key, content_type=declared)
        except storage.StorageError as exc:
            logger.error("upload: storage failed for user %s: %s", current_user.id, exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Could not store the recording. Please try again.",
            ) from exc

        submission = Submission(
            user_id=current_user.id,
            input_type=InputType.audio,
            video_path=key,
            status=SubmissionStatus.UPLOADED,
        )
        db.add(submission)
        try:
            db.commit()
        except Exception:
            # Do not leave an orphaned object behind if the row cannot be written.
            db.rollback()
            storage.delete_video(key)
            raise
        db.refresh(submission)

        logger.info(
            "upload: user=%s submission=%s key=%s bytes=%d container=%s",
            current_user.id,
            submission.id,
            key,
            total,
            container,
        )

        # Hand off to the async chain. Called after commit so the worker can
        # actually find the row; the response still reports UPLOADED, because
        # that is the state at the moment the request completes.
        start_pipeline(submission.id)

        return submission

    finally:
        # Always remove the local temp file, on success and on every error path.
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError as exc:  # pragma: no cover - unusual on POSIX
                logger.warning("upload: could not remove temp file %s: %s", tmp_path, exc)


@router.get("/{submission_id}", response_model=SubmissionDetailResponse)
def get_submission(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SubmissionDetailResponse:
    """Return the submission, including its match once one exists.

    The match is exposed as soon as it is written - the customer does not wait
    for the email. notify_task still sends that separately as the durable
    record; this is the fast path the dashboard polls.
    """
    submission = db.get(Submission, submission_id)
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found"
        )
    if submission.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Submission does not belong to the current user",
        )

    detail = SubmissionDetailResponse.model_validate(submission, from_attributes=True)

    problem = db.scalar(
        select(ExtractedProblemRow).where(
            ExtractedProblemRow.submission_id == submission_id
        )
    )
    if problem is not None:
        detail.category = problem.category
        detail.urgency = problem.urgency.value
        detail.location = problem.location

    match = db.scalar(
        select(Match)
        .where(Match.submission_id == submission_id)
        .order_by(Match.id.desc())
    )
    if match is not None:
        provider = (
            db.get(Provider, match.provider_id) if match.provider_id else None
        )
        detail.match = SubmissionMatch(
            id=match.id,
            match_type=match.match_type.value,
            solution_text=match.solution_text,
            needs_human_review=match.needs_human_review,
            provider=(
                MatchedProvider.model_validate(provider, from_attributes=True)
                if provider
                else None
            ),
        )

    return detail
