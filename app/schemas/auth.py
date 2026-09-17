"""Request/response schemas for signup, login and the current user."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.user import PreferredContactMethod, UserRole


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    # bcrypt silently truncates beyond 72 bytes, so cap it here instead.
    password: str = Field(min_length=8, max_length=72)
    phone: str | None = Field(default=None, max_length=32)
    preferred_contact_method: PreferredContactMethod = PreferredContactMethod.email
    # Self-service signup for people listing a business. Deliberately typed as
    # a two-value literal rather than UserRole: accepting the full enum here
    # would let anyone mint themselves an admin account by posting
    # {"role": "admin"} to a public endpoint.
    role: Literal[UserRole.customer, UserRole.business_owner] = UserRole.customer


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
    role: UserRole
    created_at: datetime
    # False only for a business account that has not finished registering.
    is_active: bool = True
    # 2-4 while registering (4 = complete); None if the account never did.
    registration_step: int | None = None
