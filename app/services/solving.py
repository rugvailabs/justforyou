"""Generating an answer to the customer's problem.

The core of the product: given a structured problem and a set of candidate
providers, produce something the customer can act on. A provider referral is
one possible ingredient, not the deliverable.

Nothing here decides whether the answer is good enough to send. It reports what
it produced and how much to trust the path that produced it; the confidence
gate makes the call.
"""

from __future__ import annotations

import json
import logging

from app.core.config import get_settings
from app.models.provider import Provider
from app.schemas.service_results import ExtractedProblem
from app.schemas.solution import Solution, SolutionResult, SolutionStep
from app.services import llm
from app.services.llm import LLMTransient, LLMUnavailable

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You answer inbound problems for a Canadian local-services platform. Your answer \
goes straight to the customer if a quality check passes, so write to them.

What a good answer does:
- Tells them what is going on, in plain language, in their own language \
(English or French - match what they wrote).
- Gives ordered, concrete steps they can actually take.
- Names a provider from the candidate list when hands-on work is genuinely \
needed. Give a realistic cost range when you can.
- Says plainly when they should stop and call a professional.

Hard rules:
- You may only reference providers from the candidate list you are given, by \
their exact id. Never invent a business, a phone number, or a price you were \
not given. If the list is empty, write the answer without a referral.
- Never give legal, medical or financial advice. Say that a licensed \
professional is needed and stop.
- Canada-specific claims - tenancy rules, licensing, permits, standards - vary \
by province. If you are not certain for their province, say so in caveats \
rather than stating it as fact.
- self_assessment is where you are honest with us, not with the customer. Say \
what you assumed and what you could not determine. An answer that admits a gap \
is more useful to us than one that papers over it.
"""


def _render_candidates(providers: list[Provider]) -> str:
    if not providers:
        return "(no verified providers are listed for this category and region)"
    lines = []
    for p in providers:
        contact = p.contact_phone or p.contact_email
        lines.append(
            f"- id={p.id} | {p.name} | {p.category} | {p.region} | "
            f"contact: {contact} | verified: {p.verified}"
        )
    return "\n".join(lines)


def _build_prompt(problem: ExtractedProblem, providers: list[Provider]) -> str:
    extra = problem.raw_json or {}
    missing = extra.get("missing_information") or []

    return (
        f"Customer's problem: {problem.problem_summary}\n"
        f"Category: {problem.category}\n"
        f"Urgency: {problem.urgency}\n"
        f"Location: {problem.location or 'not stated'}\n"
        f"Budget: {problem.budget or 'not stated'}\n"
        f"Language: {extra.get('language', 'en')}\n"
        f"Information the customer did not give us: "
        f"{', '.join(missing) if missing else 'none'}\n\n"
        f"Candidate providers you may reference:\n"
        f"{_render_candidates(providers)}\n"
    )


def _template_solution(
    problem: ExtractedProblem, providers: list[Provider]
) -> Solution:
    """Deterministic stand-in used only when no API key is configured.

    Deliberately thin. It exists so a local stack still produces something
    end to end; it is marked untrusted so the gate can never auto-send it.
    """
    top = providers[0] if providers else None

    if top is not None:
        contact = top.contact_phone or top.contact_email
        summary = (
            f"Thanks for getting in touch about your {problem.category} problem. "
            f"We have a verified provider in {top.region} who handles this kind "
            f"of work, and they are the fastest route to getting it sorted."
        )
        steps = [
            SolutionStep(
                action=f"Contact {top.name} at {contact}",
                detail="Mention what you told us so they arrive prepared.",
            ),
            SolutionStep(
                action="Ask for a written quote before any work starts",
                detail="A quote in writing protects you if the scope changes.",
            ),
        ]
    else:
        summary = (
            f"Thanks for getting in touch about your {problem.category} problem. "
            "We do not yet have a verified provider listed for this, so a member "
            "of our team is looking into it personally."
        )
        steps = []

    return Solution(
        result=SolutionResult(
            summary=summary,
            steps=steps,
            caveats=[
                "This response was generated without our full system available, "
                "so a member of our team is reviewing it before acting on it."
            ],
            referenced_provider_ids=[top.id] if top else [],
            estimated_cost=None,
            requires_professional=True,
            self_assessment=(
                "Generated from a template because no language model was "
                "available. It has not addressed the specifics of this request."
            ),
            language="en",
        ),
        generator="template-fallback",
        trusted=False,
        candidate_provider_ids=[p.id for p in providers],
        model=None,
    )


def generate_solution(
    problem: ExtractedProblem, providers: list[Provider]
) -> Solution:
    """Produce an answer to `problem`, optionally referencing `providers`.

    Session-free by design: the caller retrieves the candidates and persists
    whatever comes back.

    Raises:
        LLMUnavailable: no credentials, or the model declined. Permanent.
        LLMTransient: rate limit or server error. Retryable.

    The exception is development: with `llm_fallback_to_keywords` set and no key
    configured, a template answer is returned instead, marked untrusted.
    """
    settings = get_settings()

    if not llm.is_configured():
        if settings.llm_fallback_to_keywords:
            logger.warning(
                "solving: no Anthropic API key - returning a template answer. "
                "It is marked untrusted and must not reach a customer unreviewed."
            )
            return _template_solution(problem, providers)
        raise LLMUnavailable("No Anthropic API key configured")

    result = llm.parse(
        label="solving",
        system=SYSTEM_PROMPT,
        user=_build_prompt(problem, providers),
        output_format=SolutionResult,
        # Answering well is harder than classifying, so it gets more headroom.
        effort="high",
        max_tokens=8192,
    )

    # Grounding: the model may only cite providers it was actually shown.
    # Phase 7 fails a ticket on this, but stripping it here means a stray id can
    # never reach the customer even if the gate is misconfigured.
    allowed = {p.id for p in providers}
    invented = [pid for pid in result.referenced_provider_ids if pid not in allowed]
    if invented:
        logger.error(
            "solving: model referenced providers it was not given: %s", invented
        )
        result.referenced_provider_ids = [
            pid for pid in result.referenced_provider_ids if pid in allowed
        ]

    logger.info(
        "solving: category=%s steps=%d providers=%s professional=%s lang=%s",
        problem.category,
        len(result.steps),
        result.referenced_provider_ids,
        result.requires_professional,
        result.language,
    )

    return Solution(
        result=result,
        generator="claude",
        # Trusted only in the sense that a real model produced it under the
        # grounding rules. Whether it is good enough to send is Phase 7's call.
        trusted=not invented,
        candidate_provider_ids=[p.id for p in providers],
        model=settings.llm_model,
    )


def to_storage_json(solution: Solution) -> dict:
    """Flatten a Solution for the matches.solution_json column."""
    return json.loads(solution.model_dump_json())


__all__ = [
    "LLMTransient",
    "LLMUnavailable",
    "SYSTEM_PROMPT",
    "generate_solution",
    "to_storage_json",
]
