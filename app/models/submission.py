from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.extracted_problem import ExtractedProblem
    from app.models.match import Match
    from app.models.message_sent import MessageSent
    from app.models.review_queue import ReviewQueue
    from app.models.user import User


class InputType(str, enum.Enum):
    """How the caller described their problem."""

    #: Typed straight into the form; there is nothing to transcribe.
    text = "text"
    #: An uploaded audio recording that Whisper turns into a transcript.
    audio = "audio"


class SubmissionStatus(str, enum.Enum):
    #: Text arrived complete - no upload, no transcription, straight to
    #: extraction. Distinct from UPLOADED so the two paths stay legible.
    SUBMITTED = "SUBMITTED"
    UPLOADED = "UPLOADED"
    TRANSCRIBED = "TRANSCRIBED"
    EXTRACTED = "EXTRACTED"
    MATCHED = "MATCHED"
    SENT = "SENT"
    #: The answer passed the confidence gate and may be sent.
    SOLVED = "SOLVED"
    #: A human reviewed a held answer and released it.
    APPROVED = "APPROVED"
    #: Terminal until a human intervenes. The pipeline stopped on purpose -
    #: no audio, a corrupt file, or a transcript we do not trust - and there
    #: is a ReviewQueue row saying why.
    NEEDS_REVIEW = "NEEDS_REVIEW"


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (Index("ix_submissions_user_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    input_type: Mapped[InputType] = mapped_column(
        Enum(InputType, name="input_type_enum", native_enum=True),
        nullable=False,
        default=InputType.audio,
        server_default=InputType.audio.value,
    )
    # Object-storage key of the uploaded audio. NULL for text submissions, and
    # also NULL-in-effect once the recording is auto-deleted after
    # transcription (the key is kept as a record of what was stored).
    video_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    status: Mapped[SubmissionStatus] = mapped_column(
        Enum(SubmissionStatus, name="submission_status_enum", native_enum=True),
        nullable=False,
        default=SubmissionStatus.UPLOADED,
        server_default=SubmissionStatus.UPLOADED.value,
    )
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    language_detected: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="submissions")
    extracted_problem: Mapped[Optional["ExtractedProblem"]] = relationship(
        back_populates="submission", uselist=False, cascade="all, delete-orphan"
    )
    matches: Mapped[List["Match"]] = relationship(
        back_populates="submission", cascade="all, delete-orphan"
    )
    messages_sent: Mapped[List["MessageSent"]] = relationship(
        back_populates="submission", cascade="all, delete-orphan"
    )
    review_items: Mapped[List["ReviewQueue"]] = relationship(
        back_populates="submission", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Submission id={self.id} status={self.status}>"
