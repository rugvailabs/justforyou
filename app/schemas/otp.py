"""Schemas for phone one-time-code sign-in."""

from __future__ import annotations

from pydantic import BaseModel, Field


class OtpRequest(BaseModel):
    phone: str = Field(min_length=5, max_length=32)


class OtpRequestAccepted(BaseModel):
    """Deliberately says nothing about whether the number is registered.

    Returning "we sent a code" only for known numbers would turn this endpoint
    into a way to enumerate which phone numbers hold accounts.
    """

    expires_in: int
    resend_after: int


class OtpVerify(BaseModel):
    phone: str = Field(min_length=5, max_length=32)
    code: str = Field(min_length=4, max_length=12)
    # Used only when this code creates a new account; ignored for a returning
    # user with a name already set.
    name: str | None = Field(default=None, max_length=255)
