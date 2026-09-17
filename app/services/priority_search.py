"""Search with paid placement (spec: PrioritySearchService).

    get_nearby_services_with_priority()   the whole search, one SQL statement
      group_by_tier()                     ORDER BY tier: Annual, Monthly, Basic, none
      apply_rotation_logic()              ORDER BY this half hour's Monthly leaders
      sort_within_tier()                  ORDER BY rating, distance, age (or the chosen sort)

The spec describes fetching every provider in the radius and grouping, rotating
and sorting them in application code. That is done in the database instead, as
ORDER BY terms of one statement: an in-memory version has to load every match
to return one page, which is slower (benchmarked in scripts/bench_search.py) and
makes page 2 depend on a list the server no longer holds. The rules themselves
- what a tier is, how the rotation turns - live in app/services/placement.py.

Edge cases, all by construction rather than special-casing:
  - no Annual subscribers: the tier is simply empty, Monthly leads
  - one to three Monthly subscribers: all of them are in the rotation's front
    three every window, so nothing visibly rotates
  - equal rating and distance: the older listing first, then the lower id
  - nothing in range: an empty result; the caller widens or suggests areas
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import Float, String, and_, asc, case, desc, func, null, or_, select
from sqlalchemy.orm import Session

from app.core.visibility import join_verification, public_visibility_filters
from app.models.business import Business
from app.models.category import Category
from app.schemas.directory import BusinessListItem, BusinessSort
from app.services import placement

EARTH_RADIUS_KM = 6371.0088

# One degree of latitude is ~111 km everywhere; longitude shrinks with latitude.
KM_PER_DEG_LAT = 110.574
KM_PER_DEG_LNG = 111.320


def _distance_km(lat: float, lng: float):
    """Great-circle distance from (lat, lng) to each row, in kilometres.

    Rounding can push the cosine term a hair outside [-1, 1], and acos() of
    1.0000000001 is a domain error in Postgres, so the argument is clamped.
    """
    cos_term = (
        func.cos(func.radians(lat))
        * func.cos(func.radians(Business.latitude))
        * func.cos(func.radians(Business.longitude) - func.radians(lng))
        + func.sin(func.radians(lat)) * func.sin(func.radians(Business.latitude))
    )
    clamped = func.least(1.0, func.greatest(-1.0, cos_term))
    return (EARTH_RADIUS_KM * func.acos(clamped)).cast(Float)


def _escape_like(value: str) -> str:
    """Neutralise LIKE wildcards so a literal % or _ cannot widen the search."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@dataclass(frozen=True)
class SearchFilters:
    q: str | None = None
    category_slug: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    radius_km: float | None = None
    min_rating: float | None = None
    sort: BusinessSort = BusinessSort.relevance
    page: int = 1
    page_size: int = 20

    @property
    def has_point(self) -> bool:
        return self.lat is not None and self.lng is not None


@dataclass(frozen=True)
class PrioritySearchResult:
    items: list[BusinessListItem]
    total: int
    # The instant the ordering was computed for - which rotation window.
    moment: datetime


def group_by_tier(r: Any) -> list[Any]:
    """ORDER BY term: Annual (1), Monthly (2), Basic (3), no plan (4)."""
    return [asc(r.tier)]


def apply_rotation_logic(spotlight: Any) -> list[Any]:
    """ORDER BY term: inside Monthly, this half hour's three leaders first.

    `spotlight` is 0 for a leader and 1 otherwise; see
    placement.in_rotation_spotlight for how the three are chosen.
    """
    return [asc(spotlight)]


def sort_within_tier(r: Any, sort: BusinessSort, has_point: bool) -> list[Any]:
    """ORDER BY terms inside a tier (spec: sortByRatingAndDistance).

    Relevance - the default, and what "near me" uses - is rating, then
    distance, then the oldest listing first, so equal listings keep a stable
    order. An explicit sort replaces it inside each tier.
    """
    # NULLS LAST wherever rating is ordered on: in Postgres a DESC sort puts
    # NULLs first, which would lead the list with unrated listings.
    if sort is BusinessSort.rating:
        order = [desc(r.rating).nulls_last(), desc(r.review_count)]
    elif sort is BusinessSort.reviews:
        order = [desc(r.review_count), desc(r.rating).nulls_last()]
    elif sort is BusinessSort.distance:
        order = [asc(r.distance_km)]
    elif sort is BusinessSort.name:
        order = [asc(r.name)]
    elif sort is BusinessSort.newest:
        order = [desc(r.created_at)]
    else:
        # Relevance, within a tier: best rated first, then the closest when the
        # search has a point, then the longest-listed.
        order = [desc(r.rating).nulls_last()]
        if has_point:
            order.append(asc(r.distance_km))
        order.append(asc(r.created_at))
    return order


