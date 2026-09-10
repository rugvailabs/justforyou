"""add support messages

Autogenerate also proposed dropping ix_review_queue_open, and that drop has
been deleted from this migration. The index exists in the database - a plain
btree on (resolved_at, id), created by an earlier hand-written migration -
but ReviewQueue.__table_args__ never declared it, so every autogenerate reads
it as removed and proposes dropping it again. It backs the review console's
open-queue query (WHERE resolved_at IS NULL) and must stay.

The real fix is to declare it on the model so the two stop disagreeing; that
is a change to app/models/review_queue.py, not to this migration.

Revision ID: 78fadada7aeb
Revises: c7a1e04b93d2
Create Date: 2026-09-10 15:41:55.854884

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '78fadada7aeb'
down_revision: Union[str, None] = 'c7a1e04b93d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('support_messages',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('kind', sa.Enum('enquiry', 'feedback', 'bug', name='support_kind_enum'), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=True),
    sa.Column('email', sa.String(length=320), nullable=False),
    sa.Column('subject', sa.String(length=255), nullable=True),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('page_url', sa.String(length=2048), nullable=True),
    sa.Column('user_agent', sa.String(length=512), nullable=True),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_support_messages_created_at'), 'support_messages', ['created_at'], unique=False)
    op.create_index('ix_support_messages_kind_created', 'support_messages', ['kind', 'created_at'], unique=False)
    op.create_index(op.f('ix_support_messages_user_id'), 'support_messages', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_support_messages_user_id'), table_name='support_messages')
    op.drop_index('ix_support_messages_kind_created', table_name='support_messages')
    op.drop_index(op.f('ix_support_messages_created_at'), table_name='support_messages')
    op.drop_table('support_messages')
