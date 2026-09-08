"""business ownership status and listing fields

Adds listing ownership (businesses.owner_id), a moderation status, the extra
fields the owner dashboard form collects, and a user role enum that coexists
with is_admin. Backfills existing rows so nothing disappears from public view.

Revision ID: 085c0a2ab5c1
Revises: 53c5c9fdab4a
Create Date: 2026-09-08 06:56:22.254850

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '085c0a2ab5c1'
down_revision: Union[str, None] = '53c5c9fdab4a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


business_status_enum = sa.Enum(
    'pending', 'approved', 'rejected', 'suspended', name='business_status_enum'
)
user_role_enum = sa.Enum(
    'customer', 'business_owner', 'admin', name='user_role_enum'
)


def upgrade() -> None:
    bind = op.get_bind()
    # checkfirst so a partially-applied run can be retried.
    business_status_enum.create(bind, checkfirst=True)
    user_role_enum.create(bind, checkfirst=True)

    op.add_column('businesses', sa.Column('owner_id', sa.Integer(), nullable=True))
    op.add_column('businesses', sa.Column('status', business_status_enum, server_default='pending', nullable=False))
    op.add_column('businesses', sa.Column('whatsapp', sa.String(length=32), nullable=True))
    op.add_column('businesses', sa.Column('price_range', sa.String(length=8), nullable=True))
    op.add_column('businesses', sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('businesses', sa.Column('opening_hours', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('businesses', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))
    op.create_index(op.f('ix_businesses_owner_id'), 'businesses', ['owner_id'], unique=False)
    op.create_index(op.f('ix_businesses_status'), 'businesses', ['status'], unique=False)
    op.create_index('ix_businesses_status_active', 'businesses', ['status', 'is_active'], unique=False)
    op.create_foreign_key(
        'fk_businesses_owner_id_users', 'businesses', 'users', ['owner_id'], ['id'],
        ondelete='SET NULL',
    )
    op.add_column('users', sa.Column('role', user_role_enum, server_default='customer', nullable=False))
    op.create_index(op.f('ix_users_role'), 'users', ['role'], unique=False)

    # Every listing that existed before moderation was introduced was already
    # public, so it is approved by definition. Defaulting it to 'pending' would
    # empty the public catalogue on deploy.
    op.execute("UPDATE businesses SET status = 'approved'")
    # Keep the new role column in agreement with the is_admin boolean the
    # review console still gates on.
    op.execute("UPDATE users SET role = 'admin' WHERE is_admin = true")


def downgrade() -> None:
    op.drop_index(op.f('ix_users_role'), table_name='users')
    op.drop_column('users', 'role')
    op.drop_constraint('fk_businesses_owner_id_users', 'businesses', type_='foreignkey')
    op.drop_index('ix_businesses_status_active', table_name='businesses')
    op.drop_index(op.f('ix_businesses_status'), table_name='businesses')
    op.drop_index(op.f('ix_businesses_owner_id'), table_name='businesses')
    op.drop_column('businesses', 'updated_at')
    op.drop_column('businesses', 'opening_hours')
    op.drop_column('businesses', 'tags')
    op.drop_column('businesses', 'price_range')
    op.drop_column('businesses', 'whatsapp')
    op.drop_column('businesses', 'status')
    op.drop_column('businesses', 'owner_id')

    business_status_enum.drop(op.get_bind(), checkfirst=True)
    user_role_enum.drop(op.get_bind(), checkfirst=True)
