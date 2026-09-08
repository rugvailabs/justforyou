"""add NEEDS_REVIEW to submission_status_enum

Revision ID: c242b0715dec
Revises: 44e35921dfc7
Create Date: 2026-09-07 06:38:00.173530

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c242b0715dec'
down_revision: Union[str, None] = '44e35921dfc7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Autogenerate cannot see enum-value additions, so this is hand-written.
    # PostgreSQL 12+ permits ALTER TYPE ... ADD VALUE inside a transaction as
    # long as the new label is not *used* in the same transaction, which it is
    # not here.
    op.execute("ALTER TYPE submission_status_enum ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW'")


def downgrade() -> None:
    # PostgreSQL has no ALTER TYPE ... DROP VALUE. Removing the label would
    # mean creating a replacement type, rewriting every dependent column, and
    # deciding what to do with rows already holding it - far beyond what a
    # downgrade should do silently. Left as a no-op deliberately.
    pass
