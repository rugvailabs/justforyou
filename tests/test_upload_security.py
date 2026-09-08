"""Malware scanning (3.3) and encryption at rest (3.4) on the upload path."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.models.audit_log import AuditLog
from app.models.submission import Submission
from app.services import scanning, storage

UPLOAD = "/api/v1/submissions/upload"
PASSWORD = "scannertest12"

WEBM_MAGIC = bytes([0x1A, 0x45, 0xDF, 0xA3])
CLEAN_WEBM = WEBM_MAGIC + bytes(8192)

# Matches the custom signature mounted into ClamAV
# (docker/clamav-signatures/justdial-test.ndb). ClamAV's own EICAR signature is
# a whole-file hash, so it cannot fire on a payload embedded in a valid audio
# container - which is exactly what is needed to prove the scanner runs inside
# the upload path rather than the magic-byte check catching it first.
MARKER = b"JUSTDIAL-SCANNER-PIPELINE-TEST-MARKER"
INFECTED_WEBM = WEBM_MAGIC + bytes(512) + MARKER + bytes(4096)

EICAR = (
    "X5O!P%@AP[4\\PZX54(P^)7CC)7}" + "$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!" + "$H+H*"
).encode()


@pytest.fixture(scope="module", autouse=True)
def require_scanner():
    if not scanning.ping():
        pytest.skip("clamd is not reachable; start the clamav service")


@pytest.fixture()
def consented(client: TestClient, unique_email: str) -> dict:
    r = client.post(
        "/api/v1/signup",
        json={"name": "Scan Tester", "email": unique_email, "password": PASSWORD},
    )
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r = client.post(
        "/api/v1/consents",
        json={
            "consent_type": "record_audio",
            "policy_version": "v1.0",
            "method": "checkbox",
            "language": "en",
        },
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return headers


def _post(client: TestClient, headers: dict, data: bytes, name: str = "clip.webm"):
    return client.post(
        UPLOAD, files={"audio": (name, data, "audio/webm")}, headers=headers
    )


# --------------------------------------------------------------------------
# 3.3 - scanning
# --------------------------------------------------------------------------
def test_scanner_detects_eicar() -> None:
    """The standard test string is detected by the scanner service itself."""
    result = scanning.scan_file(EICAR)

    assert result.infected
    assert result.clean is False
    assert result.threat_name and "Eicar" in result.threat_name


def test_scanner_passes_clean_content() -> None:
    result = scanning.scan_file(CLEAN_WEBM)

    assert result.clean
    assert result.threat_name is None


def test_eicar_is_rejected_before_it_reaches_the_scanner(
    client: TestClient, consented: dict
) -> None:
    """Bare EICAR is not audio, so the container check stops it first.

    Defence in depth: it never gets far enough to be scanned.
    """
    r = _post(client, consented, EICAR, name="eicar.webm")

    assert r.status_code == 415, r.text
    assert "not a supported audio recording" in r.json()["detail"]


def test_infected_video_is_rejected(client: TestClient, consented: dict) -> None:
    r = _post(client, consented, INFECTED_WEBM, name="infected.webm")

    assert r.status_code == 400, r.text
    detail = r.json()["detail"]
    assert detail == "This file was rejected by a security check."
    # The scanner's verdict must not leak to the client.
    assert "Justdial" not in detail
    assert "Test" not in detail


def test_infected_upload_creates_no_submission_and_no_object(
    client: TestClient, consented: dict, test_engine
) -> None:
    before = _stored_keys()

    r = _post(client, consented, INFECTED_WEBM, name="infected.webm")
    assert r.status_code == 400

    assert _stored_keys() == before, "an infected file reached object storage"

    Session = sessionmaker(bind=test_engine, future=True)
    with Session() as db:
        me = client.get("/api/v1/me", headers=consented).json()
        rows = db.scalars(
            select(Submission).where(Submission.user_id == me["id"])
        ).all()
        assert rows == [], "a Submission row was created for an infected upload"


def test_infected_upload_is_audited(
    client: TestClient, consented: dict, test_engine
) -> None:
    me = client.get("/api/v1/me", headers=consented).json()

    r = _post(client, consented, INFECTED_WEBM, name="infected.webm")
    assert r.status_code == 400

    Session = sessionmaker(bind=test_engine, future=True)
    with Session() as db:
        row = db.scalar(
            select(AuditLog)
            .where(
                AuditLog.action == "upload.rejected_malware",
                AuditLog.target_id == me["id"],
            )
            .order_by(AuditLog.id.desc())
        )

    assert row is not None, "no audit row for the rejected upload"
    assert row.actor == f"user:{me['id']}"
    assert row.target_table == "users"
    # The threat name is kept here, where only an admin can read it.
    assert row.meta["threat_name"]
    assert row.meta["filename"] == "infected.webm"


def test_clean_video_passes_through(client: TestClient, consented: dict) -> None:
    r = _post(client, consented, CLEAN_WEBM)

    assert r.status_code == 201, r.text
    key = r.json()["video_path"]
    assert storage.download_video(key) == CLEAN_WEBM
    storage.delete_video(key)


# --------------------------------------------------------------------------
# 3.4 - encryption at rest
# --------------------------------------------------------------------------
def test_bucket_has_server_side_encryption() -> None:
    assert storage.bucket_encryption() == "AES256"


def test_uploaded_object_reports_encryption(
    client: TestClient, consented: dict
) -> None:
    r = _post(client, consented, CLEAN_WEBM)
    assert r.status_code == 201, r.text
    key = r.json()["video_path"]

    head = storage.get_client().head_object(Bucket=storage.bucket_name(), Key=key)
    assert head.get("ServerSideEncryption") == "AES256"

    # Encryption is transparent to readers: bytes come back intact.
    assert storage.download_video(key) == CLEAN_WEBM
    storage.delete_video(key)


def _stored_keys() -> set[str]:
    resp = storage.get_client().list_objects_v2(
        Bucket=storage.bucket_name(), Prefix="audio/"
    )
    return {obj["Key"] for obj in resp.get("Contents", [])}
