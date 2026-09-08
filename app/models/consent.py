from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class ConsentType(str, enum.Enum):
    record_audio = "record_audio"
    send_email = "send_email"
    send_sms = "send_sms"


class Consent(Base):
    __tablename__ = "consents"
    __table_args__ = (Index("ix_consents_user_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    consent_type: Mapped[ConsentType] = mapped_column(
        Enum(ConsentType, name="consent_type_enum", native_enum=True), nullable=False
    )
    policy_version: Mapped[str] = mapped_column(String(32), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False)
    method: Mapped[str] = mapped_column(String(64), nullable=False)
    # BCP-47 tag of the consent text the user was actually shown ("en", "fr",
    # "fr-CA"). Quebec Law 25 requires French-language consent, so which
    # language the notice was rendered in is part of the evidence.
    # NULL means "not captured" - true of every row written before this column
    # existed. It is deliberately not defaulted to "en", because guessing
    # would put a claim into an evidentiary record that nobody verified.
    language: Mapped[str | None] = mapped_column(String(8), nullable=True)

    user: Mapped["User"] = relationship(back_populates="consents")

    def __repr__(self) -> str:
        return f"<Consent id={self.id} user_id={self.user_id} type={self.consent_type}>"
