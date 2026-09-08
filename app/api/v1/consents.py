"""CASL consent grant, revoke and listing routes."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.consent import Consent
from app.models.user import User
from app.schemas.consent import ConsentGrantRequest, ConsentResponse

router = APIRouter(prefix="/consents", tags=["consents"])


def _consent_language(payload_language: str | None, request: Request) -> str | None:
    """Language the consent notice was rendered in, or None if unknown.

    The request body wins: only the client knows which text it actually
    displayed. Accept-Language is a fallback inference, not a statement of
    fact, but it is better evidence than nothing. Neither present means the
    language genuinely was not captured, and the column stays NULL rather than
    being guessed.
    """
    if payload_language:
        return payload_language
    header = request.headers.get("accept-language")
    if header:
        # "fr-CA,fr;q=0.9,en;q=0.8" -> "fr-CA"
        first = header.split(",")[0].split(";")[0].strip()
        if first and first != "*":
            return first[:8]
    return None


def _client_ip(request: Request) -> str:
    """Best-effort caller IP, preferring the proxy header when present."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("", response_model=ConsentResponse, status_code=status.HTTP_201_CREATED)
def grant_consent(
    payload: ConsentGrantRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Consent:
    consent = Consent(
        user_id=current_user.id,
        consent_type=payload.consent_type,
        policy_version=payload.policy_version,
        granted_at=datetime.now(timezone.utc),
        revoked_at=None,
        ip_address=_client_ip(request),
        method=payload.method,
        language=_consent_language(payload.language, request),
    )
    db.add(consent)
    db.commit()
    db.refresh(consent)

    log_audit(
        db,
        actor=f"user:{current_user.id}",
        action="consent.granted",
        target_table="consents",
        target_id=consent.id,
        metadata={
            "consent_type": consent.consent_type.value,
            "policy_version": consent.policy_version,
            "language": consent.language,
            "method": consent.method,
        },
    )
    return consent


@router.post("/{consent_id}/revoke", response_model=ConsentResponse)
def revoke_consent(
    consent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Consent:
    consent = db.get(Consent, consent_id)
    if consent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consent not found")
    if consent.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Consent does not belong to the current user",
        )

    # Already revoked: keep the original timestamp, the audit trail is immutable.
    if consent.revoked_at is None:
        consent.revoked_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(consent)

        log_audit(
            db,
            actor=f"user:{current_user.id}",
            action="consent.revoked",
            target_table="consents",
            target_id=consent.id,
            metadata={
                "consent_type": consent.consent_type.value,
                "policy_version": consent.policy_version,
            },
        )
    return consent


@router.get("", response_model=List[ConsentResponse])
def list_consents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[Consent]:
    return list(
        db.scalars(
            select(Consent)
            .where(Consent.user_id == current_user.id)
            .order_by(Consent.id)
        )
    )
