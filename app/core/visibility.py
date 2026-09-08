"""What "publicly visible" means for a listing, in one place.

This rule was previously spelled out six times - in search, in the by-slug
detail route, in the reviews routes, in enquiry creation, in chat, and (in a
third form) in the category counts. They drifted, which is how the KYC gate
ended up applying to search results and not to the URL a search result links
to: a business could be excluded from every list and still be read in full by
anyone who had, or guessed, its slug.

So the definition lives here and nowhere else. Three gates, all of which must
pass:

    is_active   the owner's own pause switch
    status      moderation - a human read the listing and approved it
    KYC         verification - a human checked the business is real

Payment is deliberately NOT one of them. If it ever becomes one, this file is
the only place it goes, and it should be one obvious edit rather than a flag -
"pay to be findable" must not be something that can ship by accident.

Anything the public can reach that names a business record goes through here.
Owner and admin routes deliberately do not: an owner has to be able to see
their own listing while it waits for both decisions, or they cannot act on
either.
"""

from __future__ import annotations

from typing import Any, Sequence

from fastapi import HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.business import Business, BusinessStatus
from app.models.verification import BusinessVerification, VerificationStatus

#: Shown wherever a route documents why it 404s.
NOT_FOUND_DETAIL = "Listing not found"


def public_visibility_filters() -> list[Any]:
    """Predicates for a publicly visible listing.

    The verification clause needs business_verifications joined - see
    `join_verification` - because a listing that has never submitted KYC has no
    row to test. An outer join would let it through on NULL, which is exactly
    the bug this module exists to prevent.
    """
    return [
        Business.is_active.is_(True),
        Business.status == BusinessStatus.approved,
        BusinessVerification.status == VerificationStatus.verified,
    ]


def join_verification(stmt: Select) -> Select:
    """INNER JOIN business_verifications. No KYC row means no listing."""
    return stmt.join(
        BusinessVerification, BusinessVerification.business_id == Business.id
    )


def visible_businesses(*columns: Any) -> Select:
    """A SELECT over publicly visible listings.

    Pass columns to shape the projection; the default selects Business rows.
    Callers add their own joins and filters on top.
    """
    stmt = select(*(columns or (Business,)))
    return join_verification(stmt).where(*public_visibility_filters())


def is_publicly_visible(db: Session, business: Business | None) -> bool:
    """Row-level equivalent of the filters above, for an already-loaded row."""
    if business is None:
        return False
    if not business.is_active or business.status is not BusinessStatus.approved:
        return False

    verification_status = db.scalar(
        select(BusinessVerification.status).where(
            BusinessVerification.business_id == business.id
        )
    )
    return verification_status is VerificationStatus.verified


def require_visible_business(db: Session, business_id: int) -> Business:
    """Load a listing the public may read, or 404.

    404 and not 403: whether a particular id exists, and whether it is pending
    moderation or failed KYC, is not the public's business. Every failure looks
    the same from outside.
    """
    business = db.get(Business, business_id)
    if not is_publicly_visible(db, business):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_DETAIL
        )
    assert business is not None  # narrowed by is_publicly_visible
    return business


def require_visible_business_by_slug(db: Session, slug: str) -> Business:
    """Same, addressed by slug - the public detail page's entry point."""
    business = db.scalar(
        visible_businesses().where(Business.slug == slug)
    )
    if business is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_DETAIL
        )
    return business


__all__: Sequence[str] = (
    "NOT_FOUND_DETAIL",
    "is_publicly_visible",
    "join_verification",
    "public_visibility_filters",
    "require_visible_business",
    "require_visible_business_by_slug",
    "visible_businesses",
)
