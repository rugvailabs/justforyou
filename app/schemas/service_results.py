"""Typed contracts returned by the service layer.

These are the seam between the service implementations (app/services/) and
everything that consumes them (Celery tasks today, API routes later). Phases
3-7 swap the stub bodies for real implementations; as long as these shapes hold,
no task or route needs to change.
"""

from __future__ import annotations

from typing import Any, Dict, Literal

from pydantic import BaseModel, Field

Urgency = Literal["low", "medium", "high"]
MatchType = Literal["provider", "ai_generated"]
Channel = Literal["email", "sms"]


class TranscriptResult(BaseModel):
    """Output of the speech-to-text step."""

    transcript: str
    language_detected: str
    duration_seconds: float | None = None

    #: Confidence Whisper reported for its language guess (0-1), when known.
    language_confidence: float | None = None




class ExtractedProblem(BaseModel):
    """Structured problem parsed out of a transcript.

    Note: this is the *transport* shape. The persisted row is the SQLAlchemy
    model of the same name in app.models.extracted_problem.
    """

    category: str
    problem_summary: str
    urgency: Urgency
    location: str | None = None
    budget: str | None = None
    raw_json: Dict[str, Any] = Field(default_factory=dict)


class MatchResult(BaseModel):
    """A provider match or an AI-generated fallback answer."""

    provider_id: int | None
    solution_text: str
    match_type: MatchType
    needs_human_review: bool


class NotificationResult(BaseModel):
    """Outcome of an outbound delivery attempt."""

    success: bool
    channel: Channel
    recipient: str
    error: str | None = None
