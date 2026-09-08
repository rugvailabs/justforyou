"""add otp codes and normalised phone

Adds phone-based one-time-code sign-in ALONGSIDE email/password rather than
replacing it: only 6 of 56 accounts have a phone number, so making OTP the
only route would lock the rest out.

Revision ID: 43064260ad2a
Revises: eaa5be80ac1e
Create Date: 2026-09-08 12:18:59.726060

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '43064260ad2a'
down_revision: Union[str, None] = 'eaa5be80ac1e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('otp_codes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('phone', sa.String(length=32), nullable=False),
    sa.Column('code_hash', sa.String(length=255), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_otp_codes_created_at'), 'otp_codes', ['created_at'], unique=False)
    op.create_index(op.f('ix_otp_codes_phone'), 'otp_codes', ['phone'], unique=False)
    op.create_index('ix_otp_codes_phone_created', 'otp_codes', ['phone', 'created_at'], unique=False)
    op.add_column('users', sa.Column('phone_normalized', sa.String(length=32), nullable=True))
    op.execute(
        "UPDATE users SET phone_normalized = regexp_replace(phone, '[^0-9]', '', 'g') "
        "WHERE phone IS NOT NULL AND regexp_replace(phone, '[^0-9]', '', 'g') <> ''"
    )
    op.create_index(op.f('ix_users_phone_normalized'), 'users', ['phone_normalized'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_users_phone_normalized'), table_name='users')
    op.drop_column('users', 'phone_normalized')
    op.drop_index('ix_otp_codes_phone_created', table_name='otp_codes')
    op.drop_index(op.f('ix_otp_codes_phone'), table_name='otp_codes')
    op.drop_index(op.f('ix_otp_codes_created_at'), table_name='otp_codes')
    op.drop_table('otp_codes')
