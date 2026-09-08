"""confidence gate columns and statuses

Revision ID: 14b0d2a2f4a2
Revises: ed8cd1b6b992
Create Date: 2026-09-07 15:14:20.090517

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '14b0d2a2f4a2'
down_revision: Union[str, None] = 'ed8cd1b6b992'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Autogenerate cannot see enum-value additions, so these are hand-written.
    op.execute("ALTER TYPE submission_status_enum ADD VALUE IF NOT EXISTS 'SOLVED'")
    op.execute("ALTER TYPE submission_status_enum ADD VALUE IF NOT EXISTS 'APPROVED'")

    op.add_column("matches", sa.Column("confidence", sa.Float(), nullable=True))
    op.add_column(
        "matches",
        sa.Column("gate_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("matches", "gate_json")
    op.drop_column("matches", "confidence")
    # PostgreSQL cannot drop an enum value; SOLVED and APPROVED remain. Nothing
    # writes them after a downgrade, so they are inert.
