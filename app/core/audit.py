"""Append-only audit logging helper.

log_audit never raises. An audit write failing must not roll back or break the
primary operation it is attached to - a failed consent revocation is far worse
than a missing log line. Failures are logged at WARNING for follow-up.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


def log_audit(
    db: Session,
    actor: str,
    action: str,
    target_table: str,
    target_id: int,
    metadata: Dict[str, Any] | None = None,
) -> None:
    """Insert one audit row and commit it.

    Args:
        db: Session to write through. Callers should have committed their own
            work first, since this commits the session.
        actor: "user:{id}" for a human actor, "system" for automated work.
        action: Dotted verb, e.g. "consent.granted".
        target_table: Table the action applies to.
        target_id: Primary key of the affected row.
        metadata: Optional JSON-serialisable context.
    """
    try:
        db.add(
            AuditLog(
                actor=actor,
                action=action,
                target_table=target_table,
                target_id=target_id,
                meta=metadata,
            )
        )
        db.commit()
    except Exception:
        logger.warning(
            "audit log write failed: actor=%s action=%s target=%s:%s",
            actor,
            action,
            target_table,
            target_id,
            exc_info=True,
        )
        try:
            db.rollback()
        except Exception:
            logger.warning("audit log rollback failed", exc_info=True)
