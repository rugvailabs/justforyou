from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, List

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.user import User


class Conversation(Base):
    """One thread between a customer and a listing.

    Unique on (business_id, customer_id): "message this business" reopens the
    existing thread rather than starting a parallel one, which is what stops a
    customer's history fragmenting across duplicates. The endpoint is
    get-or-create for that reason.

    Both sides require an account - unlike an enquiry, which is deliberately
    open to anonymous visitors. A back-and-forth needs a durable identity to
    reply to; a one-way enquiry does not.
    """

    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("business_id", "customer_id", name="uq_conversations_pair"),
        # The thread list is "mine, most recently active first", for both roles.
        Index("ix_conversations_customer_active", "customer_id", "last_message_at"),
        Index("ix_conversations_business_active", "business_id", "last_message_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Denormalised so the thread list can sort without touching messages.
    # Set on create and on every send.
    last_message_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # Per-side read marks rather than per-message flags: an unread count is
    # then one comparison, not a scan of the thread.
    customer_read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    owner_read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    business: Mapped["Business"] = relationship(back_populates="conversations")
    customer: Mapped["User"] = relationship(foreign_keys=[customer_id])
    messages: Mapped[List["Message"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.id",
    )

    def __repr__(self) -> str:
        return (
            f"<Conversation id={self.id} business={self.business_id} "
            f"customer={self.customer_id}>"
        )


class Message(Base):
    """A single message in a thread.

    `sender_id` is the author. Which side of the thread that is gets derived
    from the conversation rather than stored, so a listing changing hands
    cannot retroactively mislabel old messages.
    """

    __tablename__ = "messages"
    __table_args__ = (
        # Polling asks for "messages after id N in this thread".
        Index("ix_messages_conversation_id_id", "conversation_id", "id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
    sender: Mapped["User"] = relationship()

    def __repr__(self) -> str:
        return f"<Message id={self.id} conversation={self.conversation_id}>"
