"""Append-only audit trail.

INSERT ONLY. Nothing in this application may ever UPDATE or DELETE a row in
this table, and no PUT/PATCH/DELETE route may ever be exposed for it. The
audit trail is the evidence a CASL complaint is answered with; if it can be
rewritten, it is not evidence.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from sqlalchemy import DateTime, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        # Supports the admin endpoint's filters and its timestamp DESC ordering.
        Index("ix_audit_log_target_table", "target_table"),
        Index("ix_audit_log_action", "action"),
        Index("ix_audit_log_timestamp", "timestamp"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # "user:{id}" for a human actor, "system" for the pipeline.
    actor: Mapped[str] = mapped_column(String(64), nullable=False)
    # Dotted verb, e.g. "consent.granted", "message.failed".
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target_table: Mapped[str] = mapped_column(String(64), nullable=False)
    target_id: Mapped[int] = mapped_column(Integer, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # The DB column is "metadata"; the Python attribute cannot be, because
    # SQLAlchemy reserves Base.metadata for the MetaData object.
    meta: Mapped[Dict[str, Any] | None] = mapped_column(
        "metadata", JSONB, nullable=True
    )

    def __repr__(self) -> str:
        return (
            f"<AuditLog id={self.id} actor={self.actor!r} action={self.action!r} "
            f"target={self.target_table}:{self.target_id}>"
        )
