"""Wire shapes for plans and subscriptions."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.subscription import BillingCycle, SubscriptionStatus


class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    billing_cycle: BillingCycle
    # Decimal in, JSON number out. The API states an amount and a currency
    # together, never a bare number - "19.99" means nothing without "CAD".
    amount: Decimal
    currency: str
    is_active: bool


class CheckoutRequest(BaseModel):
    business_id: int = Field(gt=0)
    plan_id: int = Field(gt=0)
    # Where the gateway sends the customer afterwards. Optional so the API is
    # usable from curl; a real client supplies its own pages.
    success_url: str | None = Field(default=None, max_length=1024)
    cancel_url: str | None = Field(default=None, max_length=1024)


class CheckoutSessionOut(BaseModel):
    """Where to send the customer to pay."""

    checkout_url: str
    session_id: str
    subscription_id: int
    # True when no gateway is configured: the subscription row is real and
    # sits in `incomplete`, but the URL is a placeholder and no money moves.
    stub: bool = False


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
