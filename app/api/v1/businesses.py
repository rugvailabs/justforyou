"""Public business search for the directory."""

from __future__ import annotations

import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Float, and_, asc, case, desc, func, or_, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.business import Business, BusinessStatus
from app.models.category import Category
from app.schemas.directory import BusinessListItem, BusinessSort, SearchResponse

router = APIRouter(prefix="/businesses", tags=["directory"])

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


@router.get("/search", response_model=SearchResponse)
def search_businesses(
    q: str | None = Query(default=None, max_length=128, description="Free text"),
    category_slug: str | None = Query(default=None, max_length=128),
    city: str | None = Query(default=None, max_length=128),
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
    radius_km: float | None = Query(default=None, gt=0, le=500),
    min_rating: float | None = Query(default=None, ge=0, le=5),
    sort: BusinessSort = Query(default=BusinessSort.relevance),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
) -> SearchResponse:
    """Search active listings. Public - no authentication required."""
    has_point = lat is not None and lng is not None

    # Fail loudly rather than silently ignoring a geo filter the caller meant.
    if (lat is None) != (lng is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="lat and lng must be supplied together.",
        )
    if radius_km is not None and not has_point:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="radius_km requires both lat and lng.",
        )
    if sort is BusinessSort.distance and not has_point:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="sort=distance requires both lat and lng.",
        )

    distance = _distance_km(lat, lng) if has_point else None

    # is_active is the owner's pause switch; status is moderation. A listing
    # needs both to be publicly visible, and a pending one must never leak.
    filters = [
        Business.is_active.is_(True),
        Business.status == BusinessStatus.approved,
    ]

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

    total = (
        db.scalar(
            select(func.count(Business.id))
            .select_from(Business)
            .join(Category, Category.id == Business.category_id)
            .where(where)
        )
        or 0
    )

    # NULLS LAST wherever rating is ordered on: in Postgres a DESC sort puts
    # NULLs first, which would lead the list with unrated listings.
    if sort is BusinessSort.rating:
        order = [desc(Business.rating).nulls_last(), desc(Business.review_count)]
    elif sort is BusinessSort.reviews:
        order = [desc(Business.review_count), desc(Business.rating).nulls_last()]
    elif sort is BusinessSort.distance:
        order = [asc(distance)]
    elif sort is BusinessSort.name:
        order = [asc(Business.name)]
    elif sort is BusinessSort.newest:
        order = [desc(Business.created_at)]
    else:
        # Relevance: a name hit outranks a description-only hit, then verified
        # listings, then the best rated. With no query it degrades to
        # "strongest listings first", which is what the category pages want.
        order = []
        if needle:
            order.append(
                desc(
                    case(
                        (Business.name.ilike(f"%{needle}%", escape="\\"), 1),
                        else_=0,
                    )
                )
            )
        order += [
            desc(Business.verified),
            desc(Business.rating).nulls_last(),
            desc(Business.review_count),
        ]
    # Deterministic tiebreak: without it, equal-ranked rows can repeat on one
    # page and vanish from another.
    order.append(asc(Business.id))

    columns = [Business, Category.slug, Category.name]
    if has_point:
        columns.append(distance.label("distance_km"))

    rows = db.execute(
        select(*columns)
        .join(Category, Category.id == Business.category_id)
        .where(where)
        .order_by(*order)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    items: list[BusinessListItem] = []
    for row in rows:
        business, cat_slug, cat_name = row[0], row[1], row[2]
        items.append(
            BusinessListItem(
                id=business.id,
                name=business.name,
                slug=business.slug,
                category_slug=cat_slug,
                category_name=cat_name,
                description=business.description,
                address=business.address,
                city=business.city,
                province=business.province,
                postal_code=business.postal_code,
                latitude=business.latitude,
                longitude=business.longitude,
                phone=business.phone,
                website=business.website,
                rating=business.rating,
                review_count=business.review_count,
                verified=business.verified,
                distance_km=round(row[3], 2) if has_point else None,
            )
        )

    total_pages = math.ceil(total / page_size) if total else 0

    return SearchResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1 and total > 0,
    )
