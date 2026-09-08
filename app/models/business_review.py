from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.user import User


class BusinessReview(Base):
    """A customer's review of a listing, with an optional reply from the owner.

    NOT to be confused with ReviewQueue, which is the moderation queue for
    voice submissions. This codebase already used "review" to mean moderation,
    so this model and its table are named explicitly to keep the two apart.

    Unlike an enquiry, a review requires an account: `user_id` is NOT NULL, and
    one review per user per business is enforced by a unique constraint rather
    than by application logic, so a double-submit cannot slip through.
    """

    __tablename__ = "business_reviews"
    __table_args__ = (
        UniqueConstraint("business_id", "user_id", name="uq_business_reviews_author"),
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_business_reviews_rating"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # CASCADE: a deleted account's reviews go with it. Unlike a lead, a review
    # is public speech attributed to a person, so it should not outlive them.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)

    # One reply per review. Replying again overwrites, which is why the UI
    # hides the form once a reply exists rather than inviting an accidental
    # overwrite.
    owner_reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_replied_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

    business: Mapped["Business"] = relationship(back_populates="reviews")
    author: Mapped["User"] = relationship()

    def __repr__(self) -> str:
        return (
            f"<BusinessReview id={self.id} business={self.business_id} "
            f"rating={self.rating}>"
        )
