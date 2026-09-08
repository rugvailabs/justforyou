from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, List

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.business import Business


class Category(Base):
    """A directory category, e.g. "Plumbers".

    Self-referencing via `parent_id` so the taxonomy can be nested later. The
    seed taxonomy is deliberately flat - every seeded row is a root - but the
    column and the ?parent_id filter are here so sub-categories need no schema
    change.
    """

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    # URL-safe identifier. The public key used by ?category_slug=.
    slug: Mapped[str] = mapped_column(
        String(128), nullable=False, unique=True, index=True
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=True, index=True
    )
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Emoji or icon name, rendered by the front end's category grid.
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Display order for the category grid; ties broken by name.
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    parent: Mapped["Category | None"] = relationship(
        back_populates="children", remote_side="Category.id"
    )
    children: Mapped[List["Category"]] = relationship(
        back_populates="parent", cascade="all, delete-orphan"
    )
    businesses: Mapped[List["Business"]] = relationship(back_populates="category")

    def __repr__(self) -> str:
        return f"<Category id={self.id} slug={self.slug!r}>"
