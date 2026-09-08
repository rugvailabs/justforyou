"""Solution generation: grounding, degradation, and the flattened output."""

from __future__ import annotations

import pytest

from app.core.config import get_settings
from app.models.provider import Provider
from app.schemas.service_results import ExtractedProblem
from app.schemas.solution import SolutionResult, SolutionStep
from app.services import llm, solving
from app.services.llm import LLMTransient, LLMUnavailable


def _providers() -> list[Provider]:
    a = Provider(
        name="GTA Mobile Repair Centre",
        category="mobile repair",
        region="Ontario",
        contact_email="service@gta.example.ca",
        contact_phone="+1-416-555-0311",
        verified=True,
    )
    b = Provider(
        name="Reparation Mobile Montreal",
        category="mobile repair",
        region="Quebec",
        contact_email="info@rm.example.ca",
        contact_phone="+1-514-555-0244",
        verified=True,
    )
    # These are never persisted here; ids stand in for real rows.
    a.id, b.id = 6, 7
    return [a, b]


def _problem(**overrides) -> ExtractedProblem:
    base = dict(
        category="mobile repair",
        problem_summary="Cracked phone screen.",
        urgency="medium",
        location="Toronto, Ontario",
        budget=None,
        raw_json={"language": "en", "missing_information": []},
    )
    base.update(overrides)
    return ExtractedProblem(**base)


def _result(**overrides) -> SolutionResult:
    base = dict(
        summary="Your screen can be replaced same day.",
        steps=[SolutionStep(action="Call the shop", detail="Ask for a quote.")],
        caveats=["Back up your phone first."],
        referenced_provider_ids=[6],
        estimated_cost="$120-$260",
        requires_professional=True,
        self_assessment="Directly answers the request; assumed a modern handset.",
        language="en",
    )
    base.update(overrides)
    return SolutionResult(**base)


def _use_model(monkeypatch, result: SolutionResult) -> None:
    monkeypatch.setattr(solving.llm, "is_configured", lambda: True)
    monkeypatch.setattr(solving.llm, "parse", lambda **_kw: result)


# --------------------------------------------------------------------------
# the generated answer
# --------------------------------------------------------------------------
def test_solution_carries_structure_and_provenance(monkeypatch) -> None:
    _use_model(monkeypatch, _result())

    solution = solving.generate_solution(_problem(), _providers())

    assert solution.generator == "claude"
    assert solution.trusted is True
    assert solution.match_type == "provider"
    assert solution.candidate_provider_ids == [6, 7]
    assert solution.result.estimated_cost == "$120-$260"


def test_answer_without_a_provider_is_ai_generated(monkeypatch) -> None:
    _use_model(monkeypatch, _result(referenced_provider_ids=[]))

    solution = solving.generate_solution(_problem(), [])

    assert solution.match_type == "ai_generated"


def test_as_text_flattens_steps_and_caveats(monkeypatch) -> None:
    _use_model(monkeypatch, _result())

    text = solving.generate_solution(_problem(), _providers()).as_text()

    assert "Your screen can be replaced same day." in text
    assert "1. Call the shop Ask for a quote." in text
    assert "Back up your phone first." in text
    assert "Typical cost: $120-$260" in text


# --------------------------------------------------------------------------
# grounding - the check the whole design rests on
# --------------------------------------------------------------------------
def test_invented_provider_ids_are_stripped(monkeypatch) -> None:
    """A citation the model was not given must never reach the customer."""
    _use_model(monkeypatch, _result(referenced_provider_ids=[6, 999]))

    solution = solving.generate_solution(_problem(), _providers())

    assert solution.result.referenced_provider_ids == [6]
    # And the answer is no longer trusted, because the model broke a hard rule.
    assert solution.trusted is False


def test_wholly_invented_citations_leave_no_provider(monkeypatch) -> None:
    _use_model(monkeypatch, _result(referenced_provider_ids=[404, 999]))

    solution = solving.generate_solution(_problem(), _providers())

    assert solution.result.referenced_provider_ids == []
    assert solution.trusted is False
    assert solution.match_type == "ai_generated"


def test_empty_candidate_list_allows_no_citations(monkeypatch) -> None:
    _use_model(monkeypatch, _result(referenced_provider_ids=[6]))

    solution = solving.generate_solution(_problem(), [])

    assert solution.result.referenced_provider_ids == []
    assert solution.trusted is False


# --------------------------------------------------------------------------
# degradation and error routing
# --------------------------------------------------------------------------
def test_template_fallback_is_untrusted(monkeypatch) -> None:
    monkeypatch.setattr(solving.llm, "is_configured", lambda: False)
    monkeypatch.setattr(get_settings(), "llm_fallback_to_keywords", True, raising=False)

    solution = solving.generate_solution(_problem(), _providers())

    assert solution.generator == "template-fallback"
    assert solution.trusted is False
    assert solution.model is None
    # It still names the provider it was given - it just may not be sent unreviewed.
    assert solution.result.referenced_provider_ids == [6]


def test_no_key_and_no_fallback_raises(monkeypatch) -> None:
    monkeypatch.setattr(solving.llm, "is_configured", lambda: False)
    monkeypatch.setattr(get_settings(), "llm_fallback_to_keywords", False, raising=False)

    with pytest.raises(LLMUnavailable):
        solving.generate_solution(_problem(), _providers())


def test_transient_errors_propagate(monkeypatch) -> None:
    monkeypatch.setattr(solving.llm, "is_configured", lambda: True)

    def _boom(**_kw):
        raise LLMTransient("rate limited")

    monkeypatch.setattr(solving.llm, "parse", _boom)

    with pytest.raises(LLMTransient):
        solving.generate_solution(_problem(), _providers())


def test_storage_json_round_trips(monkeypatch) -> None:
    _use_model(monkeypatch, _result())

    stored = solving.to_storage_json(solving.generate_solution(_problem(), _providers()))

    assert stored["generator"] == "claude"
    assert stored["result"]["steps"][0]["action"] == "Call the shop"
    assert stored["result"]["self_assessment"]


# --------------------------------------------------------------------------
# prompt contract
# --------------------------------------------------------------------------
def test_candidates_are_rendered_with_ids(monkeypatch) -> None:
    """The model can only cite ids it can see, so they must be in the prompt."""
    captured: dict = {}

    monkeypatch.setattr(solving.llm, "is_configured", lambda: True)

    def _capture(**kw):
        captured.update(kw)
        return _result()

    monkeypatch.setattr(solving.llm, "parse", _capture)
    solving.generate_solution(_problem(), _providers())

    assert "id=6" in captured["user"]
    assert "GTA Mobile Repair Centre" in captured["user"]
    assert "+1-416-555-0311" in captured["user"]


def test_empty_candidates_are_stated_explicitly(monkeypatch) -> None:
    captured: dict = {}
    monkeypatch.setattr(solving.llm, "is_configured", lambda: True)

    def _capture(**kw):
        captured.update(kw)
        return _result(referenced_provider_ids=[])

    monkeypatch.setattr(solving.llm, "parse", _capture)
    solving.generate_solution(_problem(), [])

    assert "no verified providers" in captured["user"]


def test_system_prompt_forbids_invention() -> None:
    """Guard the rule the grounding check depends on."""
    assert "Never invent a business" in solving.SYSTEM_PROMPT
    assert "legal, medical or financial advice" in solving.SYSTEM_PROMPT
