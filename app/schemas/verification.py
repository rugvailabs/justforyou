"""Wire shapes for business verification (KYC)."""

from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.verification import VerificationStatus

# Canadian GST/HST business number: 9 digits, then RT, then a 4-digit account
# suffix - e.g. 123456789RT0001. Spaces are tolerated on the way in.
_GST_PATTERN = re.compile(r"^\d{9}RT\d{4}$", re.IGNORECASE)


class PresignRequest(BaseModel):
    """Query parameters for GET /uploads/presign, documented as a model."""

    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=3, max_length=128)


class PresignResponse(BaseModel):
    """Where to PUT a document, and what to call it afterwards.

    `upload_url` is short-lived and single-purpose. `document_url` is what the
    client sends back in the verification payload - it stays valid after the
    upload URL expires, which is why the two are different fields.
    """

    upload_url: str
    document_url: str
    key: str
    expires_in: int
    method: str = "PUT"
    # True when object storage is not configured and these URLs are
    # placeholders. The contract is identical either way, so a frontend can be
    # built and demoed before any bucket exists.
    stub: bool = False


class VerificationSubmit(BaseModel):
    """What an owner submits for review.

    Licence and GST are both optional: not every trade is licensed, and a
    business under the small-supplier threshold has no GST number to give.
    Judging what is missing is the reviewer's job, not the schema's.
    """

    email: EmailStr
    mobile_number: str = Field(min_length=7, max_length=32)
    license_number: str | None = Field(default=None, max_length=64)
    license_document_url: str | None = Field(default=None, max_length=1024)
    gst_number: str | None = Field(default=None, max_length=32)
    gst_document_url: str | None = Field(default=None, max_length=1024)

    @field_validator("mobile_number")
    @classmethod
    def _check_mobile(cls, value: str) -> str:
        digits = re.sub(r"\D", "", value)
        if len(digits) < 10:
            raise ValueError("Enter a full phone number, including area code.")
        return value.strip()

    @field_validator("gst_number")
    @classmethod
    def _check_gst(cls, value: str | None) -> str | None:
        if value is None or value.strip() == "":
            return None
        cleaned = re.sub(r"\s", "", value).upper()
        if not _GST_PATTERN.match(cleaned):
            raise ValueError(
                "A GST/HST number looks like 123456789RT0001. "
                "Leave it blank if the business is not registered."
            )
        return cleaned

    @field_validator("license_number", "license_document_url", "gst_document_url")
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class VerificationOut(BaseModel):
    """The KYC record as its owner sees it."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    email: str
    mobile_number: str
    license_number: str | None
    license_document_url: str | None
    gst_number: str | None
    gst_document_url: str | None
    status: VerificationStatus
    rejection_reason: str | None
    reviewed_at: datetime | None
    submitted_at: datetime
    updated_at: datetime


class PendingVerificationItem(VerificationOut):
    """A queue row, with enough context to judge without opening the listing."""

    business_name: str
    business_slug: str
    business_city: str
    business_status: str
    owner_email: str | None


class VerificationDecision(BaseModel):
    """Body of the reject route. Approve takes an optional note instead."""

    # Required, and required to say something: "rejected" with no reason is a
    # dead end for the owner, who cannot fix what they were not told about.
    reason: str = Field(min_length=3, max_length=1000)


class VerificationApproval(BaseModel):
    note: str | None = Field(default=None, max_length=1000)
