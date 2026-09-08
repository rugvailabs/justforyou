from __future__ import annotations

import enum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Enum, Float, ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.provider import Provider
    from app.models.submission import Submission


class MatchType(str, enum.Enum):
    provider = "provider"
    ai_generated = "ai_generated"


class Match(Base):
    __tablename__ = "matches"
    __table_args__ = (Index("ix_matches_submission_id", "submission_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False
    )
    # nullable: an ai_generated match has no provider behind it
    provider_id: Mapped[int | None] = mapped_column(
        ForeignKey("providers.id", ondelete="SET NULL"), nullable=True
    )
    solution_text: Mapped[str] = mapped_column(Text, nullable=False)
    match_type: Mapped[MatchType] = mapped_column(
        Enum(MatchType, name="match_type_enum", native_enum=True), nullable=False
    )
    #: The full generated Solution, exactly as produced. Keeps the structured
    #: steps, caveats, cost estimate and the generator's self-assessment, which
    #: solution_text flattens away and the confidence gate needs.
    solution_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    #: Confidence the gate assigned, 0-1. Null when the gate never ran.
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    #: The full gate decision: per-check results, reasons, judge reasoning.
    gate_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    needs_human_review: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    submission: Mapped["Submission"] = relationship(back_populates="matches")
    provider: Mapped[Optional["Provider"]] = relationship(back_populates="matches")

    def __repr__(self) -> str:
        return f"<Match id={self.id} type={self.match_type}>"
