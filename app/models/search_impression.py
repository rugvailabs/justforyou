"""Search impressions: one row per listing shown in a page of search results.

Written for every search response that is displayed (see
app/services/search_analytics.py), and updated once if the person then opens,
calls or enquires from that result. From these come click-through rate per
tier, the numbers shown to a business owner about their own listing, and a
check that the Monthly rotation shares the top places fairly.

Privacy: the searcher's location is stored rounded to two decimal places
(roughly a kilometre), never as the precise point the browser sent, and the
user is linked only when they were signed in.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SearchImpression(Base):
    __tablename__ = "search_impressions"
    __table_args__ = (
        Index("ix_search_impressions_business_created", "business_id", "created_at"),
        Index("ix_search_impressions_search_business", "search_id", "business_id"),
        Index("ix_search_impressions_created", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # One per search response; every result on that page shares it.
    search_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    # 1-based place in the whole result set, across pages.
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    # placement.Tier: 1 annual, 2 monthly, 3 basic, 4 none.
    tier: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # Monthly only: whether it was one of this half hour's three leaders.
    in_rotation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # What was searched.
    query: Mapped[str | None] = mapped_column(String(128), nullable=True)
    category_slug: Mapped[str | None] = mapped_column(String(128), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sort: Mapped[str] = mapped_column(String(16), nullable=False)
    # Rounded to 0.01 degrees - see the module docstring.
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # The first click only: view, call or enquire.
    clicked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    click_action: Mapped[str | None] = mapped_column(String(16), nullable=True)

    def __repr__(self) -> str:
        return (
            f"<SearchImpression business={self.business_id} pos={self.position} "
            f"tier={self.tier} clicked={self.clicked_at is not None}>"
        )
