from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class SupportKind(str, enum.Enum):
    """What the person is writing about.

    Kept separate from EnquiryType, which is a lead against a listing. These go
    to us, not to a business, and nothing about them is scoped to a listing.
    """

    enquiry = "enquiry"
    feedback = "feedback"
    bug = "bug"


class SupportMessage(Base):
    """Something a visitor sent us: a question, feedback, or a bug report.

    Stored as well as emailed, deliberately in that order. Mail is the part
    most likely to fail - a bad SMTP credential, a provider outage - and a
    support message that exists only in a message queue is a support message
    that gets lost. The row is the record; the email is a notification about
    it.

    `user_id` is nullable because a visitor should not have to hold an account
    to report that the site is broken - and the person best placed to report a
    broken sign-up is precisely someone who could not complete one. The email
    they type is therefore stored on the row rather than read off the user.
    """

    __tablename__ = "support_messages"
    __table_args__ = (
        # The only read pattern is "newest first, optionally filtered by kind".
        Index("ix_support_messages_kind_created", "kind", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[SupportKind] = mapped_column(
        Enum(SupportKind, name="support_kind_enum"), nullable=False
    )
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    # Only meaningful on a bug report, and only ever what the reporter's own
    # browser said about itself. Not read from the request: a page URL the
    # reporter typed is worth more than the one they submitted the form from,
    # which is always /contact.
    page_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

    user: Mapped["User | None"] = relationship("User", lazy="joined")

    def __repr__(self) -> str:
        return f"<SupportMessage id={self.id} kind={self.kind.value}>"
