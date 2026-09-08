"""Phone one-time-code sign-in.

An ADDITIONAL route in, not a replacement for email/password: most accounts
have no phone number at all, so making this the only way in would lock them
out.

Failure modes are separated by status code so a caller can say something
specific rather than "that didn't work":

    404  no code has been requested for this number
    410  the code expired
    400  the code is wrong
    429  too soon to resend, or too many wrong guesses

Codes are stored hashed. In development the code is written to the backend log
because there is no SMS provider wired up; that is gated on ENVIRONMENT and
must never be reachable in production.
"""

from __future__ import annotations

import logging
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.otp import OtpCode
from app.models.user import User, UserRole
from app.schemas.auth import TokenResponse
from app.schemas.otp import OtpRequest, OtpRequestAccepted, OtpVerify

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/otp", tags=["auth"])

CODE_TTL_SECONDS = 300
RESEND_COOLDOWN_SECONDS = 30
MAX_ATTEMPTS = 5
# Long enough that guessing is hopeless within the attempt limit, short enough
# to read off a screen.
CODE_DIGITS = 6

# Deliberately loose: this is a dev app serving Canadian numbers but must not
# reject a valid international one. Real validation belongs with the SMS
# provider, which knows what it can actually deliver to.
MIN_DIGITS = 7
MAX_DIGITS = 15


def normalize_phone(raw: str) -> str:
    """Digits only.

    "+1 (604) 555-0101", "1-604-555-0101" and "16045550101" are the same
    number and must resolve to the same account; comparing the display forms
    would let one person hold several accounts on one line.
    """
    return re.sub(r"\D", "", raw or "")


def _issue_code() -> str:
    # secrets, not random: this is a credential.
    return f"{secrets.randbelow(10 ** CODE_DIGITS):0{CODE_DIGITS}d}"


@router.post(
    "/request", response_model=OtpRequestAccepted, status_code=status.HTTP_202_ACCEPTED
)
def request_otp(
    payload: OtpRequest, db: Session = Depends(get_db)
) -> OtpRequestAccepted:
    """Issue a code for a phone number.

    Deliberately says nothing about whether the number is already registered:
    the response is identical either way, so this endpoint cannot be used to
    enumerate which numbers hold accounts.
    """
    phone = normalize_phone(payload.phone)
    if not (MIN_DIGITS <= len(phone) <= MAX_DIGITS):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That does not look like a phone number.",
        )

    now = datetime.now(timezone.utc)

    # Server-side cooldown. The client also counts down, but a timer in a
    # browser is a courtesy, not a rate limit.
    latest = db.scalar(
        select(OtpCode)
        .where(OtpCode.phone == phone)
        .order_by(OtpCode.created_at.desc(), OtpCode.id.desc())
        .limit(1)
    )
    if latest is not None:
        elapsed = (now - latest.created_at).total_seconds()
        if elapsed < RESEND_COOLDOWN_SECONDS:
            wait = int(RESEND_COOLDOWN_SECONDS - elapsed) or 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {wait}s before requesting another code.",
                headers={"Retry-After": str(wait)},
            )

    # Retire any outstanding code, so only the newest one works.
    for stale in db.scalars(
        select(OtpCode).where(
            OtpCode.phone == phone, OtpCode.consumed_at.is_(None)
        )
    ).all():
        stale.consumed_at = now

    code = _issue_code()
    db.add(
        OtpCode(
            phone=phone,
            code_hash=hash_password(code),
            expires_at=now + timedelta(seconds=CODE_TTL_SECONDS),
        )
    )
    db.commit()

    settings = get_settings()
    if settings.environment != "production":
        # No SMS provider in development. This is the delivery channel.
        logger.info("OTP for %s is %s (expires in %ss)", phone, code, CODE_TTL_SECONDS)

    return OtpRequestAccepted(
        expires_in=CODE_TTL_SECONDS, resend_after=RESEND_COOLDOWN_SECONDS
    )


@router.post("/verify", response_model=TokenResponse)
def verify_otp(payload: OtpVerify, db: Session = Depends(get_db)) -> TokenResponse:
    """Exchange a code for a token, creating the account if it is new."""
    phone = normalize_phone(payload.phone)
    now = datetime.now(timezone.utc)

    record = db.scalar(
        select(OtpCode)
        .where(OtpCode.phone == phone, OtpCode.consumed_at.is_(None))
        .order_by(OtpCode.created_at.desc(), OtpCode.id.desc())
        .limit(1)
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No code has been requested for that number.",
        )

    if record.expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="That code has expired. Request a new one.",
        )

    if record.attempts >= MAX_ATTEMPTS:
        # Burn it rather than leave a partially-guessed code alive.
        record.consumed_at = now
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many incorrect attempts. Request a new code.",
        )

    if not verify_password(payload.code.strip(), record.code_hash):
        record.attempts += 1
        db.commit()
        remaining = MAX_ATTEMPTS - record.attempts
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"That code is not correct. {remaining} attempt"
                f"{'' if remaining == 1 else 's'} left."
                if remaining > 0
                else "That code is not correct."
            ),
        )

    record.consumed_at = now

    user = db.scalar(select(User).where(User.phone_normalized == phone))
    if user is None:
        # First sign-in from this number: create the account. There is no
        # password - this user signs in by code until they set one.
        user = User(
            name=(payload.name or "").strip() or f"Member {phone[-4:]}",
            # Placeholder, unique, and not a valid login: the email/password
            # route stays closed for an OTP-created account until they set one.
            #
            # NOT a .invalid address, tempting as that is semantically:
            # EmailStr rejects reserved TLDs, so /me would 500 on response
            # validation for exactly the accounts this endpoint creates.
            email=f"phone-{phone}@otp.justdial.ca",
            hashed_password="!",
            phone=payload.phone.strip(),
            phone_normalized=phone,
            role=UserRole.customer,
        )
        db.add(user)
    elif payload.name and payload.name.strip() and user.name.startswith("Member "):
        # Only fills a placeholder name; never overwrites a real one, so a
        # returning user cannot be renamed by whatever the form happened to
        # send.
        user.name = payload.name.strip()

    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token({"sub": str(user.id)}))
