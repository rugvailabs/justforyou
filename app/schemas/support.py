"""Schemas for support messages: questions, feedback and bug reports."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.support import SupportKind


class SupportMessageCreate(BaseModel):
    """What a visitor sends. No user_id - the token decides that, not the body."""

    kind: SupportKind = SupportKind.enquiry
    # Required even when signed in: the address someone wants a reply at is
    # often not the one on their account.
    email: EmailStr
    name: str | None = Field(default=None, max_length=255)
    subject: str | None = Field(default=None, max_length=255)
    message: str = Field(min_length=1, max_length=5000)
    # Bug reports only; ignored otherwise.
    page_url: str | None = Field(default=None, max_length=2048)
    user_agent: str | None = Field(default=None, max_length=512)


class SupportMessageAccepted(BaseModel):
    """Deliberately thin.

    Echoing the message back would let this endpoint be used to bounce
    arbitrary text off our domain, and there is nothing the sender needs from
    the response except that it arrived.
    """

    id: int
    created_at: datetime
