"""add the free Basic plan

Business registration asks the owner to choose a plan, and a free listing has
always been part of the offer (the site footer links to it). A plan with an
amount of 0 is that option: choosing it activates the subscription at once and
skips payment entirely.

A data migration rather than a seed row because the registration flow depends
on it existing - it is part of the product, not demo data. The paid plans stay
in scripts/seed_directory.py.

Revision ID: a3c9f1d2b7e4
Revises: 78fadada7aeb
Create Date: 2026-09-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3c9f1d2b7e4'
down_revision: Union[str, None] = '78fadada7aeb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Keyed on name, the same rule seed_plans() uses, so re-running against a
    # database that already has a Basic plan changes nothing.
    op.execute(
        sa.text(
            """
            INSERT INTO plans (name, description, billing_cycle, amount, currency, is_active)
            SELECT 'Basic',
                   'A free listing: your business profile, contact details and customer enquiries.',
                   'monthly', 0.00, 'CAD', true
            WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'Basic')
            """
        )
    )


def downgrade() -> None:
    # Only when nothing subscribes to it: plans.id is RESTRICT on subscriptions,
    # and deleting a plan out from under its subscribers would fail anyway.
    op.execute(
        sa.text(
            """
            DELETE FROM plans
            WHERE name = 'Basic' AND amount = 0
              AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.plan_id = plans.id)
            """
        )
    )
