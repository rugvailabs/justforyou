"""The confidence gate: decides whether an answer may reach a customer.

The product's central promise is that we only send a solved ticket. This module
is where that promise is kept, so it is deliberately conservative: the cost of
holding a good answer is an hour's delay, the cost of sending a wrong one is a
customer acting on bad advice.

Two layers, in order:

  1. Deterministic checks. Cheap, no model, and any failure is disqualifying on
     its own - a fabricated provider or an out-of-scope request cannot be
     argued out of by a confidence score.
  2. A self-evaluation pass. A separate model call scores the answer against a
     written rubric. Separate on purpose: a model asked to grade work it is
     still producing will rationalise it.

The gate fails closed. If the judge cannot run - no credentials, a rate limit,
a malformed reply - the ticket is held, never sent.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.schemas.service_results import ExtractedProblem
from app.schemas.solution import Solution
from app.services import llm

logger = logging.getLogger(__name__)

#: Phrases that mean the generator gave up or left a template behind. Any of
#: these in customer-facing text is disqualifying.
_PLACEHOLDER_MARKERS: tuple[str, ...] = (
    "lorem ipsum",
    "[insert",
    "todo",
    "xxx",
    "as an ai",
    "i cannot help",
    "i'm unable to",
    "placeholder",
    "your full system",
    "without our full system",
)

RUBRIC = """\
An answer is "solved" only when every one of these is true:

1. It answers the specific question this customer asked - not a generic
   version of it.
2. It is actionable: the customer knows what to do next, or is clearly told a
   professional must handle it.
3. Every factual claim is grounded in what we supplied - the problem, and the
   candidate providers. Nothing is asserted from general knowledge as if it
   were specific to this customer.
4. Nothing is invented: no business, phone number, price or rule that was not
   given.
5. It is in scope - not legal, medical or financial advice, and not abuse.

If any one fails, the answer is not solved.
"""


class Judgement(BaseModel):
    """The self-evaluation model's verdict, one field per rubric criterion."""

    answers_the_question: bool = Field(
        description="Does it address this specific request, not a generic one?"
    )
    is_actionable: bool = Field(
        description="Does the customer know what to do next?"
    )
    is_grounded: bool = Field(
        description="Is every claim supported by the problem or the providers "
        "supplied? False if anything is asserted from general knowledge as "
        "though it were specific to this customer."
    )
    nothing_invented: bool = Field(
        description="False if any business, phone number, price or rule appears "
        "that was not supplied."
    )
    in_scope: bool = Field(
        description="False for legal, medical or financial advice, or abuse."
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="How confident you are that a customer receiving this "
        "would consider their problem solved. Be strict - 0.9 means you would "
        "stake the company's reputation on it.",
    )
    reasoning: str = Field(
        description="One or two sentences on the weakest part of this answer. "
        "Name the flaw even when passing."
    )


JUDGE_SYSTEM_PROMPT = f"""\
You review draft answers before they are sent to customers of a Canadian \
local-services platform. You are the last check before a real person reads it.

{RUBRIC}

You are not being asked to improve the answer, only to judge it. Be strict: an \
answer that is merely plausible is not solved. Holding a good answer back costs \
us an hour; sending a wrong one costs a customer real money or safety.

Judge only what is in front of you. If you cannot verify a claim from the \
material supplied, that is not grounded.
"""


@dataclass
class GateDecision:
    """Why an answer may or may not be sent."""

    passed: bool
    confidence: float
    #: Human-readable failures, in the order they were detected.
    reasons: list[str] = field(default_factory=list)
    #: Per-check outcomes, for the review console and for tuning.
    checks: dict[str, bool] = field(default_factory=dict)
    #: The judge's own words, when it ran.
    judge_reasoning: str | None = None
    #: True when the gate could not evaluate and defaulted to holding.
    judge_unavailable: bool = False

    @property
    def reason_code(self) -> str:
        """Stable label for the ReviewQueue row."""
        if self.judge_unavailable:
            return "gate_unavailable"
        if not self.checks.get("deterministic", True):
            return "gate_failed_checks"
        return "gate_low_confidence"

    def summary(self) -> str:
        return "; ".join(self.reasons) or "passed"


# ---------------------------------------------------------------------------
# layer 1 - deterministic checks
# ---------------------------------------------------------------------------
def _deterministic_checks(
    solution: Solution, problem: ExtractedProblem
) -> tuple[dict[str, bool], list[str]]:
    """Cheap disqualifying checks. No model, no network."""
    extra = problem.raw_json or {}
    result = solution.result
    text = f"{result.summary} {' '.join(s.action for s in result.steps)}".lower()

    checks: dict[str, bool] = {}
    reasons: list[str] = []

    def check(name: str, ok: bool, why: str) -> None:
        checks[name] = ok
        if not ok:
            reasons.append(why)

    check(
        "generator_trusted",
        solution.trusted,
        f"answer came from an untrusted path ({solution.generator})",
    )
    check(
        "extraction_trusted",
        bool(extra.get("trusted", False)),
        f"the request was understood by an untrusted path "
        f"({extra.get('extractor', 'unknown')})",
    )
    check(
        "citations_grounded",
        set(result.referenced_provider_ids) <= set(solution.candidate_provider_ids),
        "answer cites a provider that was never supplied to it",
    )
    check(
        "request_unambiguous",
        not extra.get("is_ambiguous", False),
        "the request was too vague to answer without asking a question first",
    )
    check(
        "request_in_scope",
        not extra.get("is_out_of_scope", False),
        "the request is outside what we may answer automatically",
    )
    check(
        "not_sensitive_category",
        not extra.get("sensitive_category", False),
        f"{problem.category} needs a licensed professional's judgement",
    )
    check(
        "no_placeholder_text",
        not any(m in text for m in _PLACEHOLDER_MARKERS),
        "answer contains placeholder or refusal language",
    )
    check(
        "summary_substantive",
        len(result.summary.strip()) >= 40,
        "answer is too short to be useful",
    )
    check(
        "actionable",
        bool(result.steps) or result.requires_professional,
        "answer gives no steps and does not say a professional is needed",
    )
    check(
        "nothing_missing",
        not extra.get("missing_information"),
        "we still need information the customer did not give us",
    )

    return checks, reasons


