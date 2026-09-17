"""Payment gateway, Stripe-shaped, with a working stub underneath.

This module is the only place that knows a payment processor exists. The
routers deal in local rows and the three functions below; swapping Stripe for
another processor should touch this file and nothing else.

STUB MODE. With STRIPE_SECRET_KEY unset - the default - every function returns
a plausible placeholder instead of calling out. That is not a mock for tests:
it is how the feature ships until someone opens a Stripe account. The
endpoints are real, the subscription rows are real and move through their
states, and the only thing missing is the money.

Each function documents the exact `stripe.*` call that replaces its stub body,
so switching over is a matter of filling in the marked block and adding the
`stripe` package to requirements - not redesigning the flow.

Two things the stub deliberately gets right, because getting them wrong later
is expensive:

  - Identifiers look like Stripe's (`cs_test_...`, `sub_...`), so anything that
    stores or logs them is exercised on realistic data.
  - The webhook signature check fails closed. With no secret configured it
    accepts only in a non-production environment, and never silently in one.

TEST CHECKOUT. In stub mode there is no hosted payment page to send anyone to,
so charge_stub_card() stands in for one: it takes a card from the app's own test
form and answers the way Stripe's test cards do (4242... succeeds, 4000...0002
declines, and so on). It accepts ONLY those published test numbers - a real
card number is declined, never "charged" - and it refuses to run at all once a
real gateway is configured or in production. With Stripe wired up the card
never touches this server: the customer pays on Stripe's page and the webhook
activates the subscription.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets
import time
from calendar import monthrange
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# How long Stripe's own tolerance window is for a webhook timestamp. Replaying
# a captured request an hour later must not be accepted.
WEBHOOK_TOLERANCE_SECONDS = 300


class PaymentGatewayError(RuntimeError):
    """Raised when the gateway rejects a call or cannot be reached."""


class PaymentDeclined(PaymentGatewayError):
    """The card was refused. The message is safe to show the customer."""


@dataclass(frozen=True)
class StubCharge:
    """A successful test-mode payment."""

    gateway_subscription_id: str
    # The charge itself, as a receipt refers to it ("pi_..." at Stripe).
    payment_id: str
    brand: str
    last4: str
    current_period_end: datetime


# Stripe's published test cards and what each one does. None means success.
# Anything not listed is declined: this form must never appear to accept a
# real card.
STUB_TEST_CARDS: dict[str, str | None] = {
    "4242424242424242": None,
    "5555555555554444": None,
    "4000000000000002": "Your card was declined.",
    "4000000000009995": "Your card has insufficient funds.",
    "4000000000000069": "Your card has expired.",
    "4000000000000127": "Your card's security code is incorrect.",
}


@dataclass(frozen=True)
class CheckoutSession:
    """What the caller needs to send a customer to pay."""

    session_id: str
    url: str
    customer_id: str | None
    #: True when no gateway is configured and this session is a placeholder.
    stub: bool


@dataclass(frozen=True)
class WebhookEvent:
    """A verified event from the gateway."""

    event_id: str
    event_type: str
    data: dict[str, Any]
    stub: bool


def gateway_configured() -> bool:
    """True when a real Stripe key is present."""
    return bool(get_settings().stripe_secret_key)


def publishable_key() -> str:
    """The key a client needs to mount Stripe.js. Empty in stub mode."""
    return get_settings().stripe_publishable_key


def create_checkout_session(
    *,
    business_id: int,
    plan_price_id: str | None,
    customer_email: str | None,
    success_url: str,
    cancel_url: str,
    metadata: dict[str, str] | None = None,
) -> CheckoutSession:
    """Start a subscription checkout and return where to send the customer.

    REAL IMPLEMENTATION - replace the stub block below with:

        import stripe
        stripe.api_key = get_settings().stripe_secret_key
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": plan_price_id, "quantity": 1}],
            customer_email=customer_email,
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata or {},
            # Idempotency matters here: a double-clicked button must not create
            # two subscriptions.
            idempotency_key=f"checkout:{business_id}:{plan_price_id}",
        )
        return CheckoutSession(session.id, session.url, session.customer, stub=False)

    `plan_price_id` is the Stripe Price on the plan row. It is None while the
    plans are local-only, which is exactly when the stub applies.
    """
    if not gateway_configured():
        session_id = f"cs_test_stub_{secrets.token_hex(12)}"
        logger.info(
            "payments: stub checkout session %s for business %s (no Stripe key)",
            session_id,
            business_id,
        )
        # A URL that goes somewhere honest rather than a dead link: the caller
        # can show it, and nobody mistakes it for a real payment page.
        return CheckoutSession(
            session_id=session_id,
            url=f"{success_url}{'&' if '?' in success_url else '?'}stub_session={session_id}",
            customer_id=f"cus_test_stub_{secrets.token_hex(8)}",
            stub=True,
        )

    raise PaymentGatewayError(
        "STRIPE_SECRET_KEY is set but the Stripe client is not wired up yet. "
        "Fill in the real implementation in create_checkout_session()."
    )


def verify_webhook_signature(payload: bytes, signature_header: str | None) -> WebhookEvent:
    """Check that a webhook really came from the gateway, then parse it.

    REAL IMPLEMENTATION - replace the stub block below with:

        import stripe
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=signature_header,
            secret=get_settings().stripe_webhook_secret,
        )
        return WebhookEvent(event["id"], event["type"], event["data"]["object"], False)

    The signature must be checked against the RAW request body. Parsing to
    JSON and re-serialising changes the bytes and the signature will not match
    - which is why the router hands this function `await request.body()`.

    Fails closed: an unsigned request is accepted only in a non-production
    environment with no secret configured, which is what makes local testing
    possible without making production forgeable.
    """
    settings = get_settings()
    secret = settings.stripe_webhook_secret

    if secret:
        # Stripe's scheme, implemented directly so the stub is not weaker than
        # the real thing: t=<timestamp>,v1=<hex hmac of "timestamp.payload">.
        parsed = _parse_signature_header(signature_header)
        timestamp = parsed.get("t")
        provided = parsed.get("v1")
        if timestamp is None or provided is None:
            raise PaymentGatewayError("Malformed signature header.")

        try:
            age = abs(time.time() - int(timestamp))
        except ValueError as exc:
            raise PaymentGatewayError("Malformed signature timestamp.") from exc
        if age > WEBHOOK_TOLERANCE_SECONDS:
            raise PaymentGatewayError("Signature timestamp outside tolerance.")

        expected = hmac.new(
            secret.encode("utf-8"),
            f"{timestamp}.".encode("utf-8") + payload,
            hashlib.sha256,
        ).hexdigest()
        # compare_digest, not ==: a timing-variable comparison on a MAC is a
        # forgery oracle.
        if not hmac.compare_digest(expected, provided):
            raise PaymentGatewayError("Signature does not match.")

    elif settings.environment == "production":
        raise PaymentGatewayError(
            "STRIPE_WEBHOOK_SECRET is not set. Refusing to accept unsigned "
            "webhooks in production."
        )
    else:
        logger.warning(
            "payments: accepting an unsigned webhook - no STRIPE_WEBHOOK_SECRET "
            "and environment is %s",
            settings.environment,
        )

    try:
        body = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PaymentGatewayError("Webhook body is not JSON.") from exc

    if not isinstance(body, dict):
        raise PaymentGatewayError("Webhook body is not an object.")

    return WebhookEvent(
        event_id=str(body.get("id", "evt_unknown")),
        event_type=str(body.get("type", "")),
        data=(body.get("data") or {}).get("object") or {},
        stub=not gateway_configured(),
    )


def cancel_subscription(gateway_subscription_id: str | None) -> bool:
    """Stop a subscription at the gateway. Returns True if it was acted on.

    REAL IMPLEMENTATION - replace the stub block below with:

        import stripe
        stripe.api_key = get_settings().stripe_secret_key
        stripe.Subscription.modify(
            gateway_subscription_id,
            # At period end, not immediately: they have paid for the month.
            cancel_at_period_end=True,
        )
        return True

    A row with no gateway id (stub mode, or a checkout nobody completed) is
    cancelled locally and this returns False - there is nothing at the other
    end to cancel, and that is not an error.
    """
    if not gateway_subscription_id or not gateway_configured():
        logger.info(
            "payments: local-only cancel for %r (stub mode or no gateway id)",
            gateway_subscription_id,
        )
        return False

    raise PaymentGatewayError(
        "STRIPE_SECRET_KEY is set but the Stripe client is not wired up yet. "
        "Fill in the real implementation in cancel_subscription()."
    )


def charge_stub_card(
    *,
    card_number: str,
    exp_month: int,
    exp_year: int,
    cvc: str,
    billing_cycle: str,
    now: datetime | None = None,
) -> StubCharge:
    """Take a test-mode payment for a subscription.

    Raises PaymentDeclined with a customer-facing message when the card is
    refused, and PaymentGatewayError when test payments are not allowed here
    at all. The card details are used for this decision and nothing else:
    they are not stored and not logged, beyond the last four digits.

    REAL IMPLEMENTATION - there is none, by design. With Stripe configured the
    customer pays on Stripe Checkout (create_checkout_session) and a
    checkout.session.completed webhook activates the subscription.
    """
    settings = get_settings()
    if gateway_configured():
        raise PaymentGatewayError(
            "A real payment gateway is configured; test payments are disabled."
        )
    if settings.environment == "production":
        raise PaymentGatewayError("Test payments are not available in production.")

    digits = "".join(ch for ch in card_number if not ch.isspace() and ch != "-")
    if not digits.isdigit() or not 12 <= len(digits) <= 19 or not _luhn_valid(digits):
        raise PaymentDeclined("Your card number is incorrect.")

    current = now or datetime.now(timezone.utc)
    year = exp_year + 2000 if exp_year < 100 else exp_year
    if not 1 <= exp_month <= 12 or (year, exp_month) < (current.year, current.month):
        raise PaymentDeclined("Your card's expiration date is incorrect.")

    if not (cvc.isdigit() and len(cvc) in (3, 4)):
        raise PaymentDeclined("Your card's security code is incorrect.")

    if digits not in STUB_TEST_CARDS:
        raise PaymentDeclined(
            "Test mode accepts test cards only - use 4242 4242 4242 4242."
        )
    outcome = STUB_TEST_CARDS[digits]
    if outcome is not None:
        raise PaymentDeclined(outcome)

    months = 12 if billing_cycle == "yearly" else 1
    charge = StubCharge(
        gateway_subscription_id=f"sub_test_stub_{secrets.token_hex(12)}",
        payment_id=f"pi_test_stub_{secrets.token_hex(12)}",
        brand="Mastercard" if digits.startswith("5") else "Visa",
        last4=digits[-4:],
        # In stub mode this function IS the gateway, so it is the one that
        # says when the paid period ends - the router still never computes it.
        current_period_end=add_months(current, months),
    )
    logger.info(
        "payments: stub charge succeeded (%s ending %s) -> %s",
        charge.brand,
        charge.last4,
        charge.gateway_subscription_id,
    )
    return charge


def _luhn_valid(digits: str) -> bool:
    """The card-number checksum, so a typo is caught as a typo."""
    total = 0
    for index, char in enumerate(reversed(digits)):
        value = int(char)
        if index % 2 == 1:
            value *= 2
            if value > 9:
                value -= 9
        total += value
    return total % 10 == 0


def add_months(moment: datetime, months: int) -> datetime:
    """Same day next month (or year), clamped: Jan 31 + 1 month is Feb 28/29."""
    month_index = moment.month - 1 + months
    year = moment.year + month_index // 12
    month = month_index % 12 + 1
    day = min(moment.day, monthrange(year, month)[1])
    return moment.replace(year=year, month=month, day=day)


def _parse_signature_header(header: str | None) -> dict[str, str]:
    """`t=123,v1=abc,v0=def` -> {"t": "123", "v1": "abc", "v0": "def"}."""
    if not header:
        return {}
    parts: dict[str, str] = {}
    for chunk in header.split(","):
        name, _, value = chunk.partition("=")
        name = name.strip()
        if name and value and name not in parts:
            parts[name] = value.strip()
    return parts


def sign_payload_for_testing(payload: bytes, secret: str, timestamp: int | None = None) -> str:
    """Build a valid signature header. For local testing of the webhook route.

    Not used by application code. It exists so the webhook can be exercised
    end to end - including the signature path - without a Stripe account or a
    CLI listener.
    """
    ts = timestamp if timestamp is not None else int(time.time())
    digest = hmac.new(
        secret.encode("utf-8"), f"{ts}.".encode("utf-8") + payload, hashlib.sha256
    ).hexdigest()
    return f"t={ts},v1={digest}"


__all__ = [
    "CheckoutSession",
    "PaymentDeclined",
    "PaymentGatewayError",
    "STUB_TEST_CARDS",
    "StubCharge",
    "WebhookEvent",
    "add_months",
    "cancel_subscription",
    "charge_stub_card",
    "create_checkout_session",
    "gateway_configured",
    "publishable_key",
    "sign_payload_for_testing",
    "verify_webhook_signature",
]
