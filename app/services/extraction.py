"""Structured problem extraction from a transcript.

Turns free-form text - typed, or transcribed from a voice note - into the
structured record the rest of the pipeline reasons about. Backed by Claude with
a schema-constrained response, so the category can never be a word the model
invented.
"""

from __future__ import annotations

import logging
import re
from typing import Literal

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.schemas.service_results import ExtractedProblem
from app.services import llm
from app.services.llm import LLMTransient, LLMUnavailable

logger = logging.getLogger(__name__)

#: The closed set of categories a provider can be listed under. Matching filters
#: on this exact string, so a category outside the taxonomy silently matches
#: nothing - which is why it is an enum in the response schema, not free text.
Category = Literal[
    "plumbing",
    "electrical",
    "legal",
    "it support",
    "mobile repair",
    "appliance repair",
    "automotive",
    "moving",
    "cleaning",
    "other",
]

TAXONOMY: tuple[str, ...] = (
    "plumbing",
    "electrical",
    "legal",
    "it support",
    "mobile repair",
    "appliance repair",
    "automotive",
    "moving",
    "cleaning",
    "other",
)

#: Categories where a wrong or overconfident answer can cause real harm. The
#: confidence gate treats these as needing review regardless of score.
SENSITIVE_CATEGORIES: frozenset[str] = frozenset({"legal"})


class ExtractionResult(BaseModel):
    """What the model must return. Enforced by the API, not by parsing prose."""

    category: Category = Field(
        description="The single best-fitting service category. Use 'other' if "
        "nothing fits - never invent a category."
    )
    problem_summary: str = Field(
        description="One or two plain sentences stating the customer's actual "
        "problem, in their own terms. No preamble, no advice."
    )
    urgency: Literal["low", "medium", "high"] = Field(
        description="high when there is damage, danger or a hard deadline; low "
        "when the customer signals no rush; medium otherwise."
    )
    location: str | None = Field(
        default=None,
        description="City and province if stated, as 'City, Province'. Null if "
        "the customer did not say where they are.",
    )
    budget: str | None = Field(
        default=None,
        description="Budget or price expectation if stated. Null otherwise.",
    )
    language: Literal["en", "fr", "other"] = Field(
        description="Language the customer wrote or spoke in."
    )
    missing_information: list[str] = Field(
        default_factory=list,
        description="Specific facts a professional would need before they could "
        "actually solve this. Empty when the request is complete.",
    )
    is_ambiguous: bool = Field(
        description="True when the request is too vague to act on without "
        "asking the customer a question first."
    )
    is_out_of_scope: bool = Field(
        description="True for anything that is not a request for help with a "
        "practical problem - abuse, spam, or a question needing licensed "
        "legal, medical or financial advice."
    )


SYSTEM_PROMPT = """\
You classify inbound customer requests for a Canadian local-services platform.

Your only job is to understand the request. Do not solve it, do not suggest \
providers, and do not write advice - a later step does that.

Rules:
- Pick exactly one category from the allowed set. If nothing fits, use "other". \
Never invent a category.
- problem_summary restates the customer's problem. It is not a solution.
- Set is_ambiguous when you could not act on this without asking a question \
first. A vague request is not a failure to report - it is the correct answer.
- Set is_out_of_scope for abuse, spam, or anything requiring a licensed \
professional's judgement (legal advice, medical advice, financial advice).
- list missing_information concretely: "which appliance brand", "whether the \
tenant has a written lease". Do not pad it.
- Customers write in English or French. Record which, and summarise in the \
same language they used.
"""


# ---------------------------------------------------------------------------
# keyword fallback - development only
# ---------------------------------------------------------------------------
_CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "mobile repair": (
        "mobile", "phone", "cellphone", "cell phone", "smartphone", "iphone",
        "android", "screen repair", "service center", "service centre",
    ),
    "plumbing": ("plumb", "sink", "leak", "drain", "faucet", "toilet", "pipe", "water heater"),
    "electrical": ("electric", "wiring", "outlet", "breaker", "fuse", "socket"),
    "legal": ("lawyer", "legal", "notaire", "notary", "contract", "lease", "court"),
    "it support": ("laptop", "computer", "wifi", "wi-fi", "network", "printer", "software"),
    "appliance repair": ("fridge", "refrigerator", "washer", "dryer", "dishwasher", "oven", "stove"),
    "automotive": ("car", "vehicle", "brake", "tire", "tyre", "engine", "mechanic"),
    "moving": ("move", "moving", "movers", "relocate"),
    "cleaning": ("clean", "cleaner", "housekeep"),
}

