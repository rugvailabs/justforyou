"""Manually kick off the stub pipeline for one submission.

    python scripts/trigger_pipeline.py <submission_id>
"""

from __future__ import annotations

import sys
from pathlib import Path

# Running this as a file puts scripts/ on sys.path, not the project root, so
# `import app...` would fail. Add the project root explicitly.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.workers.tasks import start_pipeline  # noqa: E402


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(f"usage: {argv[0]} <submission_id>", file=sys.stderr)
        return 2

    try:
        submission_id = int(argv[1])
    except ValueError:
        print(f"submission_id must be an integer, got {argv[1]!r}", file=sys.stderr)
        return 2

    result = start_pipeline(submission_id)
    print(f"Queued pipeline for submission {submission_id}")
    print(f"  first task : transcribe_task")
    print(f"  celery id  : {result.id}")
    print("  chain      : transcribe -> extract -> match -> notify")
    print("Watch it run with: docker-compose logs -f celery_worker")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
