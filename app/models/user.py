from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, List

from sqlalchemy import Boolean, DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.consent import Consent
    from app.models.submission import Submission


class PreferredContactMethod(str, enum.Enum):
    email = "email"
    sms = "sms"
    phone = "phone"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(
        String(320), nullable=False, unique=True, index=True
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    preferred_contact_method: Mapped[PreferredContactMethod] = mapped_column(
        Enum(
            PreferredContactMethod,
            name="preferred_contact_method_enum",
            native_enum=True,
        ),
        nullable=False,
        default=PreferredContactMethod.email,
    )
    # Phase 1 scope: a single boolean, not a role system.
    is_admin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    consents: Mapped[List["Consent"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    submissions: Mapped[List["Submission"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"
