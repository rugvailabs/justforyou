"""review console fields

Revision ID: 595f4a670259
Revises: 14b0d2a2f4a2
Create Date: 2026-09-07 15:29:45.635629

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '595f4a670259'
down_revision: Union[str, None] = '14b0d2a2f4a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    decision = sa.Enum(
        "approved", "rejected", "info_requested", name="review_decision_enum"
    )
    decision.create(op.get_bind(), checkfirst=True)

    op.add_column("review_queue", sa.Column("claimed_by", sa.String(64), nullable=True))
    op.add_column(
        "review_queue",
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("review_queue", sa.Column("decision", decision, nullable=True))
    op.add_column("review_queue", sa.Column("decided_by", sa.String(64), nullable=True))
    op.add_column("review_queue", sa.Column("reviewer_note", sa.Text(), nullable=True))
    op.add_column(
        "review_queue", sa.Column("original_solution_text", sa.Text(), nullable=True)
    )
    # The console's default view is "open tickets, oldest first".
    op.create_index(
        "ix_review_queue_open",
        "review_queue",
        ["resolved_at", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_review_queue_open", table_name="review_queue")
    for col in (
        "original_solution_text",
        "reviewer_note",
        "decided_by",
        "decision",
        "claimed_at",
        "claimed_by",
    ):
        op.drop_column("review_queue", col)
    sa.Enum(name="review_decision_enum").drop(op.get_bind(), checkfirst=True)
