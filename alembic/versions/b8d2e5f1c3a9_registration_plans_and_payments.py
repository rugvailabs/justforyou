"""registration: plan content, owner registration progress, payments

Three changes for the four-step business registration:

1. plans gains the content the plan cards and "Learn more" panel show - badge,
   features, benefits, long details, display order - and the catalogue is
   settled as Annual, Monthly and Basic. "Standard" and "Standard (yearly)" are
   renamed rather than replaced, so any subscription already pointing at them
   keeps its plan. Plans are product data from here on, owned by migrations;
   the seed script no longer creates them.

   The copy is deliberately literal. Everything marked "included" exists in
   the product today; the paid-only perks do not, so they are "coming_soon"
   and say so on the page. Search ranking never depends on the plan, and the
   copy says that too.

2. users gains registration progress (is_active, registration_step,
   selected_plan_id, registration_data, registration_completed_at). Existing
   accounts are active and have no registration step.

3. payments: one row per successful charge, with the tax breakdown a Canadian
   receipt needs.

Revision ID: b8d2e5f1c3a9
Revises: a3c9f1d2b7e4
Create Date: 2026-09-17 18:00:00.000000

"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'b8d2e5f1c3a9'
down_revision: Union[str, None] = 'a3c9f1d2b7e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PROFILE = "Business profile page with your contact details"
ENQUIRIES = "Customer enquiries sent to your dashboard"
REVIEWS = "Reply publicly to customer reviews"
LOCATION = 'Opening hours and map location, with distance in "near me" searches'
VERIFIED = "Verified badge once your business passes verification"
PHOTOS = "Photo gallery on your profile"
INSIGHTS = "Lead insights: profile views, calls and enquiries"
SUPPORT = "Priority support"
TWO_FREE = "Two months free compared with paying monthly"

CORE = [
    {"label": PROFILE, "status": "included"},
    {"label": ENQUIRIES, "status": "included"},
    {"label": REVIEWS, "status": "included"},
    {"label": LOCATION, "status": "included"},
    {"label": VERIFIED, "status": "included"},
]
PAID_EXTRAS = [
    {"label": PHOTOS, "status": "coming_soon"},
    {"label": INSIGHTS, "status": "coming_soon"},
    {"label": SUPPORT, "status": "coming_soon"},
]

CANCEL = "To cancel, contact us through the Contact page."

PLANS = [
    {
        "name": "Annual",
        "renamed_from": "Standard (yearly)",
        "billing_cycle": "yearly",
        "amount": "290.00",
        "sort_order": 1,
        "badge": "Best value",
        "description": "The Monthly plan paid once a year, with two months free.",
        "details": (
            "Annual is the Monthly plan paid once a year: $290 instead of $348 for "
            "twelve monthly payments, which is two months free. GST/HST for your "
            "province is added at checkout. Paid features marked Coming soon are "
            "included as they launch, at no extra cost. The plan renews "
            f"automatically every twelve months until you cancel. {CANCEL}"
        ),
        "features": [{"label": TWO_FREE, "status": "included"}, *CORE, *PAID_EXTRAS],
        "benefits": [
            "Save $58 a year compared with Monthly",
            "One payment covers twelve months",
            "New paid features included as they launch",
        ],
    },
    {
        "name": "Monthly",
        "renamed_from": "Standard",
        "billing_cycle": "monthly",
        "amount": "29.00",
        "sort_order": 2,
        "badge": "Pay monthly",
        "description": "Everything in Basic, billed monthly, plus paid features as they launch.",
        "details": (
            "Monthly includes everything in Basic and is billed every month in "
            "Canadian dollars, with GST/HST for your province added at checkout. "
            "The paid features marked Coming soon - a photo gallery, lead insights "
            "and priority support - are included as they launch, at no extra "
            "cost. The plan renews automatically each month until you cancel. "
            f"{CANCEL}"
        ),
        "features": [*CORE, *PAID_EXTRAS],
        "benefits": [
            "Month-to-month billing, no annual commitment",
            "New paid features included as they launch",
            "A receipt every month with GST/HST shown",
        ],
    },
    {
        "name": "Basic",
        "renamed_from": None,
        "billing_cycle": "monthly",
        "amount": "0.00",
        "sort_order": 3,
        "badge": "Free",
        "description": "A free listing with your profile, contact details and customer enquiries.",
        "details": (
            "Basic is free and needs no card. Your business gets a public profile "
            "with contact details, opening hours and a map location, customer "
            "enquiries in your dashboard, and replies to reviews. Basic listings "
            "are reviewed and shown in search exactly like paid ones - search "
            "results are never ranked by plan."
        ),
        "features": CORE,
        "benefits": [
            "No cost and no card required",
            "Reviewed and shown in search exactly like paid listings",
            "Customer enquiries go straight to your dashboard",
        ],
    },
]


def upgrade() -> None:
    # ---------------------------------------------------------------- plans
    op.add_column('plans', sa.Column('details', sa.Text(), nullable=True))
    op.add_column('plans', sa.Column('badge', sa.String(length=64), nullable=True))
    op.add_column('plans', sa.Column('features', postgresql.JSONB(), nullable=True))
    op.add_column('plans', sa.Column('benefits', postgresql.JSONB(), nullable=True))
    op.add_column(
        'plans',
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
    )

    conn = op.get_bind()
    for plan in PLANS:
        if plan["renamed_from"]:
            conn.execute(
                sa.text(
                    "UPDATE plans SET name = :name WHERE name = :old "
                    "AND NOT EXISTS (SELECT 1 FROM plans WHERE name = :name)"
                ),
                {"name": plan["name"], "old": plan["renamed_from"]},
            )
        conn.execute(
            sa.text(
                "INSERT INTO plans (name, billing_cycle, amount, currency, is_active) "
                "SELECT :name, CAST(:cycle AS billing_cycle_enum), :amount, 'CAD', true "
                "WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = :name)"
            ),
            {"name": plan["name"], "cycle": plan["billing_cycle"], "amount": plan["amount"]},
        )
        conn.execute(
            sa.text(
                "UPDATE plans SET description = :description, details = :details, "
                "badge = :badge, features = CAST(:features AS JSONB), "
                "benefits = CAST(:benefits AS JSONB), sort_order = :sort_order "
                "WHERE name = :name"
            ),
            {
                "name": plan["name"],
                "description": plan["description"],
                "details": plan["details"],
                "badge": plan["badge"],
                "features": json.dumps(plan["features"]),
                "benefits": json.dumps(plan["benefits"]),
                "sort_order": plan["sort_order"],
            },
        )

    # ---------------------------------------------------------------- users
    op.add_column(
        'users',
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
    )
    op.add_column('users', sa.Column('registration_step', sa.SmallInteger(), nullable=True))
    op.add_column('users', sa.Column('selected_plan_id', sa.Integer(), nullable=True))
    op.add_column('users', sa.Column('registration_data', postgresql.JSONB(), nullable=True))
    op.add_column(
        'users',
        sa.Column('registration_completed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_users_selected_plan_id_plans',
        'users',
        'plans',
        ['selected_plan_id'],
        ['id'],
        ondelete='SET NULL',
    )

    # ------------------------------------------------------------- payments
    op.create_table(
        'payments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('receipt_number', sa.String(length=32), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('plan_id', sa.Integer(), nullable=False),
        sa.Column('subscription_id', sa.Integer(), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('subtotal', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('tax_total', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('total', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('tax_lines', postgresql.JSONB(), nullable=False),
        sa.Column('province', sa.String(length=2), nullable=False),
        sa.Column('gateway', sa.String(length=32), nullable=False),
        sa.Column('gateway_payment_id', sa.String(length=128), nullable=False),
        sa.Column('card_brand', sa.String(length=32), nullable=True),
        sa.Column('card_last4', sa.String(length=4), nullable=True),
        sa.Column('terms_accepted_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['plan_id'], ['plans.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['subscription_id'], ['subscriptions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('receipt_number'),
    )
    op.create_index(op.f('ix_payments_user_id'), 'payments', ['user_id'], unique=False)
    op.create_index(
        op.f('ix_payments_subscription_id'), 'payments', ['subscription_id'], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_payments_subscription_id'), table_name='payments')
    op.drop_index(op.f('ix_payments_user_id'), table_name='payments')
    op.drop_table('payments')

    op.drop_constraint('fk_users_selected_plan_id_plans', 'users', type_='foreignkey')
    op.drop_column('users', 'registration_completed_at')
    op.drop_column('users', 'registration_data')
    op.drop_column('users', 'selected_plan_id')
    op.drop_column('users', 'registration_step')
    op.drop_column('users', 'is_active')

    conn = op.get_bind()
    for plan in PLANS:
        if plan["renamed_from"]:
            conn.execute(
                sa.text("UPDATE plans SET name = :old WHERE name = :name"),
                {"name": plan["name"], "old": plan["renamed_from"]},
            )
    op.drop_column('plans', 'sort_order')
    op.drop_column('plans', 'benefits')
    op.drop_column('plans', 'features')
    op.drop_column('plans', 'badge')
    op.drop_column('plans', 'details')
