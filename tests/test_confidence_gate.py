"""The confidence gate.

This is the suite that protects the product's central promise. Every test here
asks the same question from a different angle: can something the customer
should not receive get past?
"""

from __future__ import annotations

import pytest

from app.core.config import get_settings
from app.schemas.service_results import ExtractedProblem
from app.schemas.solution import Solution, SolutionResult, SolutionStep
from app.services import quality
from app.services.quality import Judgement

GOOD_SUMMARY = (
    "Your screen can be replaced the same day at a shop near you, and the "
    "part is usually in stock."
)


def _problem(**overrides) -> ExtractedProblem:
    raw = {
        "trusted": True,
        "extractor": "claude",
        "is_ambiguous": False,
        "is_out_of_scope": False,
        "sensitive_category": False,
        "missing_information": [],
        "language": "en",
    }
    raw.update(overrides.pop("raw_json", {}))
    base = dict(
        category="mobile repair",
        problem_summary="Cracked phone screen, needs replacing.",
        urgency="medium",
        location="Toronto, Ontario",
        budget=None,
        raw_json=raw,
    )
    base.update(overrides)
    return ExtractedProblem(**base)


def _solution(**overrides) -> Solution:
    result_kw = dict(
        summary=GOOD_SUMMARY,
        steps=[SolutionStep(action="Call the shop", detail="Ask for a quote.")],
        caveats=["Back up your phone first."],
        referenced_provider_ids=[6],
        estimated_cost="$120-$260",
        requires_professional=True,
        self_assessment="Directly answers the request.",
        language="en",
    )
    result_kw.update(overrides.pop("result", {}))
    base = dict(
        result=SolutionResult(**result_kw),
        generator="claude",
        trusted=True,
        candidate_provider_ids=[6, 7],
        model="claude-opus-5",
    )
    base.update(overrides)
    return Solution(**base)


def _verdict(**overrides) -> Judgement:
    base = dict(
        answers_the_question=True,
        is_actionable=True,
        is_grounded=True,
        nothing_invented=True,
        in_scope=True,
        confidence=0.95,
        reasoning="Specific and actionable.",
    )
    base.update(overrides)
    return Judgement(**base)


def _with_judge(monkeypatch, verdict: Judgement) -> None:
    monkeypatch.setattr(quality.llm, "is_configured", lambda: True)
    monkeypatch.setattr(quality, "_judge", lambda *a, **k: verdict)


# --------------------------------------------------------------------------
# the one case that may pass
# --------------------------------------------------------------------------
def test_a_good_answer_passes(monkeypatch) -> None:
    _with_judge(monkeypatch, _verdict())

    decision = quality.evaluate(_solution(), _problem())

    assert decision.passed is True
    assert decision.confidence == pytest.approx(0.95)
    assert decision.reasons == []


# --------------------------------------------------------------------------
# deterministic checks - disqualifying on their own
# --------------------------------------------------------------------------
def test_untrusted_generator_is_held(monkeypatch) -> None:
    """A template fallback must never reach a customer."""
    _with_judge(monkeypatch, _verdict(confidence=1.0))

    decision = quality.evaluate(
        _solution(generator="template-fallback", trusted=False), _problem()
    )

    assert decision.passed is False
    assert any("untrusted path" in r for r in decision.reasons)


def test_untrusted_extraction_is_held(monkeypatch) -> None:
    """If we did not really understand the request, we cannot answer it."""
    _with_judge(monkeypatch, _verdict(confidence=1.0))

    decision = quality.evaluate(
        _solution(), _problem(raw_json={"trusted": False, "extractor": "keyword-fallback"})
    )

    assert decision.passed is False


def test_invented_citation_is_held(monkeypatch) -> None:
    """The grounding check: a provider we never supplied is disqualifying."""
    _with_judge(monkeypatch, _verdict(confidence=1.0))

    decision = quality.evaluate(
        _solution(result={"referenced_provider_ids": [6, 999]}), _problem()
    )

    assert decision.passed is False
    assert any("never supplied" in r for r in decision.reasons)


def test_ambiguous_request_is_held(monkeypatch) -> None:
    _with_judge(monkeypatch, _verdict(confidence=1.0))

    decision = quality.evaluate(_solution(), _problem(raw_json={"is_ambiguous": True}))

    assert decision.passed is False
    assert any("too vague" in r for r in decision.reasons)


def test_out_of_scope_request_is_held(monkeypatch) -> None:
    _with_judge(monkeypatch, _verdict(confidence=1.0))

    decision = quality.evaluate(_solution(), _problem(raw_json={"is_out_of_scope": True}))

    assert decision.passed is False


def test_sensitive_category_is_held(monkeypatch) -> None:
    """Legal advice never goes out automatically, however confident we are."""
    _with_judge(monkeypatch, _verdict(confidence=1.0))

    decision = quality.evaluate(
        _solution(), _problem(category="legal", raw_json={"sensitive_category": True})
    )

    assert decision.passed is False
    assert any("licensed professional" in r for r in decision.reasons)


