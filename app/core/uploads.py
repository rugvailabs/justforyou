"""Limits and content sniffing for uploaded audio files.

Shared by the upload route and by the size-limit middleware in app.main, which
is why these constants do not live in the route module.
"""

from __future__ import annotations

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB - audio, not video
CHUNK_SIZE = 1024 * 1024  # 1 MB reads while streaming to disk

# Declared content types we accept. This is the first gate only - the bytes are
# checked separately, because a Content-Type header is client-supplied and
# trivially spoofed.
ALLOWED_CONTENT_TYPES: frozenset[str] = frozenset(
    {"audio/mpeg", "audio/wav", "audio/webm"}
)

# Some browsers label WAV and MP3 with older or vendor-prefixed types; treat
# them as their canonical equivalents rather than rejecting a valid recording.
CONTENT_TYPE_ALIASES: dict[str, str] = {
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/vnd.wave": "audio/wav",
    "audio/mp3": "audio/mpeg",
    "audio/x-mpeg": "audio/mpeg",
    "audio/ogg": "audio/webm",  # both are Ogg/Matroska-family containers
}

# Container -> file extension used when building the storage key.
EXTENSION_BY_CONTAINER: dict[str, str] = {
    "mp3": ".mp3",
    "wav": ".wav",
    "webm": ".webm",
}

# Container -> the declared types whose bytes may legitimately look like it.
COMPATIBLE_CONTAINERS: dict[str, frozenset[str]] = {
    "audio/mpeg": frozenset({"mp3"}),
    "audio/wav": frozenset({"wav"}),
    # MediaRecorder emits Matroska-in-WebM; some builds emit Ogg. Both are
    # sniffed as "webm" below.
    "audio/webm": frozenset({"webm"}),
}

# Enough bytes to cover a RIFF header (12) plus an ID3 tag header.
MAGIC_PREFIX_BYTES = 16

_EBML_MAGIC = b"\x1a\x45\xdf\xa3"  # Matroska / WebM
_OGG_MAGIC = b"OggS"
_RIFF = b"RIFF"
_WAVE = b"WAVE"
_ID3 = b"ID3"


def _is_mpeg_frame(head: bytes) -> bool:
    """True for a raw MPEG audio frame sync word (an MP3 with no ID3 tag)."""
    if len(head) < 2 or head[0] != 0xFF:
        return False
    # 11 sync bits set, and a version/layer field that is not 'reserved'.
    return (head[1] & 0xE0) == 0xE0


def sniff_container(head: bytes) -> str | None:
    """Identify the container from the file's leading bytes.

    Returns "mp3", "wav", "webm", or None when the bytes match nothing we
    accept.
    """
    if head.startswith(_RIFF) and len(head) >= 12 and head[8:12] == _WAVE:
        return "wav"
    if head.startswith(_EBML_MAGIC) or head.startswith(_OGG_MAGIC):
        return "webm"
    if head.startswith(_ID3) or _is_mpeg_frame(head):
        return "mp3"
    return None


def normalise_content_type(raw: str | None) -> str:
    """Strip parameters and fold known aliases to a canonical type."""
    base = (raw or "").split(";")[0].strip().lower()
    return CONTENT_TYPE_ALIASES.get(base, base)


def human_size(num_bytes: int) -> str:
    """Format a byte count for an error message a user can act on."""
    mb = num_bytes / (1024 * 1024)
    if mb >= 1:
        return f"{mb:.1f} MB"
    return f"{num_bytes / 1024:.1f} KB"


__all__ = [
    "MAX_UPLOAD_BYTES",
    "CHUNK_SIZE",
    "ALLOWED_CONTENT_TYPES",
    "CONTENT_TYPE_ALIASES",
    "EXTENSION_BY_CONTAINER",
    "COMPATIBLE_CONTAINERS",
    "MAGIC_PREFIX_BYTES",
    "sniff_container",
    "normalise_content_type",
    "human_size",
]
