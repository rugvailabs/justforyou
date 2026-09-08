"""Extraction: schema contract, error routing, and a golden set.

Three layers, deliberately separated:

  * mapping tests stub `llm.parse` so the model-response -> ExtractedProblem
    translation is checked without a network call or a bill;
  * the golden set runs the real classifier and is the regression baseline for
    prompt changes;
  * one live test actually calls Claude, and skips when no key is configured.
"""

from __future__ import annotations

import pytest

from app.core.config import get_settings
from app.services import extraction, llm
from app.services.extraction import ExtractionResult
from app.services.llm import LLMTransient, LLMUnavailable

# Requests shaped like the ones customers actually send, with the category a
# reviewer would assign. Both classifiers are held to this.
GOLDEN: list[tuple[str, str]] = [
    ("I need a mobile service center near me, my phone screen is cracked", "mobile repair"),
    ("My kitchen sink has been leaking under the cabinet for two days", "plumbing"),
    ("The breaker keeps tripping whenever I run the microwave", "electrical"),
    ("I need a lawyer to look over my apartment lease before I sign", "legal"),
    ("My laptop won't connect to the wifi since the update", "it support"),
    ("The dryer stopped heating halfway through a load", "appliance repair"),
    ("My car is making a grinding noise when I brake", "automotive"),
    ("I'm relocating to a new apartment and need movers on the 30th", "moving"),
    ("Looking for someone to deep clean my apartment before I move out", "cleaning"),
]


def _stub_parse(monkeypatch, result: ExtractionResult) -> None:
    monkeypatch.setattr(llm, "is_configured", lambda: True)
    monkeypatch.setattr(extraction.llm, "is_configured", lambda: True)
    monkeypatch.setattr(extraction.llm, "parse", lambda **_kw: result)


def _result(**overrides) -> ExtractionResult:
    base = dict(
        category="plumbing",
        problem_summary="The kitchen sink is leaking.",
        urgency="medium",
        location="Toronto, Ontario",
        budget=None,
        language="en",
        missing_information=[],
        is_ambiguous=False,
        is_out_of_scope=False,
    )
    base.update(overrides)
    return ExtractionResult(**base)


# --------------------------------------------------------------------------
# schema contract
# --------------------------------------------------------------------------
def test_category_enum_matches_the_taxonomy() -> None:
    """The response schema and the matching taxonomy must not drift apart.

    If they do, matching filters on a category the model can never produce and
    every request silently falls through to the no-provider path.
    """
    from typing import get_args

    assert set(get_args(extraction.Category)) == set(extraction.TAXONOMY)


def test_model_fields_reach_the_result(monkeypatch) -> None:
    _stub_parse(monkeypatch, _result(urgency="high", budget="under $200"))

    problem = extraction.extract_problem("My sink is flooding the kitchen")

    assert problem.category == "plumbing"
    assert problem.urgency == "high"
    assert problem.location == "Toronto, Ontario"
    assert problem.budget == "under $200"
    assert problem.raw_json["extractor"] == "claude"
    assert problem.raw_json["trusted"] is True


def test_ambiguity_and_scope_are_carried_forward(monkeypatch) -> None:
    """The confidence gate reads these; losing them would silently disarm it."""
    _stub_parse(
        monkeypatch,
        _result(
            is_ambiguous=True,
            is_out_of_scope=True,
            missing_information=["which appliance", "whether it is under warranty"],
        ),
    )

    problem = extraction.extract_problem("something is broken")

    assert problem.raw_json["is_ambiguous"] is True
    assert problem.raw_json["is_out_of_scope"] is True
    assert problem.raw_json["missing_information"] == [
        "which appliance",
        "whether it is under warranty",
    ]


def test_sensitive_category_is_flagged(monkeypatch) -> None:
    _stub_parse(monkeypatch, _result(category="legal"))

    problem = extraction.extract_problem("I need help with a lease dispute")

    assert problem.raw_json["sensitive_category"] is True


def test_non_sensitive_category_is_not_flagged(monkeypatch) -> None:
    _stub_parse(monkeypatch, _result(category="plumbing"))

    assert extraction.extract_problem("leaking sink").raw_json["sensitive_category"] is False


