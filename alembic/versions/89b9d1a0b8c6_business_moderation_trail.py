"""business moderation trail

Revision ID: 89b9d1a0b8c6
Revises: ee4fa81e34da
Create Date: 2026-09-08 08:21:42.741350

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '89b9d1a0b8c6'
down_revision: Union[str, None] = 'ee4fa81e34da'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('businesses', sa.Column('moderation_note', sa.Text(), nullable=True))
    op.add_column('businesses', sa.Column('moderated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('businesses', sa.Column('moderated_by', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_businesses_moderated_by_users', 'businesses', 'users', ['moderated_by'],
        ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_businesses_moderated_by_users', 'businesses', type_='foreignkey')
    op.drop_column('businesses', 'moderated_by')
    op.drop_column('businesses', 'moderated_at')
    op.drop_column('businesses', 'moderation_note')