def test_missing_information_is_held(monkeypatch) -> None:
    _with_judge(monkeypatch, _verdict(confidence=1.0))

    decision = quality.evaluate(
        _solution(), _problem(raw_json={"missing_information": ["which model of phone"]})
    )

    assert decision.passed is False


@pytest.mark.parametrize(
    "text",
    [
        "Lorem ipsum dolor sit amet, this is placeholder copy for the answer.",
        "[insert provider name here] can help you with this particular problem.",
        "As an AI, I cannot help with this request about your broken phone screen.",
        "This response was generated without our full system available, sorry.",
    ],
)
def test_placeholder_and_refusal_text_is_held(monkeypatch, text: str) -> None:
    _with_judge(monkeypatch, _verdict(confidence=1.0))

    decision = quality.evaluate(_solution(result={"summary": text}), _problem())

    assert decision.passed is False


def test_too_short_an_answer_is_held(monkeypatch) -> None:
    _with_judge(monkeypatch, _verdict(confidence=1.0))

    decision = quality.evaluate(_solution(result={"summary": "Call someone."}), _problem())

    assert decision.passed is False


def test_no_steps_and_no_professional_is_held(monkeypatch) -> None:
    _with_judge(monkeypatch, _verdict(confidence=1.0))

    decision = quality.evaluate(
        _solution(result={"steps": [], "requires_professional": False}), _problem()
    )

    assert decision.passed is False
    assert any("no steps" in r for r in decision.reasons)


def test_deterministic_failure_skips_the_judge(monkeypatch) -> None:
    """No point paying for a verdict that cannot change the outcome."""
    called: list[int] = []

    monkeypatch.setattr(quality.llm, "is_configured", lambda: True)
    monkeypatch.setattr(
        quality, "_judge", lambda *a, **k: called.append(1) or _verdict()
    )

    quality.evaluate(_solution(trusted=False), _problem())

    assert called == []


# --------------------------------------------------------------------------
# the judge
# --------------------------------------------------------------------------
@pytest.mark.parametrize(
    "criterion",
    [
        "answers_the_question",
        "is_actionable",
        "is_grounded",
        "nothing_invented",
        "in_scope",
    ],
)
def test_any_failed_criterion_holds(monkeypatch, criterion: str) -> None:
    _with_judge(monkeypatch, _verdict(**{criterion: False}))

    decision = quality.evaluate(_solution(), _problem())

    assert decision.passed is False
    assert any(criterion.replace("_", " ") in r for r in decision.reasons)


def test_confidence_below_threshold_holds(monkeypatch) -> None:
    threshold = get_settings().gate_confidence_threshold
    _with_judge(monkeypatch, _verdict(confidence=threshold - 0.01))

    decision = quality.evaluate(_solution(), _problem())

    assert decision.passed is False
    assert any("below the" in r for r in decision.reasons)


def test_confidence_at_threshold_passes(monkeypatch) -> None:
    threshold = get_settings().gate_confidence_threshold
    _with_judge(monkeypatch, _verdict(confidence=threshold))

    assert quality.evaluate(_solution(), _problem()).passed is True


# --------------------------------------------------------------------------
# fail closed
# --------------------------------------------------------------------------
def test_no_judge_available_holds(monkeypatch) -> None:
    """A gate that waves things through when it cannot think is worse than none."""
    monkeypatch.setattr(quality.llm, "is_configured", lambda: False)

    decision = quality.evaluate(_solution(), _problem())

    assert decision.passed is False
    assert decision.judge_unavailable is True
    assert decision.reason_code == "gate_unavailable"


def test_judge_crash_holds(monkeypatch) -> None:
    monkeypatch.setattr(quality.llm, "is_configured", lambda: True)

    def _boom(*_a, **_k):
        raise RuntimeError("model exploded")

    monkeypatch.setattr(quality, "_judge", _boom)

    decision = quality.evaluate(_solution(), _problem())

    assert decision.passed is False
    assert decision.judge_unavailable is True


def test_there_is_no_bypass_switch() -> None:
    """A 'skip the gate' setting is the one thing that must not exist."""
    fields = set(get_settings().model_dump().keys())
    for forbidden in ("gate_enabled", "gate_bypass", "skip_gate", "gate_disabled"):
        assert forbidden not in fields


# --------------------------------------------------------------------------
# storage
# --------------------------------------------------------------------------
def test_decision_is_storable(monkeypatch) -> None:
    _with_judge(monkeypatch, _verdict(confidence=0.42))

    stored = quality.as_storage_json(quality.evaluate(_solution(), _problem()))

    assert stored["passed"] is False
    assert stored["confidence"] == pytest.approx(0.42)
    assert stored["reason_code"] == "gate_low_confidence"
    assert isinstance(stored["checks"], dict)
    assert stored["judge_reasoning"]
