"""Validation on POST /submissions/upload.

Covers the declared content type, the magic-byte check that catches a spoofed
Content-Type, the size ceiling, and the happy path through to a Submission row
plus a real object in storage.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.uploads import MAX_UPLOAD_BYTES
from app.services import storage

UPLOAD = "/api/v1/submissions/upload"
PASSWORD = "uploadtest1234"

# Container magic numbers. The endpoint sniffs these; it does not decode.
WEBM_MAGIC = bytes([0x1A, 0x45, 0xDF, 0xA3])
WAV_HEADER = b"RIFF" + bytes(4) + b"WAVEfmt "
MP3_HEADER = b"ID3" + bytes(7)

TINY_WEBM = WEBM_MAGIC + bytes(4096)
TINY_WAV = WAV_HEADER + bytes(4096)
TINY_MP3 = MP3_HEADER + bytes(4096)
NOT_AUDIO = b"plain text pretending to be a recording" * 32


@pytest.fixture()
def consented(client: TestClient, unique_email: str) -> dict:
    """A signed-in user holding record_audio consent."""
    r = client.post(
        "/api/v1/signup",
        json={"name": "Upload Tester", "email": unique_email, "password": PASSWORD},
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


def _post(client: TestClient, headers: dict, name: str, data: bytes, ctype: str):
    return client.post(UPLOAD, files={"audio": (name, data, ctype)}, headers=headers)


# --------------------------------------------------------------------------
# accepted formats
# --------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("name", "data", "ctype", "suffix"),
    ids=["webm", "wav", "mp3"],
    argvalues=[
        ("clip.webm", TINY_WEBM, "audio/webm", ".webm"),
        ("clip.wav", TINY_WAV, "audio/wav", ".wav"),
        ("clip.mp3", TINY_MP3, "audio/mpeg", ".mp3"),
    ],
)
def test_accepts_supported_containers(
    client: TestClient, consented: dict, name: str, data: bytes, ctype: str, suffix: str
) -> None:
    r = _post(client, consented, name, data, ctype)

    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "UPLOADED"
    assert body["video_path"].startswith(f"audio/{body['user_id']}/")
    assert body["video_path"].endswith(suffix)

    # The bytes really are in object storage, unchanged.
    assert storage.download_video(body["video_path"]) == data
    storage.delete_video(body["video_path"])


def test_upload_creates_row_and_object(client: TestClient, consented: dict) -> None:
    r = _post(client, consented, "clip.webm", TINY_WEBM, "audio/webm")
    assert r.status_code == 201, r.text
    key = r.json()["video_path"]

    # Readable back through the API, still UPLOADED (the pipeline is separate).
    detail = client.get(f"/api/v1/submissions/{r.json()['id']}", headers=consented)
    assert detail.status_code == 200
    assert detail.json()["status"] == "UPLOADED"
    assert detail.json()["video_path"] == key

    assert storage.video_exists(key)
    storage.delete_video(key)


# --------------------------------------------------------------------------
# pipeline hand-off
# --------------------------------------------------------------------------
def test_successful_upload_starts_the_pipeline(
    client: TestClient, consented: dict, stub_pipeline: list[int]
) -> None:
    """A stored submission is handed to the Celery chain."""
    r = _post(client, consented, "clip.webm", TINY_WEBM, "audio/webm")
    assert r.status_code == 201, r.text

    assert stub_pipeline == [r.json()["id"]]
    storage.delete_video(r.json()["video_path"])


def test_rejected_upload_does_not_start_the_pipeline(
    client: TestClient, consented: dict, stub_pipeline: list[int]
) -> None:
    r = _post(client, consented, "fake.mp4", NOT_AUDIO, "audio/mpeg")
    assert r.status_code == 415

    assert stub_pipeline == []


# --------------------------------------------------------------------------
# rejected
# --------------------------------------------------------------------------
def test_rejects_disallowed_content_type(client: TestClient, consented: dict) -> None:
    r = _post(client, consented, "note.txt", b"hello", "text/plain")

    assert r.status_code == 415, r.text
    assert "Unsupported content type" in r.json()["detail"]


def test_rejects_spoofed_content_type(client: TestClient, consented: dict) -> None:
    """A text file claiming to be video/mp4 must not get through."""
    r = _post(client, consented, "fake.mp4", NOT_AUDIO, "audio/mpeg")

    assert r.status_code == 415, r.text
    assert "not a supported audio recording" in r.json()["detail"]


def test_rejects_container_mismatching_declared_type(
    client: TestClient, consented: dict
) -> None:
    """Real WebM bytes declared as MP4: both are allowed types, but they disagree."""
    r = _post(client, consented, "wrong.mp4", TINY_WEBM, "audio/mpeg")

    assert r.status_code == 415, r.text
    assert "does not match its declared type" in r.json()["detail"]


def test_rejects_empty_file(client: TestClient, consented: dict) -> None:
    r = _post(client, consented, "empty.webm", b"", "audio/webm")

    assert r.status_code in (400, 415), r.text


def test_rejects_oversized_upload(client: TestClient, consented: dict) -> None:
    """Content-Length over the ceiling is refused before the body is read."""
    r = client.post(
        UPLOAD,
        content=WEBM_MAGIC + bytes(64),
        headers={
            **consented,
            "Content-Type": "multipart/form-data; boundary=x",
            "Content-Length": str(MAX_UPLOAD_BYTES + 1),
        },
    )

    assert r.status_code == 413, r.text
    assert "too large" in r.json()["detail"].lower()


def test_missing_file_is_a_validation_error(client: TestClient, consented: dict) -> None:
    assert client.post(UPLOAD, headers=consented).status_code == 422


def test_upload_leaves_no_orphan_object_when_rejected(
    client: TestClient, consented: dict
) -> None:
    """A rejected upload must not have written anything to storage."""
    before = _list_keys()
    _post(client, consented, "fake.mp4", NOT_AUDIO, "audio/mpeg")
    assert _list_keys() == before


def _list_keys() -> set[str]:
    client = storage.get_client()
    resp = client.list_objects_v2(Bucket=storage.bucket_name(), Prefix="videos/")
    return {obj["Key"] for obj in resp.get("Contents", [])}
