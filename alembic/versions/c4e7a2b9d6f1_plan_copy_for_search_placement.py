"""plan copy for search placement

Search now ranks by plan: Annual listings are Featured (first), Monthly are
Promoted (above Basic, rotating every 30 minutes), then Basic, then listings
with no plan. The previous copy promised the opposite - "search results are
never ranked by plan" - so it is restated here to match what the product does.

Data only; no schema change.

Revision ID: c4e7a2b9d6f1
Revises: b8d2e5f1c3a9
Create Date: 2026-09-17 21:00:00.000000

"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4e7a2b9d6f1'
down_revision: Union[str, None] = 'b8d2e5f1c3a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


FEATURED = "⭐ Featured: shown first in search results"
PROMOTED = "📈 Promoted: shown above Basic listings, taking turns at the top every 30 minutes"
LISTED = "Listed in search after Featured and Promoted businesses"

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

PLANS = {
    "Annual": {
        "description": "Featured first in search, paid once a year with two months free.",
        "details": (
            "Annual makes your listing Featured: it appears first in search "
            "results, marked ⭐ Featured, ordered among other Annual businesses by "
            "rating and distance. It costs $290 a year instead of $348 for twelve "
            "monthly payments - two months free. GST/HST for your province is added "
            "at checkout. Paid features marked Coming soon are included as they "
            "launch, at no extra cost. The plan renews automatically every twelve "
            f"months until you cancel. {CANCEL}"
        ),
        "features": [
            {"label": FEATURED, "status": "included"},
            {"label": TWO_FREE, "status": "included"},
            *CORE,
            *PAID_EXTRAS,
        ],
        "benefits": [
            "Shown first in search results",
            "Save $58 a year compared with Monthly",
            "One payment covers twelve months",
        ],
    },
    "Monthly": {
        "description": "Promoted above free listings in search, billed monthly.",
        "details": (
            "Monthly makes your listing Promoted: it appears above Basic listings, "
            "marked 📈 Promoted. Monthly businesses take turns at the top of their "
            "group - every 30 minutes a different three lead - so each gets a fair "
            "share of the most visible places. Featured (Annual) listings still "
            "come first. Billed every month in Canadian dollars, with GST/HST for "
            "your province added at checkout. Paid features marked Coming soon are "
            "included as they launch. The plan renews automatically each month "
            f"until you cancel. {CANCEL}"
        ),
        "features": [{"label": PROMOTED, "status": "included"}, *CORE, *PAID_EXTRAS],
        "benefits": [
            "Shown above free listings in search",
            "Month-to-month billing, no annual commitment",
            "A receipt every month with GST/HST shown",
        ],
    },
    "Basic": {
        "description": "A free listing with your profile, contact details and customer enquiries.",
        "details": (
            "Basic is free and needs no card. Your business gets a public profile "
            "with contact details, opening hours and a map location, customer "
            "enquiries in your dashboard, and replies to reviews. Basic listings "
            "appear in search once reviewed and verified, after Featured (Annual) "
            "and Promoted (Monthly) businesses."
        ),
        "features": [{"label": LISTED, "status": "included"}, *CORE],
        "benefits": [
            "No cost and no card required",
            "Listed in search once reviewed and verified",
            "Customer enquiries go straight to your dashboard",
        ],
    },
}

# What b8d2e5f1c3a9 set, for downgrade.
PREVIOUS = {
    "Annual": {
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
    "Monthly": {
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
    "Basic": {
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
}


def _apply(content: dict) -> None:
    conn = op.get_bind()
    for name, plan in content.items():
        conn.execute(
            sa.text(
                "UPDATE plans SET description = :description, details = :details, "
                "features = CAST(:features AS JSONB), benefits = CAST(:benefits AS JSONB) "
                "WHERE name = :name"
            ),
            {
                "name": name,
                "description": plan["description"],
                "details": plan["details"],
                "features": json.dumps(plan["features"], ensure_ascii=False),
                "benefits": json.dumps(plan["benefits"], ensure_ascii=False),
            },
        )


def upgrade() -> None:
    _apply(PLANS)


def downgrade() -> None:
    _apply(PREVIOUS)
