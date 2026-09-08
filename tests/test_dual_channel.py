"""Dual-channel delivery: instant in-app match plus the durable message record.

Covers provider matching, the match data exposed on GET /submissions/{id}, and
the CASL consent gate that decides whether anything is actually sent.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.models.provider import Provider
from app.models.user import User
from app.schemas.service_results import ExtractedProblem
from app.services import extraction, matching, notification

PASSWORD = "dualchannel12"


@pytest.fixture()
def db_session(test_engine):
    Session = sessionmaker(bind=test_engine, autoflush=False, future=True)
    with Session() as db:
        yield db


@pytest.fixture()
def providers(db_session):
    """Two mobile-repair listings in different provinces."""
    rows = [
        Provider(
            name="GTA Mobile Repair Centre",
            category="mobile repair",
            region="Ontario",
            contact_email="service@gta.example.ca",
            contact_phone="+1-416-555-0311",
            verified=True,
        ),
        Provider(
            name="Reparation Mobile Montreal",
            category="mobile repair",
            region="Quebec",
            contact_email="info@rm.example.ca",
            contact_phone="+1-514-555-0244",
            verified=True,
        ),
    ]
    db_session.add_all(rows)
    db_session.commit()
    yield rows
    for row in rows:
        db_session.delete(row)
    db_session.commit()


def _problem(category: str, location: str | None) -> ExtractedProblem:
    return ExtractedProblem(
        category=category,
        problem_summary="Cracked phone screen.",
        urgency="medium",
        location=location,
        raw_json={},
    )


# --------------------------------------------------------------------------
# extraction feeds matching: the category has to come from the text
# --------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("I need a mobile service center near me", "mobile repair"),
        ("my kitchen sink is leaking under the cabinet", "plumbing"),
        ("I need a lawyer to review my lease", "legal"),
        ("the wifi and printer both stopped working", "it support"),
        ("something completely unclassifiable happened", "other"),
    ],
)
def test_category_is_derived_from_the_text(text: str, expected: str) -> None:
    assert extraction.extract_problem(text).category == expected


def test_category_is_always_inside_the_taxonomy() -> None:
    result = extraction.extract_problem("wingardium leviosa")
    assert result.category in extraction.TAXONOMY


def test_location_and_urgency_are_extracted() -> None:
    result = extraction.extract_problem(
        "Emergency! My sink is flooding, I am in Montreal."
    )
    assert result.location == "Montreal, Quebec"
    assert result.urgency == "high"


# --------------------------------------------------------------------------
# matching
# --------------------------------------------------------------------------
def test_exact_category_and_region_match(db_session, providers) -> None:
    result = matching.find_solution(
        db_session, _problem("mobile repair", "Toronto, Ontario")
    )

    assert result.match_type == "provider"
    assert result.provider_id == providers[0].id
    assert result.needs_human_review is False
    assert "GTA Mobile Repair Centre" in result.solution_text


def test_region_selects_between_providers(db_session, providers) -> None:
    result = matching.find_solution(
        db_session, _problem("mobile repair", "Montreal, Quebec")
    )

    assert result.provider_id == providers[1].id


def test_unknown_region_widens_to_the_category(db_session, providers) -> None:
    """A region with no listings is better served by any provider than none."""
    result = matching.find_solution(
        db_session, _problem("mobile repair", "Whitehorse, Yukon")
    )

    assert result.match_type == "provider"
    assert result.provider_id in {p.id for p in providers}


def test_no_provider_falls_back_to_ai_generated(db_session, providers) -> None:
    result = matching.find_solution(
        db_session, _problem("underwater basket weaving", "Toronto, Ontario")
    )

    assert result.match_type == "ai_generated"
    assert result.provider_id is None
    # Nothing vetted means a person should look before this is final.
    assert result.needs_human_review is True


# --------------------------------------------------------------------------
# GET /submissions/{id} exposes the match
# --------------------------------------------------------------------------
def _register(client: TestClient, email: str, consents: list[str]) -> dict:
    r = client.post(
        "/api/v1/signup",
        json={"name": "Dual Channel", "email": email, "password": PASSWORD},
    )
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    for consent_type in consents:
        r = client.post(
            "/api/v1/consents",
            json={
                "consent_type": consent_type,
                "policy_version": "v1.0",
                "method": "checkbox",
                "language": "en",
            },
            headers=headers,
        )
        assert r.status_code == 201, r.text
    return headers


def test_detail_has_no_match_before_the_pipeline_runs(
    client: TestClient, unique_email: str
) -> None:
    headers = _register(client, unique_email, ["record_audio"])
    created = client.post(
        "/api/v1/submissions",
        json={"text": "I need a mobile service center near me in Toronto."},
        headers=headers,
    )
    assert created.status_code == 201, created.text

    # extract_task is stubbed out in tests, so nothing has matched yet.
    detail = client.get(f"/api/v1/submissions/{created.json()['id']}", headers=headers)

    assert detail.status_code == 200
    body = detail.json()
    assert body["status"] == "SUBMITTED"
    assert body["match"] is None
    assert body["category"] is None


def test_detail_returns_provider_once_matched(
    client: TestClient, unique_email: str, db_session, providers
) -> None:
    """The customer sees the provider without waiting for the email."""
    from app.models.extracted_problem import ExtractedProblem as ProblemRow
    from app.models.extracted_problem import Urgency
    from app.models.match import Match, MatchType
    from app.models.submission import Submission, SubmissionStatus

    headers = _register(client, unique_email, ["record_audio"])
    created = client.post(
        "/api/v1/submissions",
        json={"text": "I need a mobile service center near me in Toronto."},
        headers=headers,
    )
    submission_id = created.json()["id"]

    # Stand in for what match_task writes.
    submission = db_session.get(Submission, submission_id)
    submission.status = SubmissionStatus.MATCHED
    db_session.add(
        ProblemRow(
            submission_id=submission_id,
            category="mobile repair",
            problem_summary="Cracked screen.",
            urgency=Urgency.medium,
            location="Toronto, Ontario",
            raw_json={},
        )
    )
    db_session.add(
        Match(
            submission_id=submission_id,
            provider_id=providers[0].id,
            solution_text="We found GTA Mobile Repair Centre.",
            match_type=MatchType.provider,
            needs_human_review=False,
        )
    )
    db_session.commit()

    body = client.get(f"/api/v1/submissions/{submission_id}", headers=headers).json()

    assert body["status"] == "MATCHED"
    assert body["category"] == "mobile repair"
    assert body["match"]["match_type"] == "provider"
    assert body["match"]["provider"]["name"] == "GTA Mobile Repair Centre"
    assert body["match"]["provider"]["contact_phone"] == "+1-416-555-0311"


# --------------------------------------------------------------------------
# the CASL gate on sending
# --------------------------------------------------------------------------
def test_send_is_suppressed_without_consent(
    client: TestClient, unique_email: str, db_session
) -> None:
    headers = _register(client, unique_email, ["record_audio"])  # no send_email
    me = client.get("/api/v1/me", headers=headers).json()
    user = db_session.get(User, me["id"])

    result = notification.send_solution(
        db_session,
        submission_id=1,
        channel="email",
        user=user,
        payload=notification.SolutionPayload(submission_id=1, solution_text="hi"),
    )

    assert result.success is False
    assert "no active email consent" in (result.error or "")


def test_active_consent_is_found_when_granted(
    client: TestClient, unique_email: str, db_session
) -> None:
    headers = _register(client, unique_email, ["record_audio", "send_email"])
    me = client.get("/api/v1/me", headers=headers).json()

    assert notification.active_consent(db_session, me["id"], "email") is not None
    assert notification.active_consent(db_session, me["id"], "sms") is None


def test_channel_follows_the_profile_preference(
    client: TestClient, unique_email: str, db_session
) -> None:
    headers = _register(client, unique_email, ["record_audio"])
    me = client.get("/api/v1/me", headers=headers).json()
    user = db_session.get(User, me["id"])

    assert notification.channel_for(user) == "email"

    client.patch(
        "/api/v1/profile", json={"preferred_contact_method": "sms"}, headers=headers
    )
    db_session.expire(user)
    assert notification.channel_for(user) == "sms"
