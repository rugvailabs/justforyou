from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class OtpCode(Base):
    """A one-time code issued against a phone number.

    The code is stored hashed, never in plaintext: this table is a list of
    live credentials, and anyone who can read the database should not be able
    to sign in as an arbitrary phone number.

    Rows are kept after use rather than deleted - `consumed_at` marks them
    spent - so the request endpoint can enforce a resend cooldown by looking at
    when the last code was issued, and so a burst of requests is visible.
    """

    __tablename__ = "otp_codes"
    __table_args__ = (
        # Every lookup is "the newest live code for this number".
        Index("ix_otp_codes_phone_created", "phone", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # The normalised (digits-only) form, so "+1-604-555-0101" and
    # "16045550101" resolve to the same account.
    phone: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Guards against brute-forcing a six-digit code: a handful of wrong
    # guesses burns the code rather than the attacker's patience.
    attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

    def __repr__(self) -> str:
        return f"<OtpCode id={self.id} phone={self.phone!r}>"
