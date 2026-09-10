"""drop otp codes

Phone one-time-code sign-in is removed: accounts are created and entered with
an email and a password only. With /auth/otp gone there is no consumer for
this table, and what it holds is a list of live credentials - leaving it
behind means keeping hashed sign-in codes for a route that no longer exists.

`users.phone_normalized` is deliberately NOT dropped. OTP was its only reader,
but the column holds real user data and de-duplicating "+1 (604) 555-0101"
against "16045550101" is useful independently of how people sign in.

Reversible: downgrade() rebuilds the table, its indexes and its constraints
exactly as 43064260ad2a created them. The rows themselves are not recoverable,
which is correct - a spent one-time code has no value, and an unspent one
should not survive a feature being switched off and on again.

Revision ID: c7a1e04b93d2
Revises: ff6f94a63e4f
Create Date: 2026-09-10 09:12:44.108327

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7a1e04b93d2"
down_revision: Union[str, None] = "ff6f94a63e4f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_otp_codes_phone_created", table_name="otp_codes")
    op.drop_index(op.f("ix_otp_codes_phone"), table_name="otp_codes")
    op.drop_index(op.f("ix_otp_codes_created_at"), table_name="otp_codes")
    op.drop_table("otp_codes")


def downgrade() -> None:
    op.create_table(
        "otp_codes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=False),
        sa.Column("code_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_otp_codes_created_at"), "otp_codes", ["created_at"], unique=False
    )
    op.create_index(op.f("ix_otp_codes_phone"), "otp_codes", ["phone"], unique=False)
    op.create_index(
        "ix_otp_codes_phone_created", "otp_codes", ["phone", "created_at"], unique=False
    )
