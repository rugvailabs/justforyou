"""transcribe_task's failure routing.

The task is the component that turns transcription's exception contract into
outcomes: TRANSCRIBED + raw audio deleted + chained to extraction, or
NEEDS_REVIEW + a ReviewQueue row and no chaining.

The Celery worker normally builds its own session against the development
database, so SessionLocal is redirected at the scratch test database here.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password
from app.models.audit_log import AuditLog
from app.models.review_queue import ReviewQueue
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.schemas.service_results import TranscriptResult
from app.services.storage import StorageError
from app.services.transcription import AudioDecodeError, NeedsReviewError
from app.workers import tasks

GOOD = TranscriptResult(
    transcript="My kitchen sink has been leaking for two days.",
    language_detected="en",
    duration_seconds=12.0,
    language_confidence=0.94,
)


@pytest.fixture()
def task_env(monkeypatch, test_engine, unique_email):
    """Point the task at the test DB and stub out its collaborators."""
    Session = sessionmaker(bind=test_engine, autoflush=False, future=True)
    monkeypatch.setattr(tasks, "SessionLocal", Session)

    deleted: list[str] = []
    chained: list[int] = []
    monkeypatch.setattr(tasks.storage, "delete_video", lambda key: deleted.append(key) or True)
    monkeypatch.setattr(tasks.extract_task, "delay", lambda sid: chained.append(sid))

    with Session() as db:
        user = User(
            name="Task Tester",
            email=unique_email,
            hashed_password=hash_password("tasktest1234"),
        )
        db.add(user)
        db.flush()
        submission = Submission(
            user_id=user.id,
            video_path=f"audio/{user.id}/clip.mp3",
            status=SubmissionStatus.UPLOADED,
        )
        db.add(submission)
        db.commit()
        sid, key = submission.id, submission.video_path

    yield {
        "session": Session,
        "submission_id": sid,
        "key": key,
        "deleted": deleted,
        "chained": chained,
    }


def _row(Session, submission_id: int) -> Submission:
    with Session() as db:
        return db.get(Submission, submission_id)


def _reviews(Session, submission_id: int) -> list[ReviewQueue]:
    with Session() as db:
        return list(
            db.scalars(
                select(ReviewQueue).where(ReviewQueue.submission_id == submission_id)
            )
        )


# --------------------------------------------------------------------------
# success
# --------------------------------------------------------------------------
def test_success_transcribes_deletes_and_chains(monkeypatch, task_env) -> None:
    monkeypatch.setattr(tasks.transcription, "transcribe", lambda key: GOOD)

    tasks.transcribe_task.apply(args=[task_env["submission_id"]])

    row = _row(task_env["session"], task_env["submission_id"])
    assert row.status is SubmissionStatus.TRANSCRIBED
    assert row.transcript == GOOD.transcript
    assert row.language_detected == "en"

    # Raw audio removed immediately, not left for a sweep.
    assert task_env["deleted"] == [task_env["key"]]
    # And the chain continues.
    assert task_env["chained"] == [task_env["submission_id"]]
    assert _reviews(task_env["session"], task_env["submission_id"]) == []


def test_success_writes_a_video_auto_deleted_audit_row(monkeypatch, task_env) -> None:
    monkeypatch.setattr(tasks.transcription, "transcribe", lambda key: GOOD)

    tasks.transcribe_task.apply(args=[task_env["submission_id"]])

    with task_env["session"]() as db:
        row = db.scalar(
            select(AuditLog)
            .where(
                AuditLog.action == "video.auto_deleted",
                AuditLog.target_id == task_env["submission_id"],
            )
            .order_by(AuditLog.id.desc())
        )

    assert row is not None
    assert row.actor == "system"
    assert row.target_table == "submissions"
    assert row.meta["storage_key"] == task_env["key"]
    assert row.meta["trigger"] == "transcription_complete"


# --------------------------------------------------------------------------
# permanent failures -> NEEDS_REVIEW, no retry, no chaining, video kept
# --------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("error", "expected_code"),
    [
        (AudioDecodeError("Could not decode clip.mp3"), "audio_decode_failed"),
        (
            NeedsReviewError("transcription_low_confidence", "confidence 0.2 < 0.5"),
            "transcription_low_confidence",
        ),
    ],
)
def test_permanent_failures_land_in_review(
    monkeypatch, task_env, error: Exception, expected_code: str
) -> None:
    def _raise(_key):
        raise error

    monkeypatch.setattr(tasks.transcription, "transcribe", _raise)

    tasks.transcribe_task.apply(args=[task_env["submission_id"]])

    row = _row(task_env["session"], task_env["submission_id"])
    assert row.status is SubmissionStatus.NEEDS_REVIEW

    reviews = _reviews(task_env["session"], task_env["submission_id"])
    assert len(reviews) == 1
    assert reviews[0].reason.startswith(expected_code)

    # Nothing downstream, and the video is kept so a human can listen to it.
    assert task_env["chained"] == []
    assert task_env["deleted"] == []


def test_review_path_leaves_the_transcript_empty(monkeypatch, task_env) -> None:
    def _raise(_key):
        raise AudioDecodeError("undecodable")

    monkeypatch.setattr(tasks.transcription, "transcribe", _raise)

    tasks.transcribe_task.apply(args=[task_env["submission_id"]])

    row = _row(task_env["session"], task_env["submission_id"])
    assert not (row.transcript or "")


# --------------------------------------------------------------------------
# transient failures -> retried, not parked
# --------------------------------------------------------------------------
def test_transient_failure_is_retried_not_reviewed(monkeypatch, task_env) -> None:
    """A storage blip must not strand the submission in NEEDS_REVIEW."""
    attempts: list[int] = []

    def _raise(_key):
        attempts.append(1)
        raise StorageError("connection reset")

    monkeypatch.setattr(tasks.transcription, "transcribe", _raise)

    # In eager mode self.retry() surfaces as an exception rather than
    # re-queueing, which is exactly the signal we want to assert on.
    result = tasks.transcribe_task.apply(args=[task_env["submission_id"]])

    assert attempts, "transcribe was never called"
    assert result.failed() or result.state in {"RETRY", "FAILURE"}

    row = _row(task_env["session"], task_env["submission_id"])
    assert row.status is SubmissionStatus.UPLOADED
    assert task_env["deleted"] == []
    assert task_env["chained"] == []
