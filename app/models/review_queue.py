from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

import enum

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.submission import Submission


class ReviewDecision(str, enum.Enum):
    """What a reviewer did with a held ticket."""

    #: Released to the customer, either as written or after editing.
    approved = "approved"
    #: Not fit to send and not fixable here.
    rejected = "rejected"
    #: We need something from the customer before this can be answered.
    info_requested = "info_requested"


class ReviewQueue(Base):
    __tablename__ = "review_queue"
    __table_args__ = (Index("ix_review_queue_submission_id", "submission_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    assigned_to: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # --- claiming: stops two reviewers editing the same answer -------------
    claimed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # --- the decision, and who made it ------------------------------------
    decision: Mapped[ReviewDecision | None] = mapped_column(
        Enum(ReviewDecision, name="review_decision_enum", native_enum=True),
        nullable=True,
    )
    decided_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reviewer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: The answer as the AI wrote it, kept when a reviewer edits it. This pair
    #: is the training signal for Phase 12 and the accountability record for
    #: PIPEDA - without it there is no way to say what a human changed.
    original_solution_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    submission: Mapped["Submission"] = relationship(back_populates="review_items")

    def __repr__(self) -> str:
        return f"<ReviewQueue id={self.id} reason={self.reason!r}>"
