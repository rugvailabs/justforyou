"""Speech-to-text service, backed by faster-whisper.

transcribe() is the pipeline entry point for the audio path: it fetches the
uploaded recording from storage and decodes it with a Whisper model held as a
per-process singleton.

There is no audio-extraction step. Submissions are audio files, and
faster-whisper decodes and resamples them itself, so nothing here shells out to
ffmpeg.

Doubtful results degrade rather than fail: an unreadable file, a low-confidence
language guess, or a suspiciously short transcript raises a permanent error the
caller turns into a review task instead of a retry loop.
"""

from __future__ import annotations

import logging
import os
import tempfile
import time
from functools import lru_cache
from typing import TYPE_CHECKING

from app.core.config import get_settings
from app.schemas.service_results import TranscriptResult
from app.services import storage

if TYPE_CHECKING:  # pragma: no cover - typing only
    from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)


class AudioDecodeError(RuntimeError):
    """The uploaded file could not be decoded as audio.

    Covers truncated uploads, corrupt containers and codecs the decoder cannot
    read. Permanent: the same bytes fail the same way every time, so the caller
    routes the submission to a human rather than retrying.
    """


class NeedsReviewError(RuntimeError):
    """The audio decoded, but the result is not trustworthy enough to act on.

    Permanent by nature: the same file produces the same doubtful output every
    time. `reason_code` is the stable machine-readable label stored on the
    ReviewQueue row; the message carries the detail for a person to read.
    """

    def __init__(self, reason_code: str, message: str, *, transcript: str = ""):
        super().__init__(message)
        self.reason_code = reason_code
        #: Whatever text was decoded, so a reviewer can see what was rejected.
        self.transcript = transcript


class TranscriptionTimeout(RuntimeError):
    """Decoding exceeded its wall-clock budget.

    Treated as transient: usually a loaded worker rather than a bad file, so
    the caller retries. Retries are bounded, and exhausting them routes the
    submission to review.
    """


# ---------------------------------------------------------------------------
# model
# ---------------------------------------------------------------------------
@lru_cache(maxsize=1)
def get_model() -> "WhisperModel":
    """Load the Whisper model once per process and reuse it.

    Loading costs seconds and hundreds of MB, so this must never happen per
    request or per Celery task. lru_cache makes it a lazy singleton; call
    warm_up() at startup to pay the cost before the first real job.
    """
    from faster_whisper import WhisperModel

    settings = get_settings()
    logger.info(
        "whisper: loading model=%s device=%s compute_type=%s",
        settings.whisper_model_size,
        settings.whisper_device,
        settings.whisper_compute_type,
    )
    model = WhisperModel(
        settings.whisper_model_size,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type,
        cpu_threads=settings.whisper_cpu_threads,
        download_root=os.environ.get("HF_HOME", "/models"),
    )
    logger.info("whisper: model ready")
    return model


def warm_up() -> bool:
    """Load the model ahead of the first job. Returns False if it could not.

    Never raises: a model that fails to download should not stop the process
    from starting, it should fail loudly on the first transcription instead.
    """
    try:
        get_model()
        return True
    except Exception as exc:  # noqa: BLE001 - startup must not die here
        logger.error("whisper: model failed to load: %s", exc)
        return False


def _quiet_unlink(path: str | None) -> None:
    if path and os.path.exists(path):
        try:
            os.unlink(path)
        except OSError as exc:  # pragma: no cover
            logger.warning("transcription: could not remove %s: %s", path, exc)


def _looks_like_bad_input(exc: Exception) -> bool:
    """Heuristic: does this exception mean 'bad file' rather than 'bad host'?"""
    text = str(exc).lower()
    markers = (
        "invalid data",
        "could not find",
        "does not contain",
        "end of file",
        "invalid argument",
        "unrecognized",
        "no such",
        "failed to open",
        "decod",
        "demux",
        "moov atom",
    )
    return any(m in text for m in markers)


