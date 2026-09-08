"""Response schema for the read-only audit endpoint."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: int
    actor: str
    action: str
    target_table: str
    target_id: int
    timestamp: datetime
    # Exposed under its DB column name; the ORM attribute is `meta`.
    metadata: Dict[str, Any] | None = None
