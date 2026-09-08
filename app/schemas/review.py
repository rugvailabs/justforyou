"""Request/response schemas for the review console."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ReviewStats(BaseModel):
    """Queue health, for the top of the console."""

    open_count: int
    claimed_count: int
    #: Age of the customer who has been waiting longest, in hours.
    oldest_age_hours: float
    #: Open tickets grouped by why the gate held them.
    by_reason: dict[str, int]
    resolved_today: int


class ReviewListItem(BaseModel):
    """One row in the queue."""

    id: int
    submission_id: int
    reason: str
    reason_code: str
    claimed_by: str | None
    decision: str | None
    resolved_at: datetime | None
    submission_status: str
    age_hours: float
    #: First line of what the customer actually asked, for scanning the list.
    preview: str


class ReviewDetail(ReviewListItem):
    """Everything needed to judge one ticket, on one screen."""

    claimed_at: datetime | None = None
    decided_by: str | None = None
    reviewer_note: str | None = None

    input_type: str
    customer_email: str
    customer_name: str
    transcript: str | None

    category: str | None
    urgency: str | None
    location: str | None
    #: What extraction understood, including its ambiguity and scope flags.
    extraction_json: dict[str, Any] | None

    solution_text: str | None
    #: The AI's version, present only when a reviewer edited the answer.
    original_solution_text: str | None
    solution_json: dict[str, Any] | None
    #: The gate's per-check results and the judge's reasoning.
    gate_json: dict[str, Any] | None
    confidence: float | None

    provider_name: str | None
    provider_contact: str | None


class ApproveRequest(BaseModel):
    """Release the answer, optionally rewriting it first."""

    solution_text: str | None = Field(
        default=None,
        min_length=20,
        max_length=20_000,
        description="Edited answer. Omit to send the AI's version unchanged.",
    )
    note: str | None = Field(
        default=None,
        max_length=1000,
        description="Why you approved, or what you changed. Stored on the audit row.",
    )


class RejectRequest(BaseModel):
    reason: str = Field(
        min_length=3,
        max_length=1000,
        description="Why this cannot be sent. Recorded against the submission.",
    )


class InfoRequest(BaseModel):
    question: str = Field(
        min_length=5,
        max_length=1000,
        description="What we need from the customer before this can be answered.",
    )
