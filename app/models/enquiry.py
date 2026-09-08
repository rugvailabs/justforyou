from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.user import User


class EnquiryType(str, enum.Enum):
    """What the customer did.

    `call_click` is not a message - it records that someone revealed the phone
    number, which is the closest thing to intent a directory can observe
    without the call itself. The others carry a message the owner replies to.
    """

    call_click = "call_click"
    callback = "callback"
    quote = "quote"
    chat = "chat"


class Enquiry(Base):
    """A lead against a listing.

    Anonymous enquiries are allowed - `user_id` is nullable - because a
    customer should not have to register to ask a business for a quote. That is
    why contact details are stored on the row rather than read off the user.
    """

    __tablename__ = "enquiries"
    __table_args__ = (
        # The leads inbox is always "this business, newest first".
        Index("ix_enquiries_business_created", "business_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # NULL for an anonymous enquiry; SET NULL rather than CASCADE so deleting
    # an account does not destroy the owner's record of the lead.
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    enquiry_type: Mapped[EnquiryType] = mapped_column(
        Enum(EnquiryType, name="enquiry_type_enum", native_enum=True),
        nullable=False,
        index=True,
    )
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Captured at enquiry time. Deliberately not a live join to the user: if
    # someone changes their number later, the lead must still show what the
    # owner was given to call back on.
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

    business: Mapped["Business"] = relationship(back_populates="enquiries")
    user: Mapped["User | None"] = relationship()

    def __repr__(self) -> str:
        return (
            f"<Enquiry id={self.id} business={self.business_id} "
            f"type={self.enquiry_type.value}>"
        )
