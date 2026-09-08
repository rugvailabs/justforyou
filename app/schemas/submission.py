"""Request/response schemas for submissions."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.submission import InputType, SubmissionStatus


class SubmissionCreateRequest(BaseModel):
    """A problem typed straight into the form, with no recording involved."""

    text: str = Field(
        min_length=10,
        max_length=10_000,
        description="Describe the problem in your own words.",
        examples=["My kitchen sink has been leaking under the cabinet for two days."],
    )


class SubmissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    input_type: InputType
    #: Object-storage key of the audio recording; null for text submissions.
    video_path: str | None
    status: SubmissionStatus
    transcript: str | None
    language_detected: str | None
    created_at: datetime


class MatchedProvider(BaseModel):
    """The provider behind an exact match, safe to show the customer."""

    id: int
    name: str
    category: str
    region: str
    contact_email: str
    contact_phone: str | None
    verified: bool


class SubmissionMatch(BaseModel):
    """The answer, surfaced in-app the moment matching finishes.

    `match_type` is what the UI keys off: "provider" means a vetted listing the
    customer can act on right now; "ai_generated" means we have no verified
    provider yet and a person is still looking.
    """

    id: int
    match_type: str
    solution_text: str
    needs_human_review: bool
    provider: MatchedProvider | None = None


class SubmissionDetailResponse(SubmissionResponse):
    """Submission plus its match, once one exists."""

    category: str | None = None
    urgency: str | None = None
    location: str | None = None
    match: SubmissionMatch | None = None
