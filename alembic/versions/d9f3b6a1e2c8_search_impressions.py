"""search impressions for placement analytics

Revision ID: d9f3b6a1e2c8
Revises: c4e7a2b9d6f1
Create Date: 2026-09-17 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'd9f3b6a1e2c8'
down_revision: Union[str, None] = 'c4e7a2b9d6f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'search_impressions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('search_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('tier', sa.SmallInteger(), nullable=False),
        sa.Column('in_rotation', sa.Boolean(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('query', sa.String(length=128), nullable=True),
        sa.Column('category_slug', sa.String(length=128), nullable=True),
        sa.Column('city', sa.String(length=128), nullable=True),
        sa.Column('sort', sa.String(length=16), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column('clicked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('click_action', sa.String(length=16), nullable=True),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_search_impressions_business_created',
        'search_impressions',
        ['business_id', 'created_at'],
    )
    op.create_index(
        'ix_search_impressions_search_business',
        'search_impressions',
        ['search_id', 'business_id'],
    )
    op.create_index('ix_search_impressions_created', 'search_impressions', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_search_impressions_created', table_name='search_impressions')
    op.drop_index('ix_search_impressions_search_business', table_name='search_impressions')
    op.drop_index('ix_search_impressions_business_created', table_name='search_impressions')
    op.drop_table('search_impressions')
