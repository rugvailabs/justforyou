"""add categories and businesses tables

Public directory tables, separate from `providers` (the submission
pipeline's matching pool, which has no address, coordinates or rating).

Revision ID: 53c5c9fdab4a
Revises: 595f4a670259
Create Date: 2026-09-07 19:44:00.979098

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '53c5c9fdab4a'
down_revision: Union[str, None] = '595f4a670259'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('categories',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=128), nullable=False),
    sa.Column('slug', sa.String(length=128), nullable=False),
    sa.Column('parent_id', sa.Integer(), nullable=True),
    sa.Column('description', sa.String(length=512), nullable=True),
    sa.Column('icon', sa.String(length=64), nullable=True),
    sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['parent_id'], ['categories.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_categories_parent_id'), 'categories', ['parent_id'], unique=False)
    op.create_index(op.f('ix_categories_slug'), 'categories', ['slug'], unique=True)
    op.create_table('businesses',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('slug', sa.String(length=255), nullable=False),
    sa.Column('category_id', sa.Integer(), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('address', sa.String(length=255), nullable=True),
    sa.Column('city', sa.String(length=128), nullable=False),
    sa.Column('province', sa.String(length=2), server_default='ON', nullable=False),
    sa.Column('postal_code', sa.String(length=16), nullable=True),
    sa.Column('latitude', sa.Float(), nullable=True),
    sa.Column('longitude', sa.Float(), nullable=True),
    sa.Column('phone', sa.String(length=32), nullable=True),
    sa.Column('email', sa.String(length=320), nullable=True),
    sa.Column('website', sa.String(length=512), nullable=True),
    sa.Column('rating', sa.Float(), nullable=True),
    sa.Column('review_count', sa.Integer(), server_default='0', nullable=False),
    sa.Column('verified', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_businesses_active_rating', 'businesses', ['is_active', 'rating'], unique=False)
    op.create_index(op.f('ix_businesses_category_id'), 'businesses', ['category_id'], unique=False)
    op.create_index(op.f('ix_businesses_city'), 'businesses', ['city'], unique=False)
    op.create_index('ix_businesses_lat_lng', 'businesses', ['latitude', 'longitude'], unique=False)
    op.create_index(op.f('ix_businesses_name'), 'businesses', ['name'], unique=False)
    op.create_index(op.f('ix_businesses_slug'), 'businesses', ['slug'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_businesses_slug'), table_name='businesses')
    op.drop_index(op.f('ix_businesses_name'), table_name='businesses')
    op.drop_index('ix_businesses_lat_lng', table_name='businesses')
    op.drop_index(op.f('ix_businesses_city'), table_name='businesses')
    op.drop_index(op.f('ix_businesses_category_id'), table_name='businesses')
    op.drop_index('ix_businesses_active_rating', table_name='businesses')
    op.drop_table('businesses')
    op.drop_index(op.f('ix_categories_slug'), table_name='categories')
    op.drop_index(op.f('ix_categories_parent_id'), table_name='categories')
    op.drop_table('categories')
