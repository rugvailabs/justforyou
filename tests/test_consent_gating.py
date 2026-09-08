"""The consent gate on POST /submissions/upload.

Phase 2.5 hardening: each bypass route gets its own test, so a regression names
the specific hole it opened rather than failing one long happy-path scenario.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token

PASSWORD = "consentgate123"
UPLOAD = "/api/v1/submissions/upload"
GATE_DETAIL = "Missing required consent: record_audio"

# Smallest thing the upload endpoint will accept: the EBML magic number that
# marks a WebM/Matroska file, plus filler. The endpoint sniffs the container
# from these bytes; it does not decode the stream.
WEBM_MAGIC = bytes([0x1A, 0x45, 0xDF, 0xA3])
TINY_WEBM = WEBM_MAGIC + bytes(2048)


def _video_file() -> dict:
    return {"audio": ("clip.webm", TINY_WEBM, "audio/webm")}


def _upload(client: TestClient, headers: dict):
    """POST a valid video to the gated upload endpoint."""
    return client.post(UPLOAD, files=_video_file(), headers=headers)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register(client: TestClient, email: str) -> tuple[dict, int]:
    """Sign up, log in, and return (auth headers, user id)."""
    r = client.post(
        "/api/v1/signup",
        json={"name": "Gate Tester", "email": email, "password": PASSWORD},
    )
    assert r.status_code == 201, r.text

    r = client.post("/api/v1/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    headers = _headers(r.json()["access_token"])

    r = client.get("/api/v1/me", headers=headers)
    assert r.status_code == 200, r.text
    return headers, r.json()["id"]


def _grant(client: TestClient, headers: dict, consent_type: str) -> int:
    r = client.post(
        "/api/v1/consents",
        json={
            "consent_type": consent_type,
            "policy_version": "2026-01-v1",
            "method": "video_prompt",
            "language": "en",
        },
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.fixture()
def registered(client: TestClient, unique_email: str) -> tuple[dict, int]:
    return _register(client, unique_email)


# --------------------------------------------------------------------------
# Case 1: no consent at all
# --------------------------------------------------------------------------
def test_upload_blocked_with_no_consent(client: TestClient, registered) -> None:
    headers, _ = registered

    r = _upload(client, headers)

    assert r.status_code == 403, r.text
    assert r.json()["detail"] == GATE_DETAIL


# --------------------------------------------------------------------------
# Case 2: granted, then revoked - consent is not permanent
# --------------------------------------------------------------------------
def test_upload_blocked_after_consent_revoked(client: TestClient, registered) -> None:
    headers, _ = registered
    consent_id = _grant(client, headers, "record_audio")

    # gate open while the consent is active
    assert _upload(client, headers).status_code == 201

    r = client.post(f"/api/v1/consents/{consent_id}/revoke", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["revoked_at"] is not None

    # gate closes again - "granted once" must not mean "allowed forever"
    r = client.post(UPLOAD, headers=headers)
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == GATE_DETAIL


# --------------------------------------------------------------------------
# Case 3: the wrong consent type must not satisfy the gate
# --------------------------------------------------------------------------
@pytest.mark.parametrize("wrong_type", ["send_email", "send_sms"])
def test_wrong_consent_type_does_not_open_gate(
    client: TestClient, registered, wrong_type: str
) -> None:
    headers, _ = registered
    _grant(client, headers, wrong_type)

    r = _upload(client, headers)

    assert r.status_code == 403, r.text
    assert r.json()["detail"] == GATE_DETAIL


def test_only_record_audio_opens_the_gate(client: TestClient, registered) -> None:
    """Holding every other consent is still not enough; the right one is."""
    headers, _ = registered
    _grant(client, headers, "send_email")
    _grant(client, headers, "send_sms")
    assert _upload(client, headers).status_code == 403

    _grant(client, headers, "record_audio")
    assert _upload(client, headers).status_code == 201


# --------------------------------------------------------------------------
# Case 4: auth short-circuits before the consent check
# --------------------------------------------------------------------------
def test_expired_jwt_returns_401_before_consent_check(
    client: TestClient, registered
) -> None:
    """An expired token must fail auth, not fall through to the consent check.

    The user deliberately holds NO consent, so if authentication did not
    short-circuit the request would reach require_consent and return 403.
    A 401 is therefore proof of ordering, not just of rejection.
    """
    _, user_id = registered
    expired = create_access_token(
        {"sub": str(user_id)}, expires_delta=timedelta(seconds=-30)
    )

    r = client.post(UPLOAD, files=_video_file(), headers=_headers(expired))

    assert r.status_code == 401, r.text
    assert r.json()["detail"] == "Could not validate credentials"
    assert r.headers.get("www-authenticate") == "Bearer"


def test_expired_jwt_still_401_for_user_who_has_consent(
    client: TestClient, registered
) -> None:
    """Same check from the other side: a valid consent cannot rescue a dead token."""
    headers, user_id = registered
    _grant(client, headers, "record_audio")
    assert _upload(client, headers).status_code == 201

    expired = create_access_token(
        {"sub": str(user_id)}, expires_delta=timedelta(seconds=-30)
    )
    assert _upload(client, _headers(expired)).status_code == 401


# --------------------------------------------------------------------------
# Other ways in that must stay shut
# --------------------------------------------------------------------------
def test_upload_requires_authentication(client: TestClient) -> None:
    assert client.post(UPLOAD, files=_video_file()).status_code == 401
    assert _upload(client, _headers("not.a.jwt")).status_code == 401


def test_token_signed_with_wrong_secret_is_rejected(client: TestClient, registered) -> None:
    from jose import jwt

    _, user_id = registered
    forged = jwt.encode({"sub": str(user_id)}, "not-the-real-secret", algorithm="HS256")
    assert _upload(client, _headers(forged)).status_code == 401


def test_another_users_consent_does_not_open_your_gate(
    client: TestClient, registered, unique_email: str
) -> None:
    """Consent is per-user; a granted row elsewhere must not leak across accounts."""
    headers_a, _ = registered
    _grant(client, headers_a, "record_audio")
    assert _upload(client, headers_a).status_code == 201

    headers_b, _ = _register(client, f"other-{unique_email}")
    assert _upload(client, headers_b).status_code == 403


def test_full_gate_lifecycle(client: TestClient, registered) -> None:
    """The original end-to-end walk: blocked -> granted -> allowed -> revoked -> blocked."""
    headers, _ = registered

    r = client.patch(
        "/api/v1/profile", json={"preferred_contact_method": "email"}, headers=headers
    )
    assert r.status_code == 200, r.text

    assert _upload(client, headers).status_code == 403
    consent_id = _grant(client, headers, "record_audio")
    assert _upload(client, headers).status_code == 201
    assert (
        client.post(f"/api/v1/consents/{consent_id}/revoke", headers=headers).status_code
        == 200
    )
    assert _upload(client, headers).status_code == 403
