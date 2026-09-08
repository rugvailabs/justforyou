"""Plans and subscriptions.

Scaffolding for paid listings, built so that money can be switched on later
without a schema change. Nothing in the directory reads these tables yet:
search visibility depends on moderation and KYC, never on whether a business
pays (see search_businesses()).

The gateway columns are named `gateway_*` rather than `stripe_*` on the
Subscription because the row is the local record of an arrangement; which
processor holds the other end of it is an implementation detail that may change.
Plan.stripe_price_id keeps its vendor name because a Price ID is a Stripe
object with no generic equivalent - renaming it would only hide where it comes
from.
"""

from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.business import Business


class BillingCycle(str, enum.Enum):
    monthly = "monthly"
    yearly = "yearly"


class SubscriptionStatus(str, enum.Enum):
    """Mirrors the Stripe subscription statuses this app acts on.

    `incomplete` is the state a row is created in - the checkout session
    exists, nobody has paid yet. It becomes `active` only when the gateway says
    so, never because the client claimed success on its return URL.
    """

    incomplete = "incomplete"
    active = "active"
    past_due = "past_due"
    canceled = "canceled"


class Plan(Base):
    """A purchasable plan."""

    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    billing_cycle: Mapped[BillingCycle] = mapped_column(
        Enum(BillingCycle, name="billing_cycle_enum", native_enum=True),
        nullable=False,
    )
    # Numeric, never float: 19.99 has no exact binary representation, and money
    # that drifts by a cent per operation is a bug you find in an audit. This
    # reads back as Decimal, which the schema serialises as a JSON number.
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, server_default="CAD"
    )
    # The Stripe Price this plan maps to. Nullable while running in stub mode:
    # the plans are real rows and the endpoints work, there is simply no Stripe
    # account behind them yet.
    stripe_price_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Retiring a plan must not delete it - existing subscriptions still point
    # at it, and last year's price is part of the record.
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    subscriptions: Mapped[list["Subscription"]] = relationship(back_populates="plan")

    def __repr__(self) -> str:
        return f"<Plan id={self.id} name={self.name!r} cycle={self.billing_cycle.value}>"


class Subscription(Base):
    """One business's arrangement to pay for a plan."""

    __tablename__ = "subscriptions"
    __table_args__ = (
        Index("ix_subscriptions_business_status", "business_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # RESTRICT: a plan with subscribers cannot be deleted out from under them.
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status_enum", native_enum=True),
        nullable=False,
        default=SubscriptionStatus.incomplete,
        server_default=SubscriptionStatus.incomplete.value,
        index=True,
    )

    # Gateway handles. Nullable in stub mode, and nullable in production too
    # until the customer has actually reached the gateway.
    gateway_customer_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    gateway_subscription_id: Mapped[str | None] = mapped_column(
        String(128), nullable=True, unique=True
    )
    # The checkout session that created this row, kept so a webhook arriving
    # before the customer returns can find the subscription it belongs to.
    gateway_checkout_session_id: Mapped[str | None] = mapped_column(
        String(128), nullable=True, index=True
    )

    # What the gateway says the paid-up-to date is. Never computed locally:
    # proration, trials and dunning all move it, and the gateway is the only
    # thing that knows.
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    canceled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    business: Mapped["Business"] = relationship(back_populates="subscriptions")
    plan: Mapped["Plan"] = relationship(back_populates="subscriptions")

    def __repr__(self) -> str:
        return (
            f"<Subscription id={self.id} business_id={self.business_id} "
            f"status={self.status.value}>"
        )
