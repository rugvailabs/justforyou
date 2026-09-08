"""text and audio input paths, record_audio consent

Revision ID: 28d69027b1a6
Revises: c242b0715dec
Create Date: 2026-09-07 07:07:29.632510

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '28d69027b1a6'
down_revision: Union[str, None] = 'c242b0715dec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. New enum + column describing which input path produced the row.
    #    Existing rows all came from the upload endpoint, so 'audio' is the
    #    correct backfill; the server_default makes that automatic.
    input_type = sa.Enum("text", "audio", name="input_type_enum")
    input_type.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "submissions",
        sa.Column(
            "input_type",
            input_type,
            nullable=False,
            server_default="audio",
        ),
    )

    # 2. Terminal-ish status for the text path, which never gets transcribed.
    op.execute(
        "ALTER TYPE submission_status_enum ADD VALUE IF NOT EXISTS 'SUBMITTED'"
    )

    # 3. The product records audio, not video. RENAME VALUE preserves every
    #    existing consent row, so nobody has to re-consent.
    op.execute(
        "ALTER TYPE consent_type_enum RENAME VALUE 'record_video' TO 'record_audio'"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TYPE consent_type_enum RENAME VALUE 'record_audio' TO 'record_video'"
    )
    op.drop_column("submissions", "input_type")
    sa.Enum(name="input_type_enum").drop(op.get_bind(), checkfirst=True)
    # PostgreSQL cannot drop a value from an enum, so 'SUBMITTED' stays on
    # submission_status_enum. Harmless: nothing writes it after a downgrade.
