"""add enquiries table

Revision ID: d9e9f622ad37
Revises: 085c0a2ab5c1
Create Date: 2026-09-08 07:20:50.723144

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd9e9f622ad37'
down_revision: Union[str, None] = '085c0a2ab5c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('enquiries',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('business_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('enquiry_type', sa.Enum('call_click', 'callback', 'quote', 'chat', name='enquiry_type_enum'), nullable=False),
    sa.Column('message', sa.Text(), nullable=True),
    sa.Column('contact_name', sa.String(length=255), nullable=True),
    sa.Column('contact_phone', sa.String(length=32), nullable=True),
    sa.Column('contact_email', sa.String(length=320), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_enquiries_business_created', 'enquiries', ['business_id', 'created_at'], unique=False)
    op.create_index(op.f('ix_enquiries_business_id'), 'enquiries', ['business_id'], unique=False)
    op.create_index(op.f('ix_enquiries_created_at'), 'enquiries', ['created_at'], unique=False)
    op.create_index(op.f('ix_enquiries_enquiry_type'), 'enquiries', ['enquiry_type'], unique=False)
    op.create_index(op.f('ix_enquiries_user_id'), 'enquiries', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_enquiries_user_id'), table_name='enquiries')
    op.drop_index(op.f('ix_enquiries_enquiry_type'), table_name='enquiries')
    op.drop_index(op.f('ix_enquiries_created_at'), table_name='enquiries')
    op.drop_index(op.f('ix_enquiries_business_id'), table_name='enquiries')
    op.drop_index('ix_enquiries_business_created', table_name='enquiries')
    op.drop_table('enquiries')
