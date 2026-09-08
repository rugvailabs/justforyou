"""Standalone Whisper check - no web server, no Celery, no database.

Proves the model loads and transcribes before any of it is wired into the
pipeline (Phase 4.1 exit criteria).

    python scripts/try_transcribe.py <audio-or-video-file>
    python scripts/try_transcribe.py --self-test

--self-test downloads a small public-domain speech clip with a known
transcript and checks the output against it, so "correctly" means something
more than "produced some text".
"""

from __future__ import annotations

import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings  # noqa: E402
from app.services import transcription  # noqa: E402

# JFK inaugural excerpt shipped as a test fixture by openai/whisper. Public
# domain, ~11 seconds, and its wording is well known, so it makes a usable
# accuracy assertion rather than a smoke test.
SAMPLE_URL = "https://raw.githubusercontent.com/openai/whisper/main/tests/jfk.flac"
SAMPLE_EXPECT = [
    "ask not what your country can do for you",
    "what you can do for your country",
]


def _download_sample(dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  using cached sample: {dest}")
        return dest
    print(f"  downloading sample: {SAMPLE_URL}")
    with urllib.request.urlopen(SAMPLE_URL, timeout=60) as resp:
        dest.write_bytes(resp.read())
    print(f"  saved {dest} ({dest.stat().st_size:,} bytes)")
    return dest


def _transcribe(path: Path) -> tuple[str, str, float | None, float]:
    model = transcription.get_model()
    started = time.perf_counter()
    segments, info = model.transcribe(str(path), beam_size=5)
    text = " ".join(seg.text.strip() for seg in segments).strip()
    elapsed = time.perf_counter() - started
    return text, info.language, getattr(info, "duration", None), elapsed


def main(argv: list[str]) -> int:
    settings = get_settings()
    print("Whisper configuration")
    print(f"  model_size   : {settings.whisper_model_size}")
    print(f"  device       : {settings.whisper_device}")
    print(f"  compute_type : {settings.whisper_compute_type}")
    print()

    self_test = "--self-test" in argv
    args = [a for a in argv[1:] if not a.startswith("--")]

    if self_test:
        target = _download_sample(Path("/tmp/jfk.flac"))
    elif args:
        target = Path(args[0])
        if not target.exists():
            print(f"No such file: {target}", file=sys.stderr)
            return 2
    else:
        print(f"usage: {argv[0]} <audio-or-video-file> | --self-test", file=sys.stderr)
        return 2

    print("Loading model (first run downloads weights)...")
    load_started = time.perf_counter()
    transcription.get_model()
    print(f"  loaded in {time.perf_counter() - load_started:.1f}s")
    print()

    # A video input needs its audio demuxed first; audio files go straight in.
    wav: str | None = None
    try:
        if target.suffix.lower() in {".mp4", ".webm", ".mov", ".mkv", ".avi"}:
            print(f"Extracting audio from {target.name}...")
            wav = transcription.extract_audio(str(target))
            source = Path(wav)
            print(f"  wrote {wav} ({source.stat().st_size:,} bytes)")
        else:
            source = target

        print(f"Transcribing {source.name}...")
        text, language, duration, elapsed = _transcribe(source)
    finally:
        if wav:
            transcription._quiet_unlink(wav)

    print()
    print("Result")
    print(f"  language : {language}")
    print(f"  duration : {duration}")
    print(f"  elapsed  : {elapsed:.1f}s")
    print(f"  text     : {text}")
    print()

    if self_test:
        lowered = text.lower()
        missing = [phrase for phrase in SAMPLE_EXPECT if phrase not in lowered]
        if missing:
            print("SELF-TEST FAILED - expected phrases not found:")
            for phrase in missing:
                print(f"  - {phrase!r}")
            return 1
        print("SELF-TEST PASSED - transcript matches the known wording.")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
