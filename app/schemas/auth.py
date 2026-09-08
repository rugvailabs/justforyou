"""Request/response schemas for signup, login and the current user."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.user import PreferredContactMethod


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    # bcrypt silently truncates beyond 72 bytes, so cap it here instead.
    password: str = Field(min_length=8, max_length=72)
    phone: str | None = Field(default=None, max_length=32)
    preferred_contact_method: PreferredContactMethod = PreferredContactMethod.email


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    phone: str | None
    preferred_contact_method: PreferredContactMethod
    is_admin: bool
    created_at: datetime
