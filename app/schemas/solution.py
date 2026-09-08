"""The shape of an answer to a customer's problem.

This is the deliverable the product exists to produce. A provider referral is
one possible ingredient of a solution, not a substitute for one.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SolutionStep(BaseModel):
    """One thing the customer should actually do, in order."""

    action: str = Field(description="A single concrete step, in the imperative.")
    detail: str | None = Field(
        default=None,
        description="Why this step matters or how to do it, when that is not "
        "obvious. Null when the action speaks for itself.",
    )


class SolutionResult(BaseModel):
    """A generated answer, before it has been judged fit to send.

    Nothing here asserts the answer is good - that is Phase 7's job. This is
    only the content plus the signals a reviewer or a gate needs to judge it.
    """

    summary: str = Field(
        description="Two or three sentences telling the customer what is going "
        "on and what happens next. Written to them, not about them."
    )
    steps: list[SolutionStep] = Field(
        default_factory=list,
        description="Ordered, concrete actions. Empty only when the honest "
        "answer is that a professional must look at it first.",
    )
    caveats: list[str] = Field(
        default_factory=list,
        description="Things that could make this advice wrong, safety warnings, "
        "or when to stop and call someone.",
    )
    #: Provider ids the answer refers to. Must be a subset of the candidates
    #: supplied to the generator - Phase 7 checks exactly this.
    referenced_provider_ids: list[int] = Field(default_factory=list)
    estimated_cost: str | None = Field(
        default=None,
        description="A rough price range in CAD if one can honestly be given, "
        "e.g. '$150-$400'. Null when it genuinely depends.",
    )
    requires_professional: bool = Field(
        description="True when the customer should not attempt this themselves."
    )
    self_assessment: str = Field(
        description="One honest sentence on how well this answers the specific "
        "question asked, including anything you had to assume."
    )
    language: Literal["en", "fr"] = Field(
        description="Language the answer is written in. Match the customer."
    )


class Solution(BaseModel):
    """A generated solution plus how it was produced.

    `trusted` is the hand-off to the confidence gate: a template fallback or a
    degraded path sets it false, and the gate must never auto-send those.
    """

    result: SolutionResult
    #: "claude" or "template-fallback".
    generator: str
    trusted: bool
    #: Providers that were offered to the generator, for the grounding check.
    candidate_provider_ids: list[int] = Field(default_factory=list)
    model: str | None = None

    @property
    def match_type(self) -> Literal["provider", "ai_generated"]:
        """Whether the answer leans on a vetted listing or stands on its own."""
        return "provider" if self.result.referenced_provider_ids else "ai_generated"

    def as_text(self) -> str:
        """Flatten to the plain-text body used in email and the dashboard."""
        parts = [self.result.summary.strip()]

        if self.result.steps:
            parts.append("")
            parts.append("What to do:")
            for i, step in enumerate(self.result.steps, start=1):
                line = f"{i}. {step.action.strip()}"
                if step.detail:
                    line += f" {step.detail.strip()}"
                parts.append(line)

        if self.result.caveats:
            parts.append("")
            parts.append("Worth knowing:")
            parts.extend(f"- {c.strip()}" for c in self.result.caveats)

        if self.result.estimated_cost:
            parts.append("")
            parts.append(f"Typical cost: {self.result.estimated_cost}")

        return "\n".join(parts).strip()
