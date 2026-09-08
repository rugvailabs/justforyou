from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.category import Category


class Business(Base):
    """A listing in the public directory.

    Distinct from `providers`, which is the matching pool the submission
    pipeline routes problems to. That table has no address, coordinates or
    rating and is not meant to be browsed; conflating the two would couple the
    public directory to the pipeline's matching rules.
    """

    __tablename__ = "businesses"
    __table_args__ = (
        # Every list query filters on is_active, and most also order by rating.
        Index("ix_businesses_active_rating", "is_active", "rating"),
        # "near me" scans a lat/lng bounding box before the exact distance sort.
        Index("ix_businesses_lat_lng", "latitude", "longitude"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    province: Mapped[str] = mapped_column(String(2), nullable=False, server_default="ON")
    postal_code: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # Nullable because a listing can exist before it is geocoded; such rows are
    # simply excluded from radius searches rather than being sorted as if at 0,0.
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    website: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # NULL means "no ratings yet", which is not the same as 0.0 and must not be
    # filtered in by ?min_rating=0.
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    review_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    category: Mapped["Category"] = relationship(back_populates="businesses")

    def __repr__(self) -> str:
        return f"<Business id={self.id} slug={self.slug!r} city={self.city!r}>"
