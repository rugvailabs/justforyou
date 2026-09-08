"""Shared FastAPI dependencies: current-user resolution and consent gating."""

from __future__ import annotations

from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import JWTError, decode_access_token
from app.models.consent import Consent, ConsentType
from app.models.user import User

# auto_error=False so a missing header reaches us and becomes a 401,
# rather than HTTPBearer's own 403.
bearer_scheme = HTTPBearer(auto_error=False)

CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the User named by the Bearer token, or raise 401."""
    if credentials is None or not credentials.credentials:
        raise CREDENTIALS_EXCEPTION

    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError:
        raise CREDENTIALS_EXCEPTION

    subject = payload.get("sub")
    if subject is None:
        raise CREDENTIALS_EXCEPTION

    try:
        user_id = int(subject)
    except (TypeError, ValueError):
        raise CREDENTIALS_EXCEPTION

    user = db.get(User, user_id)
    if user is None:
        raise CREDENTIALS_EXCEPTION

    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Admit only users with the is_admin flag set.

    Phase 1 scope: a single boolean, not a role system.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


def require_consent(consent_type: str) -> Callable[..., User]:
    """Build a dependency that admits a request only if the current user holds
    an active (never revoked) consent of the given type.

    The type is validated here, at import time, so a typo fails on startup
    rather than on the first request.
    """
    required = ConsentType(consent_type)

    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        consent = db.scalar(
            select(Consent).where(
                Consent.user_id == current_user.id,
                Consent.consent_type == required,
                Consent.revoked_at.is_(None),
            )
        )
        if consent is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required consent: {required.value}",
            )
        return current_user

    return dependency
