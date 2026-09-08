"""business verification kyc, plans and subscriptions

Creates the three tables behind KYC and the optional subscription scaffolding,
plus their Postgres enum types.

Nothing existing is altered. Businesses that predate this migration end up with
no verification row at all, which means they disappear from /businesses/search
until one exists and is approved - the search gate joins the new table. Run
`python -m scripts.seed` after upgrading: it marks the seeded catalogue verified
and creates the demo plans.

(Referred to as migration "0002" in the feature plan; the revision id follows
this repository's existing hash-based naming.)

Revision ID: ff6f94a63e4f
Revises: 43064260ad2a
Create Date: 2026-09-08 17:22:53.458532

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ff6f94a63e4f'
down_revision: Union[str, None] = '43064260ad2a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'plans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column(
            'billing_cycle',
            sa.Enum('monthly', 'yearly', name='billing_cycle_enum'),
            nullable=False,
        ),
        # Numeric, not float: money that drifts by a cent per operation is a
        # bug you only find in an audit.
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('currency', sa.String(length=3), server_default='CAD', nullable=False),
        sa.Column('stripe_price_id', sa.String(length=128), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'business_verifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=320), nullable=False),
        sa.Column('mobile_number', sa.String(length=32), nullable=False),
        sa.Column('license_number', sa.String(length=64), nullable=True),
        sa.Column('license_document_url', sa.String(length=1024), nullable=True),
        sa.Column('gst_number', sa.String(length=32), nullable=True),
        sa.Column('gst_document_url', sa.String(length=1024), nullable=True),
        sa.Column(
            'status',
            sa.Enum('pending', 'verified', 'rejected', name='verification_status_enum'),
            server_default='pending',
            nullable=False,
        ),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('reviewed_by', sa.Integer(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'submitted_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        # CASCADE: a deleted listing has nothing left to verify.
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        # SET NULL: losing the reviewer's account must not erase the decision.
        sa.ForeignKeyConstraint(['reviewed_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    # UNIQUE: one listing, one verification record. A resubmission updates the
    # row rather than adding a second one.
    op.create_index(
        op.f('ix_business_verifications_business_id'),
        'business_verifications',
        ['business_id'],
        unique=True,
    )
    op.create_index(
        'ix_business_verifications_status',
        'business_verifications',
        ['status'],
        unique=False,
    )

    op.create_table(
        'subscriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('plan_id', sa.Integer(), nullable=False),
        sa.Column(
            'status',
            sa.Enum(
                'incomplete',
                'active',
                'past_due',
                'canceled',
                name='subscription_status_enum',
            ),
            server_default='incomplete',
            nullable=False,
        ),
        sa.Column('gateway_customer_id', sa.String(length=128), nullable=True),
        sa.Column('gateway_subscription_id', sa.String(length=128), nullable=True),
        sa.Column('gateway_checkout_session_id', sa.String(length=128), nullable=True),
        sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('canceled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        # RESTRICT: a plan with subscribers cannot be deleted under them.
        sa.ForeignKeyConstraint(['plan_id'], ['plans.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('gateway_subscription_id'),
    )
    op.create_index(
        op.f('ix_subscriptions_business_id'), 'subscriptions', ['business_id'],
        unique=False,
    )
    op.create_index(
        'ix_subscriptions_business_status',
        'subscriptions',
        ['business_id', 'status'],
        unique=False,
    )
    op.create_index(
        op.f('ix_subscriptions_gateway_checkout_session_id'),
        'subscriptions',
        ['gateway_checkout_session_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_subscriptions_plan_id'), 'subscriptions', ['plan_id'], unique=False
    )
    op.create_index(
        op.f('ix_subscriptions_status'), 'subscriptions', ['status'], unique=False
    )

    # NOTE: autogenerate proposes dropping ix_review_queue_open here on every
    # run. It is a partial index the ORM cannot express, so Alembic sees it as
    # unexpected. Dropping it would quietly deoptimise the review console.


def downgrade() -> None:
    op.drop_index(op.f('ix_subscriptions_status'), table_name='subscriptions')
    op.drop_index(op.f('ix_subscriptions_plan_id'), table_name='subscriptions')
    op.drop_index(
        op.f('ix_subscriptions_gateway_checkout_session_id'), table_name='subscriptions'
    )
    op.drop_index('ix_subscriptions_business_status', table_name='subscriptions')
    op.drop_index(op.f('ix_subscriptions_business_id'), table_name='subscriptions')
    op.drop_table('subscriptions')

    op.drop_index('ix_business_verifications_status', table_name='business_verifications')
    op.drop_index(
        op.f('ix_business_verifications_business_id'),
        table_name='business_verifications',
    )
    op.drop_table('business_verifications')

    op.drop_table('plans')

    # drop_table leaves the enum types behind on Postgres, and a re-upgrade
    # then fails with "type already exists". Drop them explicitly, after the
    # tables that use them.
    bind = op.get_bind()
    for enum_name in (
        'subscription_status_enum',
        'verification_status_enum',
        'billing_cycle_enum',
    ):
        sa.Enum(name=enum_name).drop(bind, checkfirst=True)