_LOCATIONS: dict[str, str] = {
    "toronto": "Toronto, Ontario",
    "ottawa": "Ottawa, Ontario",
    "mississauga": "Mississauga, Ontario",
    "hamilton": "Hamilton, Ontario",
    "montreal": "Montreal, Quebec",
    "montréal": "Montreal, Quebec",
    "quebec": "Quebec City, Quebec",
    "québec": "Quebec City, Quebec",
    "laval": "Laval, Quebec",
    "vancouver": "Vancouver, British Columbia",
    "calgary": "Calgary, Alberta",
    "edmonton": "Edmonton, Alberta",
    "winnipeg": "Winnipeg, Manitoba",
    "halifax": "Halifax, Nova Scotia",
}

_URGENT = ("emergency", "urgent", "asap", "immediately", "flooding", "no heat", "danger")
_RELAXED = ("sometime", "no rush", "whenever", "eventually", "next month")


def _keyword_extract(text: str) -> ExtractedProblem:
    """Deterministic stand-in used only when no API key is configured."""
    lowered = text.lower()

    best = (0, "other")
    for category, keywords in _CATEGORY_KEYWORDS.items():
        hits = sum(1 for kw in keywords if kw in lowered)
        if hits > best[0]:
            best = (hits, category)
    category = best[1]

    location = None
    for needle, canonical in _LOCATIONS.items():
        if re.search(rf"\b{re.escape(needle)}\b", lowered):
            location = canonical
            break

    if any(w in lowered for w in _URGENT):
        urgency = "high"
    elif any(w in lowered for w in _RELAXED):
        urgency = "low"
    else:
        urgency = "medium"

    summary = text if len(text) <= 280 else text[:277] + "..."

    return ExtractedProblem(
        category=category,
        problem_summary=summary or "No description provided.",
        urgency=urgency,
        location=location,
        budget=None,
        raw_json={
            "extractor": "keyword-fallback",
            "llm": False,
            # The confidence gate must never treat a keyword guess as trusted.
            "trusted": False,
            "reason": "no Anthropic API key configured",
            "transcript_chars": len(text),
        },
    )


# ---------------------------------------------------------------------------
# public entry point
# ---------------------------------------------------------------------------
def extract_problem(transcript: str) -> ExtractedProblem:
    """Turn a free-form transcript into a structured problem record.

    Raises:
        LLMUnavailable: no credentials, or the model declined. Permanent -
            the caller routes the submission to human review.
        LLMTransient: rate limit or server error. Retryable.

    The one exception is development: with `llm_fallback_to_keywords` set and
    no key configured, a keyword classifier stands in so the local stack keeps
    working. Its output is marked `trusted: false` in raw_json.
    """
    text = (transcript or "").strip()
    settings = get_settings()

    if not llm.is_configured():
        if settings.llm_fallback_to_keywords:
            logger.warning(
                "extraction: no Anthropic API key - falling back to the keyword "
                "classifier. Results are marked untrusted and must not be sent "
                "to a customer unreviewed."
            )
            return _keyword_extract(text)
        raise LLMUnavailable("No Anthropic API key configured")

    result = llm.parse(
        label="extraction",
        system=SYSTEM_PROMPT,
        user=f"Customer request:\n\n{text}",
        output_format=ExtractionResult,
    )

    # The schema already constrains this, but a mismatch between the enum here
    # and the taxonomy used by matching would be a silent zero-match bug.
    category = result.category if result.category in TAXONOMY else "other"
    if category != result.category:
        logger.error(
            "extraction: model returned category %r outside the taxonomy",
            result.category,
        )

    logger.info(
        "extraction: category=%s urgency=%s location=%s lang=%s ambiguous=%s "
        "out_of_scope=%s missing=%d",
        category,
        result.urgency,
        result.location,
        result.language,
        result.is_ambiguous,
        result.is_out_of_scope,
        len(result.missing_information),
    )

    return ExtractedProblem(
        category=category,
        problem_summary=result.problem_summary,
        urgency=result.urgency,
        location=result.location,
        budget=result.budget,
        raw_json={
            "extractor": "claude",
            "llm": True,
            "trusted": True,
            "model": settings.llm_model,
            "language": result.language,
            "missing_information": result.missing_information,
            "is_ambiguous": result.is_ambiguous,
            "is_out_of_scope": result.is_out_of_scope,
            "sensitive_category": category in SENSITIVE_CATEGORIES,
            "transcript_chars": len(text),
        },
    )


__all__ = [
    "TAXONOMY",
    "SENSITIVE_CATEGORIES",
    "Category",
    "ExtractionResult",
    "LLMTransient",
    "LLMUnavailable",
    "extract_problem",
]
