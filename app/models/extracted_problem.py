from __future__ import annotations

import enum
from typing import TYPE_CHECKING, Any, Dict

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.submission import Submission


class Urgency(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class ExtractedProblem(Base):
    __tablename__ = "extracted_problems"

    id: Mapped[int] = mapped_column(primary_key=True)
    # unique => strict one-to-one with Submission
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    category: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    problem_summary: Mapped[str] = mapped_column(Text, nullable=False)
    urgency: Mapped[Urgency] = mapped_column(
        Enum(Urgency, name="urgency_enum", native_enum=True), nullable=False
    )
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    budget: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raw_json: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False)

    submission: Mapped["Submission"] = relationship(back_populates="extracted_problem")

    def __repr__(self) -> str:
        return f"<ExtractedProblem id={self.id} category={self.category!r}>"
