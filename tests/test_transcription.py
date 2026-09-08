"""transcribe()'s error contract.

The model is faked here. Real accuracy is covered by
scripts/try_transcribe.py --self-test; what
matters in this file is which failures raise which type, because the Celery
task uses exactly that to choose between retrying and escalating to a human.

    permanent -> AudioDecodeError / NeedsReviewError
    transient -> StorageError / TranscriptionTimeout / anything else
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.services import storage, transcription
from app.services.storage import StorageError
from app.services.transcription import (
    AudioDecodeError,
    NeedsReviewError,
    TranscriptionTimeout,
)

LONG_ENOUGH = "My kitchen sink has been leaking for two days now."


@dataclass
class _Segment:
    text: str


@dataclass
class _Info:
    language: str
    language_probability: float
    duration: float


class _FakeModel:
    """Stands in for WhisperModel with a scripted answer."""

    def __init__(self, text: str, language: str = "en", confidence: float = 0.95):
        self._text = text
        self._language = language
        self._confidence = confidence

    def transcribe(self, _path, **_kwargs):
        segments = [_Segment(p) for p in self._text.split("|")] if self._text else []
        return iter(segments), _Info(self._language, self._confidence, 12.0)


@pytest.fixture()
def fake_pipeline(monkeypatch, tmp_path):
    """Bypass storage so tests exercise transcribe()'s own logic."""
    wav = tmp_path / "audio.wav"
    wav.write_bytes(b"RIFF")

    def _download(_key: str, dest: str) -> int:
        with open(dest, "wb") as fh:
            fh.write(b"fake audio bytes")
        return 16

    monkeypatch.setattr(transcription.storage, "download_video_to_file", _download)
    return wav


def _use_model(monkeypatch, model) -> None:
    monkeypatch.setattr(transcription, "get_model", lambda: model)


# --------------------------------------------------------------------------
# success - a returned result always means "trustworthy"
# --------------------------------------------------------------------------
def test_good_transcript_is_returned(monkeypatch, fake_pipeline) -> None:
    _use_model(monkeypatch, _FakeModel(LONG_ENOUGH, "en", 0.94))

    result = transcription.transcribe("audio/1/x.mp3")

    assert result.transcript == LONG_ENOUGH
    assert result.language_detected == "en"
    assert result.language_confidence == pytest.approx(0.94)
    assert result.duration_seconds == pytest.approx(12.0)


def test_segments_are_joined(monkeypatch, fake_pipeline) -> None:
    _use_model(monkeypatch, _FakeModel(f"{LONG_ENOUGH}|And the floor is wet.", "fr", 0.9))

    result = transcription.transcribe("audio/1/x.mp3")

    assert result.transcript == f"{LONG_ENOUGH} And the floor is wet."
    assert result.language_detected == "fr"


# --------------------------------------------------------------------------
# permanent failures - NeedsReviewError, never retried
# --------------------------------------------------------------------------
def test_low_language_confidence_raises_needs_review(monkeypatch, fake_pipeline) -> None:
    _use_model(monkeypatch, _FakeModel(LONG_ENOUGH, "fr", 0.21))

    with pytest.raises(NeedsReviewError) as exc:
        transcription.transcribe("audio/1/x.mp3")

    assert exc.value.reason_code == "transcription_low_confidence"
    assert "Low language-detection confidence" in str(exc.value)
    # The decoded text travels with the error so a reviewer can see it.
    assert exc.value.transcript == LONG_ENOUGH


def test_short_transcript_raises_needs_review(monkeypatch, fake_pipeline) -> None:
    _use_model(monkeypatch, _FakeModel("Uh.", "en", 0.99))

    with pytest.raises(NeedsReviewError) as exc:
        transcription.transcribe("audio/1/x.mp3")

    assert exc.value.reason_code == "transcription_low_confidence"
    assert "suspiciously short" in str(exc.value)


def test_empty_transcript_raises_needs_review(monkeypatch, fake_pipeline) -> None:
    _use_model(monkeypatch, _FakeModel("", "en", 0.99))

    with pytest.raises(NeedsReviewError):
        transcription.transcribe("audio/1/x.mp3")


# --------------------------------------------------------------------------
# permanent failures - bad input, propagated unchanged
# --------------------------------------------------------------------------
def test_undecodable_audio_raises_decode_error(monkeypatch, fake_pipeline) -> None:
    """A truncated upload is a bad file, not a bad host - never retried."""

    class _Undecodable:
        def transcribe(self, *_a, **_k):
            raise ValueError("Invalid data found when processing input")

    _use_model(monkeypatch, _Undecodable())

    with pytest.raises(AudioDecodeError):
        transcription.transcribe("audio/1/x.mp3")


def test_empty_object_raises_decode_error(monkeypatch, tmp_path) -> None:
    def _download(_key: str, dest: str) -> int:
        open(dest, "wb").close()
        return 0

    monkeypatch.setattr(transcription.storage, "download_video_to_file", _download)

    with pytest.raises(AudioDecodeError, match="empty"):
        transcription.transcribe("audio/1/x.mp3")


# --------------------------------------------------------------------------
# transient failures - must raise so the task retries
# --------------------------------------------------------------------------
def test_storage_failure_propagates(monkeypatch) -> None:
    def _boom(*_a, **_k):
        raise StorageError("connection reset")

    monkeypatch.setattr(transcription.storage, "download_video_to_file", _boom)

    with pytest.raises(StorageError):
        transcription.transcribe("audio/1/x.mp3")


def test_model_crash_propagates_as_transient(monkeypatch, fake_pipeline) -> None:
    """A CTranslate2 crash is infrastructure, not a bad file - it must retry."""

    class _Broken:
        def transcribe(self, *_a, **_k):
            raise RuntimeError("CTranslate2 exploded")

    _use_model(monkeypatch, _Broken())

    with pytest.raises(RuntimeError) as exc:
        transcription.transcribe("audio/1/x.mp3")

    # Not a review-worthy type: the task will retry this.
    assert not isinstance(exc.value, (NeedsReviewError, AudioDecodeError))


def test_deadline_raises_transcription_timeout(monkeypatch, fake_pipeline) -> None:
    """A pathological file must not occupy a worker indefinitely."""

    class _SlowModel:
        def transcribe(self, *_a, **_k):
            def gen():
                for i in range(10_000):
                    yield _Segment(f"segment {i}")

            return gen(), _Info("en", 0.95, 9999.0)

    _use_model(monkeypatch, _SlowModel())
    monkeypatch.setattr(
        transcription.get_settings(), "whisper_timeout_seconds", 0, raising=False
    )

    with pytest.raises(TranscriptionTimeout):
        transcription.transcribe("audio/1/x.mp3")


# --------------------------------------------------------------------------
# temp files
# --------------------------------------------------------------------------
def test_temp_files_are_removed_on_the_error_path(monkeypatch, tmp_path) -> None:
    created: list[str] = []

    def _download(_key: str, dest: str) -> int:
        created.append(dest)
        with open(dest, "wb") as fh:
            fh.write(b"x")
        return 1

    monkeypatch.setattr(transcription.storage, "download_video_to_file", _download)

    class _Undecodable:
        def transcribe(self, *_a, **_k):
            raise ValueError("Invalid data found when processing input")

    monkeypatch.setattr(transcription, "get_model", lambda: _Undecodable())

    with pytest.raises(AudioDecodeError):
        transcription.transcribe("audio/1/x.mp3")

    import os

    assert created, "download was never called"
    assert not any(os.path.exists(p) for p in created)
