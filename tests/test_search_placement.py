"""Search ordering by subscription tier, and the Monthly rotation."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.models.business import Business, BusinessStatus
from app.models.category import Category
from app.models.subscription import Plan, Subscription, SubscriptionStatus
from app.models.verification import BusinessVerification, VerificationStatus
from app.services import placement

# A fixed moment, so the rotation window is known.
NOW = datetime(2026, 9, 17, 10, 5, tzinfo=timezone.utc)
VANCOUVER = (49.2827, -123.1207)


@pytest.fixture()
def db_factory(test_engine):
    return sessionmaker(bind=test_engine, future=True)


@pytest.fixture(autouse=True)
def pinned_clock(monkeypatch):
    clock = {"now": NOW}
    monkeypatch.setattr(placement, "now_utc", lambda: clock["now"])
    return clock


@pytest.fixture()
def plan_ids(db_factory) -> dict[str, int]:
    with db_factory() as db:
        rows = db.scalars(select(Plan).where(Plan.name.in_(["Annual", "Monthly", "Basic"]))).all()
        return {plan.name.lower(): plan.id for plan in rows}


@pytest.fixture()
def world(db_factory, plan_ids):
    """A fresh category per test, so each search sees only its own listings."""
    with db_factory() as db:
        slug = f"placement-{uuid.uuid4().hex[:10]}"
        category = Category(name=f"Placement {slug}", slug=slug)
        db.add(category)
        db.commit()
        category_id = category.id

    def add(
        name: str,
        *,
        rating: float | None = 4.0,
        km_north: float = 1.0,
        plan: str | None = None,
        status: SubscriptionStatus = SubscriptionStatus.active,
        period_end: datetime | None | str = "default",
        created_days_ago: int = 0,
    ) -> int:
        with db_factory() as db:
            business = Business(
                name=name,
                slug=f"{slug}-{uuid.uuid4().hex[:8]}",
                category_id=category_id,
                city="Vancouver",
                province="BC",
                latitude=VANCOUVER[0] + km_north / 111.0,
                longitude=VANCOUVER[1],
                status=BusinessStatus.approved,
                is_active=True,
                verified=True,
                rating=rating,
                review_count=10 if rating is not None else 0,
                created_at=NOW - timedelta(days=created_days_ago),
            )
            db.add(business)
            db.flush()
            db.add(
                BusinessVerification(
                    business_id=business.id,
                    email="kyc@example.ca",
                    mobile_number="6045550100",
                    status=VerificationStatus.verified,
                )
            )
            if plan is not None:
                end = period_end
                if end == "default":
                    end = None if plan == "basic" else NOW + timedelta(days=20)
                db.add(
                    Subscription(
                        business_id=business.id,
                        plan_id=plan_ids[plan],
                        status=status,
                        current_period_end=end,
                    )
                )
            db.commit()
            return business.id

    return {"slug": slug, "add": add}


def _search(client: TestClient, slug: str, **params):
    query = {"category_slug": slug, "page_size": 50, **params}
    r = client.get("/api/v1/businesses/search", params=query)
    assert r.status_code == 200, r.text
    return r.json()


def _names(body) -> list[str]:
    return [item["name"] for item in body["items"]]


def test_tiers_come_before_rating(client, world):
    add = world["add"]
    add("No plan, perfect rating", rating=5.0)
    add("Basic", rating=4.9, plan="basic")
    add("Monthly", rating=4.0, plan="monthly")
    add("Annual, lowest rating", rating=3.0, plan="annual")

    body = _search(client, world["slug"])

    assert _names(body) == ["Annual, lowest rating", "Monthly", "Basic", "No plan, perfect rating"]
    fields = ("subscription_tier", "is_featured", "featured_badge", "display_priority")
    assert [tuple(item[f] for f in fields) for item in body["items"]] == [
        ("annual", True, "⭐", 1),
        ("monthly", False, "📈", 2),
        ("basic", False, None, 3),
        ("none", False, None, None),
    ]


def test_within_a_tier_rating_then_distance_then_age(client, world):
    add = world["add"]
    add("Annual far", rating=4.0, km_north=9, plan="annual")
    add("Annual near", rating=4.0, km_north=1, plan="annual")
    add("Annual best", rating=4.8, km_north=20, plan="annual")
    add("Unrated", rating=None, plan="annual")

    near_me = _search(client, world["slug"], lat=VANCOUVER[0], lng=VANCOUVER[1])
    assert _names(near_me) == ["Annual best", "Annual near", "Annual far", "Unrated"]

    add("Old basic", rating=4.0, plan="basic", created_days_ago=400)
    add("New basic", rating=4.0, plan="basic", created_days_ago=1)
    without_point = _search(client, world["slug"])
    assert _names(without_point)[-2:] == ["Old basic", "New basic"]


def test_the_chosen_sort_applies_within_each_tier(client, world):
    add = world["add"]
    add("Zed annual", plan="annual")
    add("Abe annual", plan="annual")
    add("Aaron no plan")
    add("Mona basic", plan="basic")

    body = _search(client, world["slug"], sort="name")

    assert _names(body) == ["Abe annual", "Zed annual", "Mona basic", "Aaron no plan"]


def test_only_live_subscriptions_count(client, world, plan_ids):
    add = world["add"]
    add("Expired annual", plan="annual", period_end=NOW - timedelta(days=1))
    add("Cancelled annual", plan="annual", status=SubscriptionStatus.canceled)
    add("Unpaid monthly", plan="monthly", status=SubscriptionStatus.incomplete)
    add("Live basic", plan="basic")

    tiers = {i["name"]: i["subscription_tier"] for i in _search(client, world["slug"])["items"]}

    assert tiers == {
        "Expired annual": "none",
        "Cancelled annual": "none",
        "Unpaid monthly": "none",
        "Live basic": "basic",
    }


def test_best_live_plan_wins(client, world, db_factory, plan_ids):
    business_id = world["add"]("Upgraded", plan="basic")
    with db_factory() as db:
        db.add(
            Subscription(
                business_id=business_id,
                plan_id=plan_ids["annual"],
                status=SubscriptionStatus.active,
                current_period_end=NOW + timedelta(days=300),
            )
        )
        db.commit()

    item = _search(client, world["slug"])["items"][0]

    assert item["subscription_tier"] == "annual"


def test_placement_never_hides_anyone(client, world):
    add = world["add"]
    for i in range(3):
        add(f"Annual {i}", plan="annual")
    for i in range(4):
        add(f"No plan {i}")

    pages = [_search(client, world["slug"], page_size=2, page=p) for p in (1, 2, 3, 4)]

    seen = [name for page in pages for name in _names(page)]
    assert pages[0]["total"] == 7
    assert len(seen) == 7 and len(set(seen)) == 7
    assert all(name.startswith("Annual") for name in seen[:3])
    assert all(name.startswith("No plan") for name in seen[3:])


def _monthly_leaders(client, slug) -> list[str]:
    return [i["name"] for i in _search(client, slug)["items"] if i["subscription_tier"] == "monthly"][:3]


def test_monthly_rotation_changes_every_30_minutes_and_is_stable_within_one(
    client, world, pinned_clock
):
    add = world["add"]
    names = [f"Monthly {chr(65 + i)}" for i in range(7)]
    for name in names:
        add(name, rating=4.0, plan="monthly")
    add("Annual", plan="annual")

    pinned_clock["now"] = NOW
    first = _monthly_leaders(client, world["slug"])
    pinned_clock["now"] = NOW + timedelta(minutes=20)  # same window
    assert _monthly_leaders(client, world["slug"]) == first

    windows = []
    for step in range(3):
        pinned_clock["now"] = NOW + timedelta(minutes=30 * step)
        windows.append(set(_monthly_leaders(client, world["slug"])))

    # Consecutive windows lead with different subscribers...
    assert windows[0].isdisjoint(windows[1])
    assert windows[1].isdisjoint(windows[2])
    # ...and within three windows all seven have had a turn.
    assert set().union(*windows) == set(names)
    # Annual still comes first whatever the rotation.
    assert _search(client, world["slug"])["items"][0]["name"] == "Annual"


def test_rotation_leaders_are_ordered_by_rating(client, world, pinned_clock):
    add = world["add"]
    ratings = {"M1": 3.1, "M2": 4.9, "M3": 3.9, "M4": 4.2, "M5": 3.5, "M6": 4.6}
    for name, rating in ratings.items():
        add(name, rating=rating, plan="monthly")

    for step in range(2):
        pinned_clock["now"] = NOW + timedelta(minutes=30 * step)
        items = _search(client, world["slug"])["items"]
        leaders = [ratings[i["name"]] for i in items[:3]]
        rest = [ratings[i["name"]] for i in items[3:]]
        assert leaders == sorted(leaders, reverse=True)
        assert rest == sorted(rest, reverse=True)


def test_rotation_cycle_is_half_hours():
    base = datetime(2026, 9, 17, 10, 0, tzinfo=timezone.utc)
    assert placement.rotation_cycle(base) == placement.rotation_cycle(base + timedelta(minutes=29, seconds=59))
    assert placement.rotation_cycle(base + timedelta(minutes=30)) == placement.rotation_cycle(base) + 1


# ------------------------------------------------ response: position and why


def test_badges_labels_and_positions(client, world):
    add = world["add"]
    add("Annual A", rating=4.8, plan="annual")
    add("Annual B", rating=4.1, plan="annual")
    add("Monthly", rating=4.0, plan="monthly")
    add("Basic", plan="basic")
    add("Nobody", rating=3.0)

    items = _search(client, world["slug"])["items"]

    assert [(i["name"], i["position"], i["badge"], i["badge_label"]) for i in items] == [
        ("Annual A", 1, "⭐ Featured", "Featured Business"),
        ("Annual B", 2, "⭐ Featured", "Featured Business"),
        ("Monthly", 3, "📈 Promoted", "Promoted Business"),
        ("Basic", 4, None, None),
        ("Nobody", 5, None, None),
    ]
    assert [i["display_reason"] for i in items] == [
        "Annual subscriber (Featured), highest rated",
        "Annual subscriber (Featured), 2nd of 2 by rating",
        "Monthly subscriber (Promoted), in this half hour's rotation, the only one in this group",
        "Basic plan, the only one in this group",
        "No subscription, listed after subscribers, the only one in this group",
    ]


def test_positions_continue_across_pages_and_reasons_count_within_the_tier(client, world):
    add = world["add"]
    for i, rating in enumerate([4.9, 4.5, 4.1, 3.7, 3.3]):
        add(f"Free {i}", rating=rating)

    page2 = _search(client, world["slug"], page_size=2, page=2, lat=VANCOUVER[0], lng=VANCOUVER[1])

    assert [i["position"] for i in page2["items"]] == [3, 4]
    assert page2["items"][0]["display_reason"] == (
        "No subscription, listed after subscribers, 3rd of 5 by rating, then distance"
    )


def test_monthly_reason_separates_the_rotation_from_the_rest(client, world):
    for i in range(5):
        world["add"](f"M{i}", rating=4.0, plan="monthly")

    reasons = [i["display_reason"] for i in _search(client, world["slug"])["items"]]

    assert reasons[0] == "Monthly subscriber (Promoted), in this half hour's rotation, highest rated"
    assert reasons[2] == "Monthly subscriber (Promoted), in this half hour's rotation, 3rd of 3 by rating"
    assert reasons[3] == "Monthly subscriber (Promoted), after this half hour's rotation, highest rated"
    assert reasons[4] == "Monthly subscriber (Promoted), after this half hour's rotation, 2nd of 2 by rating"


def test_total_is_right_past_the_last_page(client, world):
    for i in range(3):
        world["add"](f"Listing {i}")

    beyond = _search(client, world["slug"], page_size=2, page=5)

    assert beyond["items"] == []
    assert beyond["total"] == 3 and beyond["total_pages"] == 2 and beyond["has_prev"] is True