# ---------------------------------------------------------------------------
# pipeline entry point
# ---------------------------------------------------------------------------
def transcribe(audio_key: str) -> TranscriptResult:
    """Transcribe an uploaded audio recording.

    `audio_key` is the object-storage key on the Submission row.

    The error contract is the important part, because the caller uses it to
    decide between retrying and escalating to a human:

    Permanent - retrying cannot help, route to review:
        AudioDecodeError  the file is corrupt or not decodable audio
        NeedsReviewError  decoded, but the language guess is low-confidence
                          or the transcript is suspiciously short

    Transient - worth retrying:
        StorageError         object storage was unreachable
        TranscriptionTimeout decoding blew its wall-clock budget
        anything else        CTranslate2 crashing, disk full, ...

    Returns:
        TranscriptResult, only when the result is trustworthy.
    """
    settings = get_settings()
    tmp_audio: str | None = None

    try:
        # --- fetch (StorageError propagates: transient) ---------------------
        suffix = os.path.splitext(audio_key)[1] or ".bin"
        fd, tmp_audio = tempfile.mkstemp(suffix=suffix)
        os.close(fd)
        size = storage.download_video_to_file(audio_key, tmp_audio)
        logger.info("transcribe: fetched %s (%d bytes)", audio_key, size)

        if size == 0:
            raise AudioDecodeError(f"{audio_key} is empty")

        # --- decode ---------------------------------------------------------
        model = get_model()
        try:
            segments, info = model.transcribe(
                tmp_audio,
                beam_size=settings.whisper_beam_size,
                language=None,  # auto-detect; this is an en/fr market
                vad_filter=True,  # skip silence, which cuts time and hallucinations
            )
        except (ValueError, OSError, RuntimeError) as exc:
            # faster-whisper surfaces undecodable input from its demuxer here.
            # Only decode-shaped failures become permanent; anything else is
            # re-raised so the caller treats it as transient and retries.
            if _looks_like_bad_input(exc):
                raise AudioDecodeError(
                    f"Could not decode {os.path.basename(audio_key)}: {exc}"
                ) from exc
            raise

        language = info.language or "unknown"
        confidence = getattr(info, "language_probability", None)
        duration = getattr(info, "duration", None)

        deadline = time.monotonic() + settings.whisper_timeout_seconds
        parts: list[str] = []
        try:
            for segment in segments:
                parts.append(segment.text)
                if time.monotonic() > deadline:
                    raise TranscriptionTimeout(
                        f"Decoding {audio_key} exceeded "
                        f"{settings.whisper_timeout_seconds}s"
                    )
        except (ValueError, OSError) as exc:
            # Segment generation is lazy, so a truncated file can fail here
            # rather than at the call above.
            if _looks_like_bad_input(exc):
                raise AudioDecodeError(
                    f"Could not decode {os.path.basename(audio_key)}: {exc}"
                ) from exc
            raise

        text = " ".join(p.strip() for p in parts).strip()

        logger.info(
            "transcribe: %s -> lang=%s conf=%s duration=%s chars=%d",
            audio_key,
            language,
            f"{confidence:.2f}" if confidence is not None else "n/a",
            duration,
            len(text),
        )

        # --- quality gates (NeedsReviewError: permanent) --------------------
        if len(text) < settings.whisper_min_transcript_chars:
            raise NeedsReviewError(
                "transcription_low_confidence",
                f"Transcript is suspiciously short ({len(text)} characters); "
                "the recording may be silent or inaudible",
                transcript=text,
            )
        if (
            confidence is not None
            and confidence < settings.whisper_min_language_confidence
        ):
            raise NeedsReviewError(
                "transcription_low_confidence",
                f"Low language-detection confidence ({confidence:.2f} < "
                f"{settings.whisper_min_language_confidence}) for detected "
                f"language {language!r}",
                transcript=text,
            )

        return TranscriptResult(
            transcript=text,
            language_detected=language,
            duration_seconds=round(duration, 2) if duration else None,
            language_confidence=(
                round(confidence, 4) if confidence is not None else None
            ),
        )

    finally:
        _quiet_unlink(tmp_audio)


__all__ = [
    "AudioDecodeError",
    "NeedsReviewError",
    "TranscriptionTimeout",
    "get_model",
    "warm_up",
    "transcribe",
]
