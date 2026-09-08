"""Schemas for user profile management."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.models.user import PreferredContactMethod


class ProfileUpdateRequest(BaseModel):
    """Partial profile update. Every field is optional.

    Email is deliberately absent: changing it requires re-verification, which
    is its own flow rather than a field on this endpoint.

    Omitted fields are left alone. `phone` maps to a nullable column, so an
    explicit null clears it; `name` and `preferred_contact_method` map to NOT
    NULL columns, so an explicit null is rejected rather than passed to the DB.
    """

    name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    preferred_contact_method: PreferredContactMethod | None = None

    @field_validator("name", "preferred_contact_method")
    @classmethod
    def reject_explicit_null(cls, v: object) -> object:
        # Defaults are not validated, so this only fires when the caller sent
        # the key explicitly as null.
        if v is None:
            raise ValueError("may be omitted, but must not be null")
        return v
