"""Profile read and partial update for the current user."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.auth import UserResponse
from app.schemas.user import ProfileUpdateRequest

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=UserResponse)
def get_profile(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.patch("", response_model=UserResponse)
def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    # exclude_unset distinguishes "field omitted" from "field set to null",
    # so an omitted phone is left alone while an explicit null clears it.
    updates = payload.model_dump(exclude_unset=True)

    changed = [
        field
        for field, value in updates.items()
        if getattr(current_user, field) != value
    ]
    for field in changed:
        setattr(current_user, field, updates[field])

    if not changed:
        return current_user

    db.commit()
    db.refresh(current_user)

    log_audit(
        db,
        actor=f"user:{current_user.id}",
        action="profile.updated",
        target_table="users",
        target_id=current_user.id,
        metadata={"fields_changed": changed},
    )
    return current_user
