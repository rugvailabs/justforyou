"""Shared FastAPI dependencies: current-user resolution and consent gating."""

from __future__ import annotations

from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import JWTError, decode_access_token
from app.models.business import Business
from app.models.consent import Consent, ConsentType
from app.models.user import User, UserRole

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


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Resolve the caller if they are signed in, otherwise return None.

    For endpoints that anonymous visitors may use but that should still
    attribute the action when a token is present - leaving an enquiry, say.

    A malformed or expired token yields None rather than a 401: the caller is
    simply treated as anonymous. Anything that must not be done anonymously
    belongs behind get_current_user instead.
    """
    if credentials is None or not credentials.credentials:
        return None
    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError:
        return None

    subject = payload.get("sub")
    if subject is None:
        return None
    try:
        user_id = int(subject)
    except (TypeError, ValueError):
        return None

    return db.get(User, user_id)


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


def require_business_owner(current_user: User = Depends(get_current_user)) -> User:
    """Admit business owners, and admins acting on their behalf.

    This gates "may use the owner dashboard at all". It deliberately says
    nothing about *which* listings the caller may touch - that is per-object
    and is enforced by require_owned_business below. Conflating the two is how
    one owner ends up reading another's leads.
    """
    if current_user.role not in (UserRole.business_owner, UserRole.admin) and not (
        current_user.is_admin
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A business owner account is required",
        )
    return current_user


def require_owned_business(
    business_id: int,
    current_user: User = Depends(require_business_owner),
    db: Session = Depends(get_db),
) -> "Business":
    """Resolve a listing the current user is allowed to administer.

    404 for a listing that does not exist, 403 for one owned by somebody else.
    A listing with no owner (the pre-ownership seed data) is editable only by
    an admin, never adoptable by whoever asks first.
    """
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found"
        )

    is_admin = current_user.is_admin or current_user.role is UserRole.admin
    if business.owner_id != current_user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this listing",
        )
    return business


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
