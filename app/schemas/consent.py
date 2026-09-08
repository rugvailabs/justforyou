"""Request/response schemas for CASL consent records."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.consent import ConsentType


class ConsentGrantRequest(BaseModel):
    consent_type: ConsentType
    policy_version: str = Field(min_length=1, max_length=32)
    method: str = Field(min_length=1, max_length=64, examples=["checkbox"])
    # The language the client actually rendered the consent notice in. Omitted
    # means "fall back to Accept-Language, then record nothing" - see the route.
    # Should become required once a UI exists that can state it authoritatively.
    language: str | None = Field(
        default=None,
        pattern=r"^[A-Za-z]{2}(-[A-Za-z]{2})?$",
        examples=["en", "fr", "fr-CA"],
    )


class ConsentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    consent_type: ConsentType
    policy_version: str
    granted_at: datetime
    revoked_at: datetime | None
    ip_address: str
    method: str
    language: str | None
