from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, List

from sqlalchemy import Boolean, DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.consent import Consent
    from app.models.submission import Submission


class PreferredContactMethod(str, enum.Enum):
    email = "email"
    sms = "sms"
    phone = "phone"


class UserRole(str, enum.Enum):
    """What a user is allowed to do beyond acting for themselves.

    Coexists with `is_admin` rather than replacing it: the submission review
    console and its require_admin dependency already gate on that boolean, and
    quietly re-pointing them at a new column risks locking moderators out of a
    live queue. `role` is backfilled to `admin` wherever is_admin is set, so
    the two agree; consolidate onto this column once the console is migrated.
    """

    customer = "customer"
    business_owner = "business_owner"
    admin = "admin"


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
    # Phase 1 scope: a single boolean, not a role system. Still the authority
    # for the submission review console - see UserRole.
    is_admin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role_enum", native_enum=True),
        nullable=False,
        default=UserRole.customer,
        server_default=UserRole.customer.value,
        index=True,
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
    # Listings this user owns. No cascade delete: a listing outliving its owner
    # is a moderation problem, not something to silently destroy.
    businesses: Mapped[List["Business"]] = relationship(
        back_populates="owner", foreign_keys="Business.owner_id"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"
