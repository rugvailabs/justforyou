"""Read-only audit log endpoint.

There is deliberately no PUT, PATCH or DELETE here, and there never should be.
The audit trail is append-only; see app/models/audit_log.py.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_admin
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit import AuditLogResponse

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("", response_model=List[AuditLogResponse])
def list_audit_logs(
    target_table: str | None = Query(default=None),
    action: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> List[AuditLogResponse]:
    stmt = select(AuditLog)
    if target_table is not None:
        stmt = stmt.where(AuditLog.target_table == target_table)
    if action is not None:
        stmt = stmt.where(AuditLog.action == action)
    # id DESC breaks ties within the same timestamp, so paging is stable.
    stmt = stmt.order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())
    stmt = stmt.limit(limit).offset(offset)

    return [
        AuditLogResponse(
            id=row.id,
            actor=row.actor,
            action=row.action,
            target_table=row.target_table,
            target_id=row.target_id,
            timestamp=row.timestamp,
            metadata=row.meta,
        )
        for row in db.scalars(stmt)
    ]
