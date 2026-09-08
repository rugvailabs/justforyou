from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.consent import Consent
    from app.models.submission import Submission


class MessageChannel(str, enum.Enum):
    email = "email"
    sms = "sms"


class MessageStatus(str, enum.Enum):
    queued = "queued"
    sent = "sent"
    failed = "failed"


class MessageSent(Base):
    __tablename__ = "messages_sent"
    __table_args__ = (Index("ix_messages_sent_submission_id", "submission_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False
    )
    channel: Mapped[MessageChannel] = mapped_column(
        Enum(MessageChannel, name="message_channel_enum", native_enum=True),
        nullable=False,
    )
    recipient: Mapped[str] = mapped_column(String(320), nullable=False)
    # nullable: a row in status=queued has not been sent yet
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # CASL audit trail: the consent record that authorised this message
    casl_consent_id: Mapped[int] = mapped_column(
        ForeignKey("consents.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[MessageStatus] = mapped_column(
        Enum(MessageStatus, name="message_status_enum", native_enum=True),
        nullable=False,
        default=MessageStatus.queued,
        server_default=MessageStatus.queued.value,
    )

    submission: Mapped["Submission"] = relationship(back_populates="messages_sent")
    consent: Mapped["Consent"] = relationship()

    def __repr__(self) -> str:
        return f"<MessageSent id={self.id} channel={self.channel} status={self.status}>"