# --------------------------------------------------------------------------
# error routing
# --------------------------------------------------------------------------
def test_missing_key_without_fallback_raises(monkeypatch) -> None:
    monkeypatch.setattr(extraction.llm, "is_configured", lambda: False)
    monkeypatch.setattr(get_settings(), "llm_fallback_to_keywords", False, raising=False)

    with pytest.raises(LLMUnavailable):
        extraction.extract_problem("My sink is leaking")


def test_missing_key_with_fallback_marks_output_untrusted(monkeypatch) -> None:
    """The dev fallback must never be mistaken for a real classification."""
    monkeypatch.setattr(extraction.llm, "is_configured", lambda: False)
    monkeypatch.setattr(get_settings(), "llm_fallback_to_keywords", True, raising=False)

    problem = extraction.extract_problem("My kitchen sink is leaking badly")

    assert problem.raw_json["extractor"] == "keyword-fallback"
    assert problem.raw_json["trusted"] is False
    assert problem.raw_json["llm"] is False


def test_transient_errors_propagate(monkeypatch) -> None:
    """A rate limit must reach the task so it retries, not be swallowed."""
    monkeypatch.setattr(extraction.llm, "is_configured", lambda: True)

    def _boom(**_kw):
        raise LLMTransient("rate limited")

    monkeypatch.setattr(extraction.llm, "parse", _boom)

    with pytest.raises(LLMTransient):
        extraction.extract_problem("My sink is leaking")


def test_out_of_taxonomy_category_is_coerced(monkeypatch) -> None:
    """Belt and braces: the schema constrains this, but drift must not pass."""
    rogue = _result()
    object.__setattr__(rogue, "category", "underwater basket weaving")
    _stub_parse(monkeypatch, rogue)

    assert extraction.extract_problem("anything").category == "other"


# --------------------------------------------------------------------------
# golden set - the regression baseline
# --------------------------------------------------------------------------
#: Golden cases the keyword fallback is known to get wrong. Each one needs
#: real comprehension: "deep clean my apartment before I move out" contains
#: both "clean" and "move", and a word-count classifier cannot tell which is
#: the request. Kept explicit so the list can only shrink, never silently grow.
FALLBACK_KNOWN_MISSES: frozenset[str] = frozenset({"cleaning"})


@pytest.mark.skipif(not llm.is_configured(), reason="no ANTHROPIC_API_KEY configured")
@pytest.mark.parametrize(("text", "expected"), GOLDEN, ids=[c for _, c in GOLDEN])
def test_golden_set(text: str, expected: str) -> None:
    """The real classifier is held to every case, with no exemptions."""
    assert extraction.extract_problem(text).category == expected


def test_keyword_fallback_baseline() -> None:
    """The dev fallback has a floor, and its failures are named not hidden.

    This is not the product's accuracy bar - it is a regression guard on the
    stand-in, so a change to the keyword lists cannot quietly make local
    development worse.
    """
    if llm.is_configured():
        pytest.skip("a real key is configured; test_golden_set covers this")

    misses = {
        expected
        for text, expected in GOLDEN
        if extraction.extract_problem(text).category != expected
    }

    assert misses == FALLBACK_KNOWN_MISSES, (
        f"keyword fallback accuracy changed: unexpected misses "
        f"{misses - FALLBACK_KNOWN_MISSES}, newly passing "
        f"{FALLBACK_KNOWN_MISSES - misses}"
    )


def test_every_golden_category_is_in_the_taxonomy() -> None:
    assert {c for _, c in GOLDEN} <= set(extraction.TAXONOMY)


# --------------------------------------------------------------------------
# live model - skipped without credentials
# --------------------------------------------------------------------------
@pytest.mark.skipif(
    not llm.is_configured(), reason="no ANTHROPIC_API_KEY configured"
)
def test_live_extraction_understands_an_indirect_request() -> None:
    """The case the keyword classifier cannot do: no category word appears."""
    problem = extraction.extract_problem(
        "There's water pooling under the cabinet and the floor is going soft. "
        "I'm in Toronto and it's getting worse by the hour."
    )

    assert problem.category == "plumbing"
    assert problem.urgency == "high"
    assert problem.location and "Toronto" in problem.location
    assert problem.raw_json["trusted"] is True
