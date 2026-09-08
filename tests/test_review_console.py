"""The human review console.

The gate holds tickets; this is what drains the queue. The tests that matter
most are the ones about authority and attribution: only an admin may act, two
reviewers cannot edit the same answer, and an edit never destroys what the AI
originally wrote.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.models.audit_log import AuditLog
from app.models.extracted_problem import ExtractedProblem as ProblemRow
from app.models.extracted_problem import Urgency
from app.models.match import Match, MatchType
from app.models.review_queue import ReviewDecision, ReviewQueue
from app.models.submission import InputType, Submission, SubmissionStatus
from app.models.user import User

PASSWORD = "reviewtest12"
AI_ANSWER = "Call the shop and ask for a screen replacement quote before you go."
EDITED = "Call GTA Mobile Repair on +1-416-555-0311. Back up your photos first."


@pytest.fixture()
def session_factory(test_engine):
    return sessionmaker(bind=test_engine, autoflush=False, future=True)


def _register(client: TestClient, email: str, admin: bool, session_factory) -> dict:
    r = client.post(
        "/api/v1/signup",
        json={"name": "Reviewer", "email": email, "password": PASSWORD},
    )
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    if admin:
        me = client.get("/api/v1/me", headers=headers).json()
        with session_factory() as db:
            db.get(User, me["id"]).is_admin = True
            db.commit()
    return headers


@pytest.fixture()
def held_ticket(client: TestClient, unique_email: str, session_factory):
    """A submission the gate held, with an answer waiting on a reviewer."""
    headers = _register(client, unique_email, admin=True, session_factory=session_factory)
    me = client.get("/api/v1/me", headers=headers).json()

    with session_factory() as db:
        submission = Submission(
            user_id=me["id"],
            input_type=InputType.text,
            transcript="My phone screen is cracked and I'm in Toronto.",
            status=SubmissionStatus.NEEDS_REVIEW,
        )
        db.add(submission)
        db.flush()
        db.add(
            ProblemRow(
                submission_id=submission.id,
                category="mobile repair",
                problem_summary="Cracked screen.",
                urgency=Urgency.medium,
                location="Toronto, Ontario",
                raw_json={"trusted": False, "extractor": "keyword-fallback"},
            )
        )
        db.add(
            Match(
                submission_id=submission.id,
                provider_id=None,
                solution_text=AI_ANSWER,
                match_type=MatchType.ai_generated,
                confidence=0.0,
                gate_json={"passed": False, "reasons": ["untrusted path"]},
                needs_human_review=True,
            )
        )
        review = ReviewQueue(
            submission_id=submission.id,
            reason="gate_failed_checks: answer came from an untrusted path",
        )
        db.add(review)
        db.commit()
        ids = {"review_id": review.id, "submission_id": submission.id}

    return {"headers": headers, **ids}


def _detail(client, t):
    r = client.get(f"/api/v1/review/{t['review_id']}", headers=t["headers"])
    assert r.status_code == 200, r.text
    return r.json()


# --------------------------------------------------------------------------
# authority
# --------------------------------------------------------------------------
def test_non_admin_cannot_see_the_queue(
    client: TestClient, unique_email: str, session_factory
) -> None:
    headers = _register(client, unique_email, admin=False, session_factory=session_factory)

    assert client.get("/api/v1/review", headers=headers).status_code == 403
    assert client.get("/api/v1/review/stats", headers=headers).status_code == 403


def test_unauthenticated_is_rejected(client: TestClient) -> None:
    assert client.get("/api/v1/review").status_code == 401


# --------------------------------------------------------------------------
# the queue
# --------------------------------------------------------------------------
def test_held_ticket_appears_in_the_queue(client: TestClient, held_ticket) -> None:
    rows = client.get("/api/v1/review", headers=held_ticket["headers"]).json()

    mine = [r for r in rows if r["submission_id"] == held_ticket["submission_id"]]
    assert len(mine) == 1
    assert mine[0]["reason_code"] == "gate_failed_checks"
    assert mine[0]["decision"] is None
    assert "cracked" in mine[0]["preview"]


def test_detail_shows_what_the_reviewer_needs(client: TestClient, held_ticket) -> None:
    d = _detail(client, held_ticket)

    assert d["transcript"].startswith("My phone screen")
    assert d["category"] == "mobile repair"
    assert d["solution_text"] == AI_ANSWER
    assert d["gate_json"]["reasons"] == ["untrusted path"]
    assert d["confidence"] == 0.0
    assert d["customer_email"]


def test_stats_count_the_queue(client: TestClient, held_ticket) -> None:
    stats = client.get("/api/v1/review/stats", headers=held_ticket["headers"]).json()

    assert stats["open_count"] >= 1
    assert "gate_failed_checks" in stats["by_reason"]


# --------------------------------------------------------------------------
# claiming
# --------------------------------------------------------------------------
def test_claim_and_release(client: TestClient, held_ticket) -> None:
    rid, headers = held_ticket["review_id"], held_ticket["headers"]

    claimed = client.post(f"/api/v1/review/{rid}/claim", headers=headers).json()
    assert claimed["claimed_by"].startswith("user:")
    assert claimed["claimed_at"] is not None

    released = client.post(f"/api/v1/review/{rid}/release", headers=headers).json()
    assert released["claimed_by"] is None


def test_a_second_reviewer_cannot_act_on_a_claimed_ticket(
    client: TestClient, held_ticket, unique_email: str, session_factory
) -> None:
    """Two people editing the same answer is how contradictory advice ships."""
    rid = held_ticket["review_id"]
    client.post(f"/api/v1/review/{rid}/claim", headers=held_ticket["headers"])

    other = _register(
        client, f"other-{unique_email}", admin=True, session_factory=session_factory
    )

    r = client.post(f"/api/v1/review/{rid}/approve", json={}, headers=other)

    assert r.status_code == 409
    assert "claimed by" in r.json()["detail"]


# --------------------------------------------------------------------------
# approving - the only path to delivery
# --------------------------------------------------------------------------
def test_approve_unchanged_sends_the_ai_answer(
    client: TestClient, held_ticket, session_factory, stub_pipeline
) -> None:
    rid = held_ticket["review_id"]
    client.post(f"/api/v1/review/{rid}/claim", headers=held_ticket["headers"])

    d = client.post(
        f"/api/v1/review/{rid}/approve", json={}, headers=held_ticket["headers"]
    ).json()

    assert d["decision"] == "approved"
    assert d["resolved_at"] is not None
    assert d["solution_text"] == AI_ANSWER
    # Nothing was edited, so there is no earlier version to keep.
    assert d["original_solution_text"] is None

    with session_factory() as db:
        assert (
            db.get(Submission, held_ticket["submission_id"]).status
            is SubmissionStatus.APPROVED
        )


def test_approve_with_an_edit_keeps_both_versions(
    client: TestClient, held_ticket, session_factory
) -> None:
    """The pair is the accountability record and the training signal."""
    rid = held_ticket["review_id"]
    client.post(f"/api/v1/review/{rid}/claim", headers=held_ticket["headers"])

    d = client.post(
        f"/api/v1/review/{rid}/approve",
        json={"solution_text": EDITED, "note": "too generic"},
        headers=held_ticket["headers"],
    ).json()

    assert d["solution_text"] == EDITED
    assert d["original_solution_text"] == AI_ANSWER
    assert d["reviewer_note"] == "too generic"

    with session_factory() as db:
        match = db.scalar(
            select(Match).where(Match.submission_id == held_ticket["submission_id"])
        )
        assert match.solution_text == EDITED
        assert match.needs_human_review is False


def test_approval_is_audited_with_both_versions(
    client: TestClient, held_ticket, session_factory
) -> None:
    rid = held_ticket["review_id"]
    client.post(f"/api/v1/review/{rid}/claim", headers=held_ticket["headers"])
    client.post(
        f"/api/v1/review/{rid}/approve",
        json={"solution_text": EDITED},
        headers=held_ticket["headers"],
    )

    with session_factory() as db:
        row = db.scalar(
            select(AuditLog)
            .where(
                AuditLog.action == "review.approved",
                AuditLog.target_id == held_ticket["submission_id"],
            )
            .order_by(AuditLog.id.desc())
        )

    assert row is not None
    assert row.actor.startswith("user:")
    assert row.meta["edited"] is True
    assert row.meta["original_solution_text"] == AI_ANSWER
    assert row.meta["final_solution_text"] == EDITED


# --------------------------------------------------------------------------
# rejecting and asking for more
# --------------------------------------------------------------------------
def test_reject_closes_without_sending(
    client: TestClient, held_ticket, session_factory
) -> None:
    rid = held_ticket["review_id"]

    d = client.post(
        f"/api/v1/review/{rid}/reject",
        json={"reason": "We have no provider for this and cannot advise."},
        headers=held_ticket["headers"],
    ).json()

    assert d["decision"] == "rejected"
    with session_factory() as db:
        # Never promoted to APPROVED, so notify_task can never deliver it.
        assert (
            db.get(Submission, held_ticket["submission_id"]).status
            is SubmissionStatus.NEEDS_REVIEW
        )


def test_request_info_records_the_question(client: TestClient, held_ticket) -> None:
    rid = held_ticket["review_id"]

    d = client.post(
        f"/api/v1/review/{rid}/request-info",
        json={"question": "Which model of phone is it?"},
        headers=held_ticket["headers"],
    ).json()

    assert d["decision"] == "info_requested"
    assert d["reviewer_note"] == "Which model of phone is it?"


def test_a_resolved_ticket_cannot_be_decided_twice(
    client: TestClient, held_ticket
) -> None:
    rid = held_ticket["review_id"]
    client.post(
        f"/api/v1/review/{rid}/reject",
        json={"reason": "no provider"},
        headers=held_ticket["headers"],
    )

    r = client.post(f"/api/v1/review/{rid}/approve", json={}, headers=held_ticket["headers"])

    assert r.status_code == 409
    assert "already" in r.json()["detail"]


def test_resolved_tickets_leave_the_open_queue(client: TestClient, held_ticket) -> None:
    rid = held_ticket["review_id"]
    client.post(
        f"/api/v1/review/{rid}/reject",
        json={"reason": "no provider"},
        headers=held_ticket["headers"],
    )

    open_ids = {r["id"] for r in client.get("/api/v1/review", headers=held_ticket["headers"]).json()}
    done_ids = {
        r["id"]
        for r in client.get(
            "/api/v1/review?resolved=true", headers=held_ticket["headers"]
        ).json()
    }

    assert rid not in open_ids
    assert rid in done_ids


def test_missing_ticket_is_404(client: TestClient, held_ticket) -> None:
    assert (
        client.get("/api/v1/review/999999", headers=held_ticket["headers"]).status_code
        == 404
    )
