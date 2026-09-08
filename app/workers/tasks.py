"""Celery pipeline tasks.

Each task does exactly four things: fetch the DB rows it needs, call one
service function, persist the typed result, and chain to the next task. All
business logic lives in app/services/ - Phases 3-7 change those modules and
leave this file alone.

Each task owns its own DB session; sessions are never shared across tasks
because tasks may run in different worker processes.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator

from celery.exceptions import MaxRetriesExceededError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import log_audit
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.models.extracted_problem import ExtractedProblem as ExtractedProblemRow
from app.models.extracted_problem import Urgency
from app.models.match import Match, MatchType
from app.models.message_sent import MessageChannel, MessageSent, MessageStatus
from app.models.provider import Provider
from app.models.review_queue import ReviewQueue
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.schemas.service_results import ExtractedProblem as ExtractedProblemData
from app.services import (
    extraction,
    matching,
    notification,
    quality,
    solving,
    storage,
    transcription,
)
from app.services.llm import LLMUnavailable
from app.services.transcription import AudioDecodeError, NeedsReviewError
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

RETRY_COUNTDOWN_SECONDS = 5

# Give the task meaningfully longer than the service's own decode deadline, so
# the graceful partial-transcript path wins under normal circumstances.
TRANSCRIBE_SOFT_TIME_LIMIT = get_settings().whisper_timeout_seconds + 120
TRANSCRIBE_HARD_TIME_LIMIT = TRANSCRIBE_SOFT_TIME_LIMIT + 60


@contextmanager
def task_session() -> Iterator[Session]:
    """A DB session scoped to a single task run, rolled back on error."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _load(db: Session, submission_id: int) -> Submission:
    submission = db.get(Submission, submission_id)
    if submission is None:
        # A missing row will never appear on retry, so fail loudly instead.
        raise ValueError(f"Submission {submission_id} does not exist")
    return submission


def _flag_for_review(submission_id: int, reason_code: str, detail: str) -> None:
    """Park a submission for a human: ReviewQueue row + NEEDS_REVIEW status.

    Uses its own session so it works from an exception handler after the
    task's own session has been rolled back and closed.
    """
    with task_session() as db:
        submission = db.get(Submission, submission_id)
        if submission is not None:
            submission.status = SubmissionStatus.NEEDS_REVIEW
        db.add(
            ReviewQueue(
                submission_id=submission_id,
                reason=f"{reason_code}: {detail}"[:255],
            )
        )
        db.commit()
    logger.warning(
        "[transcribe] submission %s -> NEEDS_REVIEW (%s): %s",
        submission_id,
        reason_code,
        detail,
    )


@celery_app.task(
    bind=True,
    max_retries=3,
    # Hard backstop against a wedged decode. transcribe() enforces its own
    # wall-clock deadline first; these limits only fire if something hangs
    # below that, and time_limit kills the child so a bad video can never own
    # a worker slot forever.
    soft_time_limit=TRANSCRIBE_SOFT_TIME_LIMIT,
    time_limit=TRANSCRIBE_HARD_TIME_LIMIT,
)
def transcribe_task(self, submission_id: int) -> int:
    """Transcribe a submission, then hand off to extraction.

    Failure routing, which is the whole point of this task:

      permanent -> ReviewQueue + NEEDS_REVIEW, no retry, chain stops
        AudioDecodeError "audio_decode_failed"
        NeedsReviewError "transcription_low_confidence"

      transient -> self.retry(countdown=5), up to 3 attempts
        StorageError, TranscriptionTimeout, ffmpeg/CTranslate2 crashes,
        disk-full, soft time limit

    Exhausting the retries also lands in ReviewQueue, so a submission can never
    be left silently stuck in UPLOADED.
    """
    try:
        with task_session() as db:
            submission = _load(db, submission_id)
            storage_key = submission.video_path

            result = transcription.transcribe(storage_key or "")

            submission.transcript = result.transcript
            submission.language_detected = result.language_detected
            submission.status = SubmissionStatus.TRANSCRIBED
            db.commit()

            # Raw video is deleted the moment the transcript is safely stored -
            # it is the most sensitive artefact we hold and nothing downstream
            # needs it. Not deferred to a Beat sweep, so the retention window is
            # seconds rather than hours.
            if storage_key and storage.delete_video(storage_key):
                log_audit(
                    db,
                    actor="system",
                    action="video.auto_deleted",
                    target_table="submissions",
                    target_id=submission_id,
                    metadata={
                        "storage_key": storage_key,
                        "trigger": "transcription_complete",
                        "language_detected": result.language_detected,
                    },
                )

    # --- permanent: straight to review, never retried -----------------------
    except AudioDecodeError as e:
        _flag_for_review(submission_id, "audio_decode_failed", str(e))
        return submission_id
    except NeedsReviewError as e:
        _flag_for_review(submission_id, e.reason_code, str(e))
        return submission_id

    # --- transient: retry, and escalate once the budget is spent ------------
    # SoftTimeLimitExceeded is an Exception subclass, so this covers the worker
    # time limit as well as ffmpeg/CTranslate2 crashes, disk-full and storage
    # blips. self.retry() raises Retry from inside this handler, which
    # propagates rather than being re-caught here.
    except Exception as e:
        try:
            raise self.retry(exc=e, countdown=RETRY_COUNTDOWN_SECONDS)
        except MaxRetriesExceededError:
            _flag_for_review(
                submission_id,
                "transcription_failed",
                f"Gave up after {self.max_retries} retries: {e}",
            )
            return submission_id

    extract_task.delay(submission_id)
    return submission_id


