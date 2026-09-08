"""Malware scanning for uploaded files, backed by ClamAV.

Security posture: this scanner FAILS CLOSED. If clamd is unreachable, times
out, or answers with anything we do not understand, the file is treated as
un-scannable and the upload is refused. An unscanned file reaching storage is
worse than an upload outage, so availability is deliberately traded for safety.

Threat names are for the audit log and server logs only - never put them in a
response body. Telling a client which signature matched hands an attacker a
free oracle for tuning their payload.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import BinaryIO

import clamd

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# clamd answers INSTREAM with (status, signature); status is one of these.
_STATUS_OK = "OK"
_STATUS_FOUND = "FOUND"
_STATUS_ERROR = "ERROR"

SCAN_TIMEOUT_SECONDS = 120.0


@dataclass(frozen=True)
class ScanResult:
    """Outcome of scanning one file.

    `clean` is True only on an explicit all-clear from the scanner. Anything
    else - a detection, a scanner error, an unreachable daemon - is False, so
    callers cannot accidentally treat "unknown" as "safe".
    """

    clean: bool
    threat_name: str | None = None
    #: True when the verdict is "we could not scan this", not "this is a virus".
    scanner_unavailable: bool = False

    @property
    def infected(self) -> bool:
        return not self.clean and not self.scanner_unavailable


class ScannerUnavailable(RuntimeError):
    """Raised when the scanner could not produce a verdict."""


def _client() -> clamd.ClamdNetworkSocket:
    settings = get_settings()
    return clamd.ClamdNetworkSocket(
        host=settings.clamav_host,
        port=settings.clamav_port,
        timeout=SCAN_TIMEOUT_SECONDS,
    )


def ping() -> bool:
    """True if clamd answers. Used by health checks, not by the upload path."""
    try:
        return _client().ping() == "PONG"
    except Exception as exc:  # noqa: BLE001 - any failure means "not reachable"
        logger.warning("scanning: clamd ping failed: %s", exc)
        return False


def _interpret(raw: dict) -> ScanResult:
    """Turn clamd's INSTREAM reply into a ScanResult.

    A clean file answers {'stream': ('OK', None)}; a detection answers
    {'stream': ('FOUND', 'Eicar-Signature')}.
    """
    entry = raw.get("stream") if raw else None
    if not entry:
        logger.error("scanning: unrecognised clamd reply %r", raw)
        return ScanResult(clean=False, scanner_unavailable=True)

    status, signature = entry[0], entry[1] if len(entry) > 1 else None

    if status == _STATUS_OK:
        return ScanResult(clean=True)
    if status == _STATUS_FOUND:
        return ScanResult(clean=False, threat_name=signature or "unknown")

    # ERROR, or anything else: no verdict, so treat as un-scannable.
    logger.error("scanning: clamd returned %s (%s)", status, signature)
    return ScanResult(clean=False, scanner_unavailable=True)


def scan_stream(fileobj: BinaryIO) -> ScanResult:
    """Scan an open binary file object without reading it all into memory.

    clamd's INSTREAM protocol takes the file in chunks, so a 100 MB video is
    never held in RAM. The caller keeps ownership of `fileobj` and is
    responsible for its position - this rewinds to the start first.
    """
    try:
        fileobj.seek(0)
    except (OSError, AttributeError):
        pass  # non-seekable stream: scan from wherever it is

    try:
        return _interpret(_client().instream(fileobj))
    except clamd.BufferTooLongError as exc:
        # StreamMaxLength in clamd.conf is below our upload ceiling.
        logger.error("scanning: file exceeds clamd StreamMaxLength: %s", exc)
        return ScanResult(clean=False, scanner_unavailable=True)
    except (clamd.ConnectionError, OSError) as exc:
        logger.error("scanning: cannot reach clamd: %s", exc)
        return ScanResult(clean=False, scanner_unavailable=True)
    except Exception as exc:  # noqa: BLE001 - never let a scanner bug mean "clean"
        logger.exception("scanning: unexpected scanner failure: %s", exc)
        return ScanResult(clean=False, scanner_unavailable=True)


def scan_file(file_bytes: bytes) -> ScanResult:
    """Scan an in-memory payload.

    Prefer scan_stream() for anything user-sized; this exists for small
    payloads and for callers that already hold the bytes.
    """
    return scan_stream(io.BytesIO(file_bytes))


__all__ = [
    "ScanResult",
    "ScannerUnavailable",
    "ping",
    "scan_file",
    "scan_stream",
]
