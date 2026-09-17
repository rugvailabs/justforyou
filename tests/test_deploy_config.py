"""Settings that decide how the API runs in a deployment.

Each case runs in a fresh interpreter: settings are read once and cached, and
the router is assembled at import time, so a flag flipped inside this process
would test nothing.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _run(code: str, **env: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-c", code],
        cwd=PROJECT_ROOT,
        env={**os.environ, **env},
        capture_output=True,
        text=True,
        timeout=120,
    )


VOICE_ROUTES = (
    "from app.main import app; "
    "print(sorted(p for p in app.openapi()['paths'] "
    "if any(part in p for part in ('/submissions', '/consents'))))"
)


def test_voice_pipeline_routes_are_mounted_by_default():
    result = _run(VOICE_ROUTES, VOICE_PIPELINE_ENABLED="true")

    assert result.returncode == 0, result.stderr
    assert "/api/v1/submissions/upload" in result.stdout


def test_voice_pipeline_routes_are_absent_when_disabled():
    result = _run(VOICE_ROUTES, VOICE_PIPELINE_ENABLED="false")

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "[]"


STARTUP = (
    "from fastapi.testclient import TestClient; from app.main import app\n"
    "with TestClient(app) as c: print(c.get('/health').json())"
)


def test_the_example_secret_key_is_refused_outside_development():
    result = _run(
        STARTUP,
        ENVIRONMENT="staging",
        SECRET_KEY="change-me-to-a-long-random-string",
        VOICE_PIPELINE_ENABLED="false",
    )

    assert result.returncode != 0
    assert "SECRET_KEY is unset or still the example value" in result.stderr


def test_a_real_secret_key_starts_outside_development():
    result = _run(
        STARTUP,
        ENVIRONMENT="staging",
        SECRET_KEY="a-long-random-value-that-is-not-the-example-0123456789",
        VOICE_PIPELINE_ENABLED="false",
    )

    assert result.returncode == 0, result.stderr
    assert "'status': 'ok'" in result.stdout
