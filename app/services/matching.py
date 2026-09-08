"""Provider retrieval.

Supplies candidates to the solver. find_solution() is kept for the direct
referral path and for tests; the pipeline goes through find_candidates().
"""

from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.provider import Provider
from app.schemas.service_results import ExtractedProblem, MatchResult

logger = logging.getLogger(__name__)


def _region_of(location: str | None) -> str | None:
    """Pull the province out of a 'City, Province' location string.

    Providers are listed by region, callers describe a city. Splitting on the
    comma is enough for the canonical strings extraction produces.
    """
    if not location:
        return None
    parts = [p.strip() for p in location.split(",") if p.strip()]
    return parts[-1] if parts else None


def find_candidates(
    db: Session, problem: ExtractedProblem, limit: int = 5
) -> list[Provider]:
    """Providers that could plausibly help, best first.

    Retrieval, not answering: the solver decides what to do with these, and may
    reference none of them. Returning a few candidates rather than one lets the
    model pick on fit, and gives the confidence gate an explicit allow-list to
    check citations against.

    Phase 5 of the roadmap adds pgvector similarity over provider descriptions
    on top of this exact-match pass.
    """
    region = _region_of(problem.location)
    category = problem.category.lower()

    stmt = (
        select(Provider)
        .where(func.lower(Provider.category) == category)
        .order_by(Provider.verified.desc(), Provider.id.asc())
    )
    if region:
        in_region = list(
            db.scalars(
                stmt.where(func.lower(Provider.region) == region.lower()).limit(limit)
            )
        )
        if in_region:
            return in_region
        logger.info(
            "matching: no provider in region %r, widening to category %r",
            region,
            problem.category,
        )

    return list(db.scalars(stmt.limit(limit)))


def find_solution(db: Session, problem: ExtractedProblem) -> MatchResult:
    """Find a provider for the problem, or generate guidance if none fits.

    Takes a Session because the lookup is a database query. The service still
    owns no transaction: it reads, and the caller persists whatever comes back.

    Today this is the first pass only - an exact category match, narrowed to
    the caller's region when one was extracted, preferring verified providers.
    A hit returns match_type="provider" with provider_id set, which is what
    makes the result safe to show the customer immediately. A miss falls back
    to generic guidance flagged for human review.

    Phase 5 will add pgvector similarity over provider descriptions, falling
    back to LLM-generated guidance:
      - The exact-match pass below stays as the cheap first filter.
      - Similarity handles "right category, wrong specialty"; it needs the
        pgvector extension and an embedding column added by migration.
      - Only when nothing clears the similarity threshold should the LLM write
        guidance, and that path keeps provider_id=None.

    Args:
        db: Session used for the provider lookup.
        problem: The structured problem to match against.

    Returns:
        MatchResult naming a provider, or carrying generated guidance.
    """
    region = _region_of(problem.location)

    stmt = select(Provider).where(
        func.lower(Provider.category) == problem.category.lower()
    )
    if region:
        stmt = stmt.where(func.lower(Provider.region) == region.lower())
    # Verified providers first, then oldest listing, so the choice is stable
    # across runs rather than whatever the planner returns first.
    stmt = stmt.order_by(Provider.verified.desc(), Provider.id.asc())

    provider = db.scalars(stmt).first()

    # A region filter that eliminates everyone is worse than no filter: fall
    # back to any verified provider in the category before giving up.
    if provider is None and region:
        provider = db.scalars(
            select(Provider)
            .where(func.lower(Provider.category) == problem.category.lower())
            .order_by(Provider.verified.desc(), Provider.id.asc())
        ).first()
        if provider is not None:
            logger.info(
                "matching: no provider in region %r, widened to category %r",
                region,
                problem.category,
            )

    if provider is not None:
        logger.info(
            "matching: category=%s region=%s -> provider %s (%s)",
            problem.category,
            region,
            provider.id,
            provider.name,
        )
        contact = provider.contact_phone or provider.contact_email
        return MatchResult(
            provider_id=provider.id,
            solution_text=(
                f"We found {provider.name}, a {provider.category} provider "
                f"in {provider.region}. Reach them at {contact}. "
                f"Mention what you told us: {problem.problem_summary}"
            ),
            match_type="provider",
            needs_human_review=False,
        )

    logger.info(
        "matching: no provider for category=%s region=%s, generating guidance",
        problem.category,
        region,
    )
    return MatchResult(
        provider_id=None,
        solution_text=(
            "We do not have a verified provider for this yet. A member of our "
            "team is looking into it and will get back to you with a "
            "recommendation."
        ),
        match_type="ai_generated",
        # No vetted provider means a person should check before this is final.
        needs_human_review=True,
    )
