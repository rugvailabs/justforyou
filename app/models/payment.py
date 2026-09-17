"""Payments: the receipt-level record of money taken for a subscription.

One row per successful charge. It keeps what a Canadian receipt has to state
- the amount before tax, each tax by name and rate, the total, the currency
and the province the tax was charged for - as they were at the time, because
a later change to a plan price or a tax rate must not rewrite a receipt that
was already issued.

Card details are never stored: the brand and last four digits are what a
receipt shows, and all this app ever needs.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.subscription import Plan, Subscription
    from app.models.user import User


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Human-facing and unique: "JFY-2026-000042".
    receipt_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # RESTRICT: a receipt outlives nothing it refers to being deleted.
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False
    )
    subscription_id: Mapped[int | None] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="SET NULL"), nullable=True, index=True
    )

    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    tax_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # [{"name": "HST", "rate": "13", "amount": "3.77"}] - strings, so no float
    # ever touches an amount on its way through JSON.
    tax_lines: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    province: Mapped[str] = mapped_column(String(2), nullable=False)

    gateway: Mapped[str] = mapped_column(String(32), nullable=False)
    gateway_payment_id: Mapped[str] = mapped_column(String(128), nullable=False)
    card_brand: Mapped[str | None] = mapped_column(String(32), nullable=True)
    card_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)

    # When the customer accepted the terms and the automatic renewal - the
    # consent a recurring charge rests on.
    terms_accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user: Mapped["User"] = relationship()
    plan: Mapped["Plan"] = relationship()
    subscription: Mapped["Subscription | None"] = relationship()

    def __repr__(self) -> str:
        return f"<Payment {self.receipt_number} total={self.total} {self.currency}>"