@celery_app.task(bind=True, max_retries=3)
def extract_task(self, submission_id: int) -> int:
    """Understand the request, then hand off to matching.

    Mirrors transcribe_task's routing: a model that declines or is not
    configured is permanent and goes to review; a rate limit or server error is
    transient and retries.
    """
    try:
        with task_session() as db:
            submission = _load(db, submission_id)
            result = extraction.extract_problem(submission.transcript or "")

            # extracted_problems.submission_id is UNIQUE (one-to-one), so a
            # retry or a re-triggered pipeline updates the row in place rather
            # than colliding on the constraint.
            row = db.scalar(
                select(ExtractedProblemRow).where(
                    ExtractedProblemRow.submission_id == submission_id
                )
            )
            if row is None:
                row = ExtractedProblemRow(submission_id=submission_id)
                db.add(row)

            row.category = result.category
            row.problem_summary = result.problem_summary
            row.urgency = Urgency(result.urgency)
            row.location = result.location
            row.budget = result.budget
            row.raw_json = result.raw_json

            submission.status = SubmissionStatus.EXTRACTED
            db.commit()

    except LLMUnavailable as e:
        # No credentials, or the model declined. Retrying changes nothing.
        _flag_for_review(submission_id, "extraction_unavailable", str(e))
        return submission_id
    except Exception as e:
        try:
            raise self.retry(exc=e, countdown=RETRY_COUNTDOWN_SECONDS)
        except MaxRetriesExceededError:
            _flag_for_review(
                submission_id,
                "extraction_failed",
                f"Gave up after {self.max_retries} retries: {e}",
            )
            return submission_id

    match_task.delay(submission_id)
    return submission_id


@celery_app.task(bind=True, max_retries=3)
def match_task(self, submission_id: int) -> int:
    """Retrieve candidate providers, generate a solution, persist it.

    The provider lookup no longer produces the answer - it produces the context
    the solver is allowed to draw on. Whether the answer is fit to send is
    decided downstream.
    """
    try:
        with task_session() as db:
            submission = _load(db, submission_id)
            row = db.scalar(
                select(ExtractedProblemRow).where(
                    ExtractedProblemRow.submission_id == submission_id
                )
            )
            if row is None:
                raise ValueError(
                    f"Submission {submission_id} has no extracted problem"
                )

            # Hand the services the transport shape, not the ORM row.
            problem = ExtractedProblemData(
                category=row.category,
                problem_summary=row.problem_summary,
                urgency=row.urgency.value,
                location=row.location,
                budget=row.budget,
                raw_json=row.raw_json or {},
            )

            candidates = matching.find_candidates(db, problem)
            solution = solving.generate_solution(problem, candidates)

            # The gate decides whether this may reach a customer unread. It
            # never raises: any failure to evaluate is a decision to hold.
            provider_lines = chr(10).join(
                f"- id={p.id} | {p.name} | {p.category} | {p.region}"
                for p in candidates
            )
            decision = quality.evaluate(solution, problem, provider_lines)

            referenced = solution.result.referenced_provider_ids
            db.add(
                Match(
                    submission_id=submission_id,
                    provider_id=referenced[0] if referenced else None,
                    solution_text=solution.as_text(),
                    solution_json=solving.to_storage_json(solution),
                    match_type=MatchType(solution.match_type),
                    confidence=decision.confidence,
                    gate_json=quality.as_storage_json(decision),
                    needs_human_review=not decision.passed,
                )
            )

            if decision.passed:
                submission.status = SubmissionStatus.SOLVED
            else:
                submission.status = SubmissionStatus.NEEDS_REVIEW
                db.add(
                    ReviewQueue(
                        submission_id=submission_id,
                        reason=f"{decision.reason_code}: {decision.summary()}"[:255],
                    )
                )
            db.commit()
            gate_passed = decision.passed

    except LLMUnavailable as e:
        _flag_for_review(submission_id, "solving_unavailable", str(e))
        return submission_id
    except Exception as e:
        try:
            raise self.retry(exc=e, countdown=RETRY_COUNTDOWN_SECONDS)
        except MaxRetriesExceededError:
            _flag_for_review(
                submission_id,
                "solving_failed",
                f"Gave up after {self.max_retries} retries: {e}",
            )
            return submission_id

    # This branch is the product's central promise: an answer that did not
    # clear the gate is never sent. It waits for a human.
    if gate_passed:
        notify_task.delay(submission_id)
    else:
        logger.warning(
            "[match] submission %s held for review, nothing sent", submission_id
        )
    return submission_id


