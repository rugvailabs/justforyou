from __future__ import annotations

from typing import TYPE_CHECKING, List

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.match import Match


class Provider(Base):
    __tablename__ = "providers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    region: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    contact_email: Mapped[str] = mapped_column(String(320), nullable=False)
    contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    matches: Mapped[List["Match"]] = relationship(back_populates="provider")

    def __repr__(self) -> str:
        return f"<Provider id={self.id} name={self.name!r} category={self.category!r}>"
