"""Wire shapes for plans and subscriptions."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.subscription import BillingCycle, SubscriptionStatus


class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    details: str | None = None
    badge: str | None = None
    # [{"label": ..., "status": "included" | "coming_soon"}], most important first.
    features: list[dict[str, Any]] = Field(default_factory=list)
    benefits: list[str] = Field(default_factory=list)
    sort_order: int = 0
    billing_cycle: BillingCycle
    # Decimal in, JSON number out. The API states an amount and a currency
    # together, never a bare number - "19.99" means nothing without "CAD".
    amount: Decimal
    currency: str
    is_active: bool

    @field_validator("features", "benefits", mode="before")
    @classmethod
    def _none_is_empty(cls, value: Any) -> Any:
        # Plans created before these columns existed read back NULL.
        return [] if value is None else value


class PaymentConfigOut(BaseModel):
    """How a client should take payment right now.

    `stub`: no gateway is configured - collect a test card with the app's own
    form and POST it to /subscriptions/{id}/stub-payment.
    `stripe`: send the customer to the checkout_url from /subscriptions/checkout.
    """

    mode: Literal["stub", "stripe"]
    # Empty in stub mode. Publishable by definition - safe to hand a browser.
    publishable_key: str = ""


class CheckoutRequest(BaseModel):
    business_id: int = Field(gt=0)
    plan_id: int = Field(gt=0)
    # Where the gateway sends the customer afterwards. Optional so the API is
    # usable from curl; a real client supplies its own pages.
    success_url: str | None = Field(default=None, max_length=1024)
    cancel_url: str | None = Field(default=None, max_length=1024)


class CheckoutSessionOut(BaseModel):
    """Where to send the customer to pay - or that there is nothing to pay."""

    checkout_url: str
    # None for a free plan: no gateway session was opened.
    session_id: str | None
    subscription_id: int
    status: SubscriptionStatus
    # False for a free plan, which is active the moment it is chosen.
    requires_payment: bool = True
    # True when no gateway is configured: the subscription row is real and
    # sits in `incomplete`, but the URL is a placeholder and no money moves.
    # The client takes the payment with its test card form instead.
    stub: bool = False


class StubPaymentRequest(BaseModel):
    """A card from the test checkout form. Stub mode only.

    Plain strings with generous limits rather than strict patterns: a
    malformed card is answered as a decline with a readable message, the way a
    payment page would, instead of a 422 that echoes the input back.
    """

    card_number: str = Field(min_length=1, max_length=32)
    exp_month: int = Field(ge=0, le=99)
    exp_year: int = Field(ge=0, le=9999)
    cvc: str = Field(min_length=1, max_length=8)
    cardholder_name: str | None = Field(default=None, max_length=255)


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    plan_id: int
    status: SubscriptionStatus
    current_period_end: datetime | None
    canceled_at: datetime | None
    created_at: datetime
    # Flattened so a client showing "Pro, $49.99/yr" needs one request.
    plan: PlanOut


class WebhookAck(BaseModel):
    """What the gateway gets back.

    `handled` is false for event types this app does not act on. Those are
    still a 200 - telling Stripe an event failed makes it retry something we
    deliberately ignore.
    """

    received: bool = True
    handled: bool = False
    event_type: str | None = None