@celery_app.task(bind=True, max_retries=3)
def notify_task(self, submission_id: int) -> int:
    """Send the match on the customer's preferred channel.

    The in-app result is already visible by the time this runs - GET
    /submissions/{id} exposes the Match as soon as status reaches MATCHED.
    This task is the durable, CASL-compliant record of what was actually sent,
    which is why it writes a MessageSent row carrying the consent id that
    authorised it.
    """
    try:
        with task_session() as db:
            submission = _load(db, submission_id)
            user = db.get(User, submission.user_id)
            if user is None:
                raise ValueError(f"Submission {submission_id} has no user")

            match = db.scalar(
                select(Match)
                .where(Match.submission_id == submission_id)
                .order_by(Match.id.desc())
            )
            problem = db.scalar(
                select(ExtractedProblemRow).where(
                    ExtractedProblemRow.submission_id == submission_id
                )
            )
            provider = (
                db.get(Provider, match.provider_id)
                if match and match.provider_id
                else None
            )

            # Belt and braces: notify_task is only reached from SOLVED or
            # APPROVED, but a stray retry or a manual re-queue must not become
            # a delivery of un-cleared advice.
            if submission.status not in (
                SubmissionStatus.SOLVED,
                SubmissionStatus.APPROVED,
            ):
                logger.error(
                    "[notify] refusing to send submission %s in status %s - "
                    "only SOLVED or APPROVED may be delivered",
                    submission_id,
                    submission.status.value,
                )
                return submission_id

            channel = notification.channel_for(user)
            payload = notification.SolutionPayload(
                submission_id=submission_id,
                solution_text=match.solution_text if match else "",
                provider_name=provider.name if provider else None,
                provider_contact=(
                    (provider.contact_phone or provider.contact_email)
                    if provider
                    else None
                ),
                category=problem.category if problem else None,
            )

            result = notification.send_solution(
                db, submission_id, channel, user=user, payload=payload
            )

            # The consent that authorised the send is the audit trail a CASL
            # complaint is answered with, so the row is only written when one
            # exists.
            consent = notification.active_consent(db, user.id, channel)
            if consent is not None:
                db.add(
                    MessageSent(
                        submission_id=submission_id,
                        channel=MessageChannel(result.channel),
                        recipient=result.recipient,
                        sent_at=datetime.now(timezone.utc) if result.success else None,
                        casl_consent_id=consent.id,
                        status=(
                            MessageStatus.sent if result.success else MessageStatus.failed
                        ),
                    )
                )

            if result.success:
                submission.status = SubmissionStatus.SENT
                delivered = True
            else:
                # Delivery did not happen for a reason retrying will not fix
                # (no consent, no address, a hard bounce). The customer can
                # still see the match in the app; a human picks up the rest.
                db.add(
                    ReviewQueue(
                        submission_id=submission_id,
                        reason=f"{result.channel} delivery failed: "
                        f"{result.error or 'unknown error'}",
                        assigned_to=None,
                        resolved_at=None,
                    )
                )
                delivered = False
            db.commit()
    except Exception as e:
        raise self.retry(exc=e, countdown=RETRY_COUNTDOWN_SECONDS)

    if delivered:
        logger.info("[notify] pipeline complete for submission %s", submission_id)
    else:
        logger.warning(
            "[notify] submission %s routed to review queue", submission_id
        )
    return submission_id


def start_pipeline(submission_id: int):
    """Kick off the full chain. Called by the API after a submission is stored."""
    return transcribe_task.delay(submission_id)


__all__ = [
    "transcribe_task",
    "extract_task",
    "match_task",
    "notify_task",
    "start_pipeline",
]
