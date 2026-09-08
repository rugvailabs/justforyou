"""add business reviews

Customer reviews of a listing, with one optional owner reply each. Named
business_reviews rather than reviews because this codebase already uses
"review" for the voice-submission moderation queue (review_queue).

Revision ID: ee4fa81e34da
Revises: d9e9f622ad37
Create Date: 2026-09-08 07:30:58.555092

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ee4fa81e34da'
down_revision: Union[str, None] = 'd9e9f622ad37'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('business_reviews',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('business_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('rating', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=True),
    sa.Column('body', sa.Text(), nullable=True),
    sa.Column('owner_reply', sa.Text(), nullable=True),
    sa.Column('owner_replied_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('rating BETWEEN 1 AND 5', name='ck_business_reviews_rating'),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('business_id', 'user_id', name='uq_business_reviews_author')
    )
    op.create_index(op.f('ix_business_reviews_business_id'), 'business_reviews', ['business_id'], unique=False)
    op.create_index(op.f('ix_business_reviews_created_at'), 'business_reviews', ['created_at'], unique=False)
    op.create_index(op.f('ix_business_reviews_user_id'), 'business_reviews', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_business_reviews_user_id'), table_name='business_reviews')
    op.drop_index(op.f('ix_business_reviews_created_at'), table_name='business_reviews')
    op.drop_index(op.f('ix_business_reviews_business_id'), table_name='business_reviews')
    op.drop_table('business_reviews')