# ---------------------------------------------------------------------------
# layer 2 - self-evaluation
# ---------------------------------------------------------------------------
def _render_for_judge(
    solution: Solution, problem: ExtractedProblem, provider_lines: str
) -> str:
    return (
        f"THE CUSTOMER'S PROBLEM\n"
        f"{problem.problem_summary}\n"
        f"Category: {problem.category} | Urgency: {problem.urgency} | "
        f"Location: {problem.location or 'not stated'}\n\n"
        f"PROVIDERS THAT WERE SUPPLIED TO THE WRITER\n"
        f"{provider_lines or '(none)'}\n\n"
        f"THE DRAFT ANSWER\n"
        f"{solution.as_text()}\n\n"
        f"THE WRITER'S OWN ASSESSMENT\n"
        f"{solution.result.self_assessment}\n"
    )


def _judge(
    solution: Solution, problem: ExtractedProblem, provider_lines: str
) -> Judgement:
    return llm.parse(
        label="quality-gate",
        system=JUDGE_SYSTEM_PROMPT,
        user=_render_for_judge(solution, problem, provider_lines),
        output_format=Judgement,
        # Judging is the decision that protects the customer; give it room.
        effort="high",
    )


# ---------------------------------------------------------------------------
# the gate
# ---------------------------------------------------------------------------
def evaluate(
    solution: Solution,
    problem: ExtractedProblem,
    provider_lines: str = "",
) -> GateDecision:
    """Decide whether `solution` may be sent without a human reading it first.

    Never raises. Any failure to evaluate is a decision to hold.
    """
    settings = get_settings()
    checks, reasons = _deterministic_checks(solution, problem)
    deterministic_ok = all(checks.values())
    checks["deterministic"] = deterministic_ok

    # A disqualifying check makes the judge's opinion irrelevant, and paying
    # for a model call to overturn it would be wrong anyway.
    if not deterministic_ok:
        logger.info("gate: held on deterministic checks: %s", "; ".join(reasons))
        return GateDecision(
            passed=False, confidence=0.0, reasons=reasons, checks=checks
        )

    if not llm.is_configured():
        # Fail closed. Unlike extraction and solving, there is no development
        # fallback here: a gate that waves things through when it cannot think
        # is worse than no gate, because it looks like one.
        logger.warning("gate: no judge available - holding for review")
        return GateDecision(
            passed=False,
            confidence=0.0,
            reasons=["quality check unavailable, so the answer was not sent"],
            checks=checks,
            judge_unavailable=True,
        )

    try:
        verdict = _judge(solution, problem, provider_lines)
    except Exception as exc:  # noqa: BLE001 - any judge failure means hold
        logger.error("gate: judge failed, holding for review: %s", exc)
        return GateDecision(
            passed=False,
            confidence=0.0,
            reasons=[f"quality check could not complete: {exc}"],
            checks=checks,
            judge_unavailable=True,
        )

    criteria = {
        "answers_the_question": verdict.answers_the_question,
        "is_actionable": verdict.is_actionable,
        "is_grounded": verdict.is_grounded,
        "nothing_invented": verdict.nothing_invented,
        "in_scope": verdict.in_scope,
    }
    checks.update(criteria)
    reasons.extend(
        f"judge: {name.replace('_', ' ')} failed"
        for name, ok in criteria.items()
        if not ok
    )

    threshold = settings.gate_confidence_threshold
    if verdict.confidence < threshold:
        reasons.append(
            f"confidence {verdict.confidence:.2f} is below the {threshold:.2f} "
            f"threshold"
        )
    checks["confidence_above_threshold"] = verdict.confidence >= threshold

    passed = all(criteria.values()) and verdict.confidence >= threshold

    logger.info(
        "gate: %s confidence=%.2f criteria=%s",
        "PASS" if passed else "HOLD",
        verdict.confidence,
        {k: v for k, v in criteria.items() if not v} or "all ok",
    )

    return GateDecision(
        passed=passed,
        confidence=verdict.confidence,
        reasons=reasons,
        checks=checks,
        judge_reasoning=verdict.reasoning,
    )


def as_storage_json(decision: GateDecision) -> dict:
    """Flatten a decision for the matches.gate_json column."""
    return {
        "passed": decision.passed,
        "confidence": decision.confidence,
        "reasons": decision.reasons,
        "checks": decision.checks,
        "judge_reasoning": decision.judge_reasoning,
        "judge_unavailable": decision.judge_unavailable,
        "reason_code": decision.reason_code,
    }


__all__ = ["RUBRIC", "GateDecision", "Judgement", "evaluate", "as_storage_json"]