def get_nearby_services_with_priority(
    db: Session, filters: SearchFilters
) -> PrioritySearchResult:
    """Run a search, ordered by placement, and return one page of it."""
    q, category_slug, city = filters.q, filters.category_slug, filters.city
    lat, lng, radius_km = filters.lat, filters.lng, filters.radius_km
    min_rating, sort = filters.min_rating, filters.sort
    page, page_size = filters.page, filters.page_size
    has_point = filters.has_point

    distance = _distance_km(lat, lng) if has_point else None

    # active + approved + KYC-verified, defined once in app/core/visibility.py
    # and applied identically by every public route. The KYC clause needs the
    # join below: a listing that never submitted KYC has no row to test, and an
    # outer join would let it through on NULL.
    filters = list(public_visibility_filters())

    needle = _escape_like(q.strip()) if q else ""
    if needle:
        pattern = f"%{needle}%"
        filters.append(
            or_(
                Business.name.ilike(pattern, escape="\\"),
                Business.description.ilike(pattern, escape="\\"),
                Business.city.ilike(pattern, escape="\\"),
                Category.name.ilike(pattern, escape="\\"),
            )
        )

    if category_slug:
        filters.append(Category.slug == category_slug)
    if city:
        filters.append(func.lower(Business.city) == city.strip().lower())
    if min_rating is not None:
        # NULL rating means "unrated", which must not satisfy a minimum.
        filters.append(Business.rating.is_not(None))
        filters.append(Business.rating >= min_rating)

    if has_point:
        # Rows without coordinates cannot participate in a proximity search.
        filters.append(Business.latitude.is_not(None))
        filters.append(Business.longitude.is_not(None))
        if radius_km is not None:
            # Cheap bounding box first, so the lat/lng index can discard most
            # rows before the trigonometry runs on the survivors.
            dlat = radius_km / KM_PER_DEG_LAT
            dlng = radius_km / (
                KM_PER_DEG_LNG * max(math.cos(math.radians(lat)), 1e-6)
            )
            filters.append(Business.latitude.between(lat - dlat, lat + dlat))
            filters.append(Business.longitude.between(lng - dlng, lng + dlng))
            filters.append(distance <= radius_km)

    where = and_(*filters)

    # ---- one statement: filter once, tier, rank, count, page ----------------
    #
    #   matched  every listing this search matches, with its distance and its
    #            plan tier (looked up per listing through the subscriptions
    #            index, not by aggregating every subscription in the table)
    #   ranked   window functions over `matched`: the rotation order inside each
    #            tier, each tier's size and first position, and the total
    #   outer    tier, this half hour's Monthly rotation, the requested sort,
    #            then one page
    #
    # The total rides along as count(*) OVER (), so there is no second query
    # to count - except for a page past the end, which returns no rows to carry
    # it (see below).
    moment = placement.now_utc()
    tier = placement.tier_for(Business.id, moment)

    matched = (
        join_verification(
            select(
                Business.id,
                Business.name,
                Business.slug,
                Business.description,
                Business.address,
                Business.city,
                Business.province,
                Business.postal_code,
                Business.latitude,
                Business.longitude,
                Business.phone,
                Business.website,
                Business.rating,
                Business.review_count,
                Business.verified,
                Business.created_at,
                Category.slug.label("category_slug"),
                Category.name.label("category_name"),
                (distance if has_point else null().cast(Float)).label("distance_km"),
                tier.label("tier"),
            ).join(Category, Category.id == Business.category_id)
        )
        .where(where)
        .subquery("matched")
    )
    m = matched.c

    ranked = select(
        matched,
        # A fixed pseudo-random order per tier (a hash of the id), so the
        # Monthly rotation is fair among the subscribers actually in these
        # results, and nobody is first just for being oldest.
        func.row_number()
        .over(partition_by=m.tier, order_by=func.md5(func.cast(m.id, String)))
        .label("base_rank"),
        func.count().over(partition_by=m.tier).label("group_size"),
        # rank() over tier = 1 + the number of matches in better tiers, i.e. the
        # overall position of the first row of this tier.
        func.rank().over(order_by=m.tier).label("tier_start"),
        func.count().over().label("total_matches"),
    ).subquery("ranked")
    r = ranked.c

    spotlight = case(
        (
            and_(
                r.tier == placement.Tier.monthly.value,
                placement.in_rotation_spotlight(
                    r.base_rank, r.group_size, placement.rotation_offset(moment)
                ),
            ),
            0,
        ),
        else_=1,
    )

    order = sort_within_tier(r, sort, has_point)

    # Tier leads every sort; inside Monthly, this window's rotation leads.
    # Deterministic tiebreak last: without it, equal-ranked rows can repeat on
    # one page and vanish from another.
    order = [*group_by_tier(r), *apply_rotation_logic(spotlight), *order, asc(r.id)]

    offset = (page - 1) * page_size
    rows = db.execute(
        select(ranked, spotlight.label("spotlight"))
        .order_by(*order)
        .offset(offset)
        .limit(page_size)
    ).mappings().all()

    if rows:
        total = rows[0]["total_matches"]
    elif page == 1:
        total = 0
    else:
        # Past the last page: no row came back to carry the total.
        total = (
            db.scalar(
                join_verification(
                    select(func.count(Business.id))
                    .select_from(Business)
                    .join(Category, Category.id == Business.category_id)
                )
                .where(where)
            )
            or 0
        )

    items: list[BusinessListItem] = []
    for index, row in enumerate(rows):
        position = offset + index + 1
        items.append(
            BusinessListItem(
                id=row["id"],
                name=row["name"],
                slug=row["slug"],
                category_slug=row["category_slug"],
                category_name=row["category_name"],
                description=row["description"],
                address=row["address"],
                city=row["city"],
                province=row["province"],
                postal_code=row["postal_code"],
                latitude=row["latitude"],
                longitude=row["longitude"],
                phone=row["phone"],
                website=row["website"],
                rating=row["rating"],
                review_count=row["review_count"],
                verified=row["verified"],
                distance_km=round(row["distance_km"], 2) if has_point else None,
                position=position,
                in_rotation=row["spotlight"] == 0,
                **placement.label(row["tier"]),
                display_reason=placement.explain(
                    tier_value=row["tier"],
                    in_rotation=row["spotlight"] == 0,
                    position_in_tier=position - row["tier_start"] + 1,
                    tier_size=row["group_size"],
                    sort=sort.value,
                    has_point=has_point,
                ),
            )
        )

    return PrioritySearchResult(items=items, total=total, moment=moment)
