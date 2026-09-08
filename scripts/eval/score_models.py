"""Score Whisper model sizes against the corpus.

Reports word error rate per language and per recording condition, plus the
real-time factor, so the accuracy/speed trade-off is measurable rather than
asserted.

    python scripts/eval/score_models.py base small
    python scripts/eval/score_models.py base small medium

WER is computed on normalised text (case, punctuation and apostrophe style
folded away) because none of those matter for the downstream extraction step.
"""

from __future__ import annotations

import gc
import json
import re
import sys
import time
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

VARIANTS = Path("/tmp/corpus/variants/variants.json")
RESULTS = Path("/tmp/corpus/results.json")

_PUNCT = re.compile(r"[^\w\s'’-]", re.UNICODE)
_WS = re.compile(r"\s+")


def normalise(text: str) -> list[str]:
    """Fold away everything that does not change meaning for extraction."""
    text = unicodedata.normalize("NFC", text).lower()
    text = text.replace("’", "'")
    text = _PUNCT.sub(" ", text)
    text = _WS.sub(" ", text).strip()
    return text.split()


def wer(reference: str, hypothesis: str) -> float:
    """Word error rate: (substitutions + insertions + deletions) / ref words."""
    ref, hyp = normalise(reference), normalise(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0

    # Standard Levenshtein over words, single-row DP.
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, start=1):
        cur = [i] + [0] * len(hyp)
        for j, h in enumerate(hyp, start=1):
            cur[j] = min(
                prev[j] + 1,           # deletion
                cur[j - 1] + 1,        # insertion
                prev[j - 1] + (r != h),  # substitution / match
            )
        prev = cur
    return prev[-1] / len(ref)


def run_model(size: str, clips: list[dict]) -> list[dict]:
    from faster_whisper import WhisperModel

    print(f"\n=== {size} ===")
    load_started = time.perf_counter()
    model = WhisperModel(size, device="cpu", compute_type="int8", download_root="/models")
    print(f"  loaded in {time.perf_counter() - load_started:.1f}s")

    rows = []
    for clip in clips:
        started = time.perf_counter()
        segments, info = model.transcribe(clip["path"], beam_size=5, vad_filter=True)
        text = " ".join(s.text.strip() for s in segments).strip()
        elapsed = time.perf_counter() - started
        duration = getattr(info, "duration", 0.0) or 0.0

        rows.append(
            {
                "model": size,
                "clip_id": clip["clip_id"],
                "language": clip["language"],
                "condition": clip["condition"],
                "reference": clip["reference"],
                "hypothesis": text,
                "detected_language": info.language,
                "language_confidence": round(
                    float(getattr(info, "language_probability", 0.0)), 3
                ),
                "wer": round(wer(clip["reference"], text), 3),
                "seconds": round(elapsed, 2),
                "audio_seconds": round(duration, 2),
                "rtf": round(elapsed / duration, 2) if duration else None,
            }
        )

    del model
    gc.collect()
    return rows


def summarise(rows: list[dict]) -> None:
    models = sorted({r["model"] for r in rows}, key=lambda m: ["base", "small", "medium"].index(m))

    print("\n\nWER by language and condition (lower is better)")
    print(f"  {'model':8} {'lang':5} {'condition':10} {'clips':>5} {'WER':>7} {'lang-ok':>8} {'RTF':>6}")
    print("  " + "-" * 56)
    for model in models:
        for lang in ("en", "fr"):
            for cond in ("clean", "phone", "noisy"):
                subset = [
                    r for r in rows
                    if r["model"] == model and r["language"] == lang and r["condition"] == cond
                ]
                if not subset:
                    continue
                mean_wer = sum(r["wer"] for r in subset) / len(subset)
                lang_ok = sum(r["detected_language"] == lang for r in subset)
                rtfs = [r["rtf"] for r in subset if r["rtf"]]
                rtf = sum(rtfs) / len(rtfs) if rtfs else 0
                print(
                    f"  {model:8} {lang:5} {cond:10} {len(subset):5} "
                    f"{mean_wer:6.1%} {lang_ok:>4}/{len(subset):<3} {rtf:5.2f}x"
                )

    print("\nOverall by model")
    for model in models:
        subset = [r for r in rows if r["model"] == model and r["language"] in ("en", "fr")]
        mean_wer = sum(r["wer"] for r in subset) / len(subset)
        rtfs = [r["rtf"] for r in subset if r["rtf"]]
        print(
            f"  {model:8} WER {mean_wer:6.1%}   mean RTF "
            f"{sum(rtfs)/len(rtfs):.2f}x   total {sum(r['seconds'] for r in subset):.0f}s"
        )


def main(argv: list[str]) -> int:
    sizes = argv[1:] or ["base", "small"]
    clips = json.loads(VARIANTS.read_text())
    scored = [c for c in clips if c["language"] in ("en", "fr")]
    print(f"  {len(scored)} scoreable clips, models: {', '.join(sizes)}")

    rows: list[dict] = []
    for size in sizes:
        rows.extend(run_model(size, scored))

    RESULTS.write_text(json.dumps(rows, indent=2, ensure_ascii=False))
    summarise(rows)
    print(f"\n  raw results: {RESULTS}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
