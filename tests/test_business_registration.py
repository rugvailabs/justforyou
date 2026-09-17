"""The four-step business registration: details, plan, payment, done."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.api.v1 import registration as registration_module
from app.models.business import Business
from app.models.category import Category
from app.models.subscription import Plan
from app.models.user import User
from app.services import sales_tax

GOOD_CARD = {"card_number": "4242 4242 4242 4242", "exp_month": 12, "exp_year": 99, "cvc": "123"}


@pytest.fixture()
def session_factory(test_engine):
    return sessionmaker(bind=test_engine, future=True)


@pytest.fixture(autouse=True)
def sent_emails(monkeypatch) -> list[dict]:
    sent: list[dict] = []

    def fake_send(**kwargs):
        sent.append(kwargs)
        return True

    monkeypatch.setattr(registration_module, "send_email", fake_send)
    return sent


@pytest.fixture()
def plan_ids(session_factory) -> dict[str, int]:
    """Annual, Monthly and Basic come from the migrations."""
    with session_factory() as db:
        rows = db.scalars(select(Plan).where(Plan.name.in_(["Annual", "Monthly", "Basic"]))).all()
        ids = {plan.name: plan.id for plan in rows}
    assert set(ids) == {"Annual", "Monthly", "Basic"}, "plan migration did not run"
    return ids


@pytest.fixture()
def category_id(session_factory) -> int:
    with session_factory() as db:
        category = db.scalar(select(Category).where(Category.slug == "test-registration"))
        if category is None:
            category = Category(name="Test Registration", slug="test-registration")
            db.add(category)
            db.commit()
        return category.id


def _start(client: TestClient, category_id: int, email: str | None = None, **overrides):
    body = {
        "name": "Reg Owner",
        "email": email or f"reg-{uuid.uuid4().hex[:10]}@example.ca",
        "phone": "+1 604 555 0100",
        "password": "password123",
        "business_name": "Registration Plumbing",
        "category_id": category_id,
        "address": "1 Water St",
        "city": "Toronto",
        "province": "ON",
        "postal_code": "M5V 1A1",
    }
    body.update(overrides)
    return client.post("/api/v1/registration/start", json=body)


def _auth(response) -> dict:
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _choose(client, headers, plan_id):
    return client.put("/api/v1/registration/plan", json={"plan_id": plan_id}, headers=headers)


def _pay(client, headers, **overrides):
    body = {**GOOD_CARD, "accept_terms": True, **overrides}
    return client.post("/api/v1/registration/payment", json=body, headers=headers)


# ------------------------------------------------------------------- plans


def test_plans_come_in_display_order_with_content(client, plan_ids):
    plans = [p for p in client.get("/api/v1/plans").json() if p["name"] in plan_ids]

    assert [p["name"] for p in plans] == ["Annual", "Monthly", "Basic"]
    assert [p["badge"] for p in plans] == ["Best value", "Pay monthly", "Free"]
    for plan in plans:
        assert len(plan["features"]) >= 3
        assert plan["details"] and plan["benefits"]
    # Nothing unbuilt is sold as included.
    basic = plans[2]
    assert all(f["status"] == "included" for f in basic["features"])
    assert any(f["status"] == "coming_soon" for f in plans[1]["features"])


# ------------------------------------------------------------------ step 1


def test_start_creates_an_inactive_account_and_no_listing(client, category_id, session_factory):
    r = _start(client, category_id)

    assert r.status_code == 201, r.text
    state = r.json()["state"]
    assert state["step"] == 2
    assert state["completed"] is False
    assert state["details"]["business_name"] == "Registration Plumbing"
    assert state["business"] is None
    headers = _auth(r)
    assert client.get("/api/v1/me", headers=headers).json()["is_active"] is False
    # The dashboard is locked until registration completes.
    assert client.get("/api/v1/businesses/owner/mine", headers=headers).status_code == 403
    user_id = client.get("/api/v1/me", headers=headers).json()["id"]
    with session_factory() as db:
        assert db.scalar(select(Business).where(Business.owner_id == user_id)) is None


def test_duplicate_email_is_refused_regardless_of_case(client, category_id):
    email = f"dup-{uuid.uuid4().hex[:8]}@example.ca"
    assert _start(client, category_id, email=email).status_code == 201

    r = _start(client, category_id, email=email.upper())

    assert r.status_code == 409
    assert "already exists" in r.json()["detail"]


def test_unknown_province_is_rejected(client, category_id):
    assert _start(client, category_id, province="ZZ").status_code == 422


def test_details_can_be_edited_after_going_back(client, category_id, plan_ids):
    headers = _auth(_start(client, category_id))
    _choose(client, headers, plan_ids["Monthly"])

    r = client.put(
        "/api/v1/registration/details",
        json={
            "name": "Renamed Owner",
            "phone": "604 555 0199",
            "business_name": "Renamed Plumbing",
            "category_id": category_id,
            "city": "Halifax",
            "province": "NS",
        },
        headers=headers,
    )

    assert r.status_code == 200, r.text
    state = r.json()
    assert state["details"]["business_name"] == "Renamed Plumbing"
    assert state["account"]["name"] == "Renamed Owner"
    # The plan survives, and the tax follows the new province.
    assert state["selected_plan"]["name"] == "Monthly"
    assert state["order"]["tax_lines"] == [{"name": "HST", "rate": "14", "amount": "4.06"}]


# ------------------------------------------------------------------ step 2


def test_plan_is_mandatory_before_payment(client, category_id):
    headers = _auth(_start(client, category_id))

    r = _pay(client, headers)

    assert r.status_code == 409
    assert "Choose a plan" in r.json()["detail"]


def test_choosing_a_plan_saves_it_and_prices_the_order(client, category_id, plan_ids):
    headers = _auth(_start(client, category_id))

    state = _choose(client, headers, plan_ids["Monthly"]).json()

    assert state["step"] == 3
    order = state["order"]
    assert order["subtotal"] == "29.00"
    assert order["tax_lines"] == [{"name": "HST", "rate": "13", "amount": "3.77"}]
    assert order["total"] == "32.77"
    assert order["period_label"] == "1 month"
    assert order["renews_on"] is not None
    # Resuming later returns the same selection.
    assert client.get("/api/v1/registration", headers=headers).json()["selected_plan"]["name"] == "Monthly"


def test_changing_the_plan_replaces_the_selection(client, category_id, plan_ids):
    headers = _auth(_start(client, category_id))
    _choose(client, headers, plan_ids["Monthly"])

    state = _choose(client, headers, plan_ids["Annual"]).json()

    assert state["selected_plan"]["name"] == "Annual"
    assert state["order"]["total"] == "327.70"
    assert state["order"]["period_label"] == "12 months"


def test_british_columbia_pays_gst_and_pst_is_flagged_not_charged(client, category_id, plan_ids):
    headers = _auth(_start(client, category_id, city="Vancouver", province="BC"))

    order = _choose(client, headers, plan_ids["Monthly"]).json()["order"]

    assert order["tax_lines"] == [{"name": "GST", "rate": "5", "amount": "1.45"}]
    assert order["total"] == "30.45"
    assert order["uncollected_taxes"] == ["PST (7%)"]


# ------------------------------------------------------------ steps 3 and 4


def test_declined_payment_creates_nothing_and_can_be_retried(
    client, category_id, plan_ids, sent_emails
):
    headers = _auth(_start(client, category_id))
    _choose(client, headers, plan_ids["Monthly"])

    declined = _pay(client, headers, card_number="4000 0000 0000 0002")

    assert declined.status_code == 402
    assert declined.json()["detail"] == "Your card was declined."
    state = client.get("/api/v1/registration", headers=headers).json()
    assert state["completed"] is False and state["business"] is None
    assert sent_emails == []

    paid = _pay(client, headers)

    assert paid.status_code == 200, paid.text
    assert paid.json()["completed"] is True


def test_payment_completes_registration(client, category_id, plan_ids, sent_emails):
    start = _start(client, category_id)
    headers = _auth(start)
    email = start.json()["state"]["account"]["email"]
    _choose(client, headers, plan_ids["Monthly"])

    state = _pay(client, headers).json()

    assert state["step"] == 4 and state["completed"] is True
    # The provider profile: a listing, pending review, owned by the account.
    assert state["business"]["name"] == "Registration Plumbing"
    assert state["business"]["status"] == "pending"
    # Linked to an active subscription on the chosen plan.
    assert state["subscription"]["status"] == "active"
    assert state["subscription"]["business_id"] == state["business"]["id"]
    assert state["subscription"]["plan"]["name"] == "Monthly"
    assert state["subscription"]["current_period_end"] is not None
    # And a receipt with the tax broken out.
    receipt = state["receipt"]
    assert receipt["receipt_number"].startswith("JFY-")
    assert receipt["total"] == "32.77"
    assert receipt["tax_lines"] == [{"name": "HST", "rate": "13", "amount": "3.77"}]
    assert receipt["card_last4"] == "4242"
    # The account is active: the dashboard opens.
    assert client.get("/api/v1/me", headers=headers).json()["is_active"] is True
    assert client.get("/api/v1/businesses/owner/mine", headers=headers).status_code == 200
    # Welcome, then the receipt.
    assert [m["to"] for m in sent_emails] == [email, email]
    assert sent_emails[0]["subject"].startswith("Welcome")
    assert "Receipt JFY-" in sent_emails[1]["subject"]
    assert "HST (13%)" in sent_emails[1]["body"] and "$32.77 CAD" in sent_emails[1]["body"]
    assert "renews automatically" in sent_emails[1]["body"]


def test_terms_must_be_accepted(client, category_id, plan_ids):
    headers = _auth(_start(client, category_id))
    _choose(client, headers, plan_ids["Monthly"])

    assert _pay(client, headers, accept_terms=False).status_code == 422


def test_a_completed_registration_cannot_be_paid_or_edited_again(client, category_id, plan_ids):
    headers = _auth(_start(client, category_id))
    _choose(client, headers, plan_ids["Monthly"])
    assert _pay(client, headers).status_code == 200

    assert _pay(client, headers).status_code == 409
    assert _choose(client, headers, plan_ids["Basic"]).status_code == 409


def test_free_plan_completes_without_payment(client, category_id, plan_ids, sent_emails):
    headers = _auth(_start(client, category_id))
    state = _choose(client, headers, plan_ids["Basic"]).json()
    assert state["order"]["requires_payment"] is False
    assert state["order"]["total"] == "0.00"
    assert state["order"]["tax_lines"] == []

    assert _pay(client, headers).status_code == 409
    assert client.post("/api/v1/registration/complete", json={"accept_terms": False}, headers=headers).status_code == 422

    done = client.post("/api/v1/registration/complete", json={"accept_terms": True}, headers=headers)

    assert done.status_code == 200, done.text
    state = done.json()
    assert state["completed"] is True
    assert state["subscription"]["plan"]["name"] == "Basic"
    assert state["subscription"]["current_period_end"] is None
    assert state["receipt"] is None
    assert len(sent_emails) == 2 and "Basic plan is active" in sent_emails[1]["subject"]


def test_a_paid_plan_cannot_use_the_free_completion(client, category_id, plan_ids):
    headers = _auth(_start(client, category_id))
    _choose(client, headers, plan_ids["Annual"])

    r = client.post("/api/v1/registration/complete", json={"accept_terms": True}, headers=headers)

    assert r.status_code == 402


# ------------------------------------------------------------------ access


def test_customers_cannot_use_registration(client, unique_email):
    token = client.post(
        "/api/v1/signup",
        json={"name": "C", "email": unique_email, "password": "password123"},
    ).json()["access_token"]

    r = client.get("/api/v1/registration", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 403


def test_owners_from_before_registration_count_as_registered(client, unique_email):
    token = client.post(
        "/api/v1/signup",
        json={"name": "O", "email": unique_email, "password": "password123", "role": "business_owner"},
    ).json()["access_token"]

    state = client.get("/api/v1/registration", headers={"Authorization": f"Bearer {token}"}).json()

    assert state["completed"] is True and state["step"] == 4


# --------------------------------------------------------------- sales tax


@pytest.mark.parametrize(
    ("province", "expected"),
    [
        ("ON", [("HST", "3.77")]),
        ("NS", [("HST", "4.06")]),
        ("NB", [("HST", "4.35")]),
        ("AB", [("GST", "1.45")]),
        ("QC", [("GST", "1.45")]),  # QST listed, not collected
    ],
)
def test_sales_tax_by_province(province, expected):
    taxed = sales_tax.calculate(Decimal("29.00"), province)

    assert [(line.name, str(line.amount)) for line in taxed.lines] == expected
    assert taxed.total == taxed.subtotal + sum(line.amount for line in taxed.lines)


def test_free_plans_carry_no_tax():
    assert sales_tax.calculate(Decimal("0"), "ON").lines == []


def test_unknown_province_raises():
    with pytest.raises(sales_tax.UnknownProvince):
        sales_tax.calculate(Decimal("29.00"), "XX")


# ------------------------------------------------- customers who become owners


def _customer(client, email):
    token = client.post(
        "/api/v1/signup", json={"name": "Cara", "email": email, "password": "password123"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


CONVERT = {
    "name": "Cara Customer",
    "phone": "604 555 0123",
    "business_name": "Cara's Cleaning",
    "city": "Vancouver",
    "province": "BC",
}


def test_a_signed_in_customer_can_register_their_business_on_the_same_account(
    client, unique_email, category_id, plan_ids
):
    headers = _customer(client, unique_email)

    r = client.post("/api/v1/registration/convert", json={**CONVERT, "category_id": category_id}, headers=headers)

    assert r.status_code == 200, r.text
    state = r.json()
    assert state["step"] == 2 and state["completed"] is False
    assert state["account"]["email"] == unique_email
    me = client.get("/api/v1/me", headers=headers).json()
    assert (me["role"], me["is_active"]) == ("business_owner", False)
    # The rest of registration works on the same token.
    _choose(client, headers, plan_ids["Basic"])
    done = client.post("/api/v1/registration/complete", json={"accept_terms": True}, headers=headers)
    assert done.json()["business"]["name"] == "Cara's Cleaning"
    assert client.get("/api/v1/businesses/owner/mine", headers=headers).status_code == 200


def test_convert_is_only_for_customers(client, unique_email, category_id, session_factory):
    body = {**CONVERT, "category_id": category_id}
    owner = _auth(_start(client, category_id))
    admin = _customer(client, f"admin-{unique_email}")
    with session_factory() as db:
        db.query(User).filter(User.email == f"admin-{unique_email}").update({"is_admin": True})
        db.commit()

    assert client.post("/api/v1/registration/convert", json=body, headers=owner).status_code == 409
    assert client.post("/api/v1/registration/convert", json=body, headers=admin).status_code == 403
    assert client.post("/api/v1/registration/convert", json=body).status_code == 401
