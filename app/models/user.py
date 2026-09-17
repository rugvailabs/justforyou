from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Any, List

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    SmallInteger,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
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
    # Digits-only form of `phone`. Added for phone one-time-code sign-in,
    # which has since been removed, so nothing writes it today and every row
    # is NULL for accounts created since.
    #
    # Kept rather than dropped because the reason it exists still holds:
    # `phone` is a display value arriving in mixed formats
    # ("+1-604-555-0101", "6045550101"), and the UNIQUE constraint here is
    # what would stop one person holding two accounts on one number. Signup
    # would have to populate it - and decide what happens on a collision -
    # before that means anything.
    phone_normalized: Mapped[str | None] = mapped_column(
        String(32), nullable=True, unique=True, index=True
    )
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

    # --- business registration (see app/api/v1/registration.py) -----------
    # False only for a business account part-way through registration: it can
    # sign in to finish, and nothing else (require_business_owner refuses it).
    # Every other account - customers, admins, owners from before the
    # registration flow - is active.
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    # The furthest registration step reached: 2 once the details are saved, 3
    # once a plan is chosen, 4 when complete. NULL for accounts that never went
    # through registration.
    registration_step: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    # The plan chosen in step 2, saved the moment "Select" is clicked.
    selected_plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("plans.id", ondelete="SET NULL"), nullable=True
    )
    # Step 1's business details, held here until registration completes and
    # the listing is created from them - so an abandoned registration never
    # puts a half-finished business in front of moderators.
    registration_data: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True
    )
    registration_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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
