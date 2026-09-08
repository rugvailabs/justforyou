"""Derive recording-condition variants from the clean corpus clips.

Real recordings, degraded three ways to stand in for how people actually
submit video:

    clean  the original studio-ish recording
    phone  band-limited to 300-3400 Hz and requantised - a handset mic
    noisy  mixed with broadband noise at a low SNR - a room with a TV on

Each variant is wrapped in an MP4 container so it matches what the upload
endpoint receives.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

CORPUS = Path("/tmp/corpus")
OUT = Path("/tmp/corpus/variants")

# name -> ffmpeg audio filter chain applied to the source clip
CONDITIONS = {
    "clean": "aresample=16000",
    # Telephone band plus mild clipping, the classic handset signature.
    # Narrower band, heavier compression and a resample down to 8 kHz and back
    # - closer to what a cheap handset over a poor connection actually does.
    "phone": (
        "highpass=f=400,lowpass=f=3000,acompressor=ratio=8:threshold=-18dB,"
        "aresample=8000,aresample=16000"
    ),
    # Broadband noise mixed under the speech.
    "noisy": None,  # handled separately: needs a second input
}


def _run(args: list[str]) -> None:
    proc = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", *args],
        capture_output=True,
        text=True,
        timeout=180,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-400:])


def build(entry: dict) -> list[dict]:
    src = entry["path"]
    stem = f"{entry['language']}_{entry['id']}"
    made = []

    for condition, chain in CONDITIONS.items():
        dest = OUT / f"{stem}_{condition}.mp4"
        if condition == "noisy":
            _run(
                [
                    "-i", src,
                    "-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.35",
                    "-f", "lavfi", "-i", "color=black:s=320x240:r=5",
                    "-filter_complex",
                    # normalize=0 keeps amix from scaling the mix back down,
                    # which is what made the earlier "noisy" variant almost
                    # indistinguishable from clean.
                    "[0:a]aresample=16000,volume=1.0[s];"
                    "[1:a]aresample=16000,volume=0.9[n];"
                    "[s][n]amix=inputs=2:duration=first:normalize=0[a]",
                    "-map", "[a]", "-map", "2:v",
                    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "96k",
                    str(dest),
                ]
            )
        else:
            _run(
                [
                    "-i", src,
                    "-f", "lavfi", "-i", "color=black:s=320x240:r=5",
                    "-af", chain,
                    "-map", "0:a", "-map", "1:v",
                    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "96k" if condition == "clean" else "48k",
                    str(dest),
                ]
            )

        made.append(
            {
                "clip_id": f"{stem}_{condition}",
                "language": entry["language"],
                "condition": condition,
                "path": str(dest),
                "reference": entry["reference"],
            }
        )
    return made


def build_code_switched(entries: list[dict]) -> dict | None:
    """Splice one English and one French clip into a single recording."""
    en = next((e for e in entries if e["language"] == "en"), None)
    fr = next((e for e in entries if e["language"] == "fr"), None)
    if not (en and fr):
        return None

    dest = OUT / "mixed_codeswitch.mp4"
    _run(
        [
            "-i", en["path"],
            "-i", fr["path"],
            "-f", "lavfi", "-i", "color=black:s=320x240:r=5",
            "-filter_complex",
            "[0:a]aresample=16000[a0];[1:a]aresample=16000[a1];"
            "[a0][a1]concat=n=2:v=0:a=1[a]",
            "-map", "[a]", "-map", "2:v",
            "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
            str(dest),
        ]
    )
    return {
        "clip_id": "mixed_codeswitch",
        "language": "mixed",
        "condition": "clean",
        "path": str(dest),
        "reference": f"{en['reference']} {fr['reference']}",
        "reference_en": en["reference"],
        "reference_fr": fr["reference"],
    }


def main() -> int:
    manifest = json.loads((CORPUS / "manifest.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)

    variants: list[dict] = []
    for entry in manifest:
        try:
            variants.extend(build(entry))
        except RuntimeError as exc:
            print(f"  FAILED {entry['id']}: {exc}")

    mixed = build_code_switched(manifest)
    if mixed:
        variants.append(mixed)

    (OUT / "variants.json").write_text(
        json.dumps(variants, indent=2, ensure_ascii=False)
    )

    by_lang: dict[str, int] = {}
    for v in variants:
        by_lang[v["language"]] = by_lang.get(v["language"], 0) + 1
    print(f"  built {len(variants)} clips: {by_lang}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
