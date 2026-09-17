"""Public business search for the directory.

Results are ordered by subscription tier first - Annual, then Monthly (rotating),
then Basic, then listings with no plan - and by the requested sort within each
tier. Tiers change the order only; what is visible at all is decided by
moderation and verification. The query is app/services/priority_search.py and
the rules app/services/placement.py; each page shown is logged for analytics
(app/api/v1/search.py).
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.v1.search import run_search
from app.core.db import get_db
from app.core.deps import get_current_user_optional
from app.models.user import User
from app.schemas.directory import BusinessSort, SearchResponse
from app.services.priority_search import SearchFilters

router = APIRouter(prefix="/businesses", tags=["directory"])


@router.get("/search", response_model=SearchResponse)
def search_businesses(
    background: BackgroundTasks,
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
    track: bool = Query(
        default=True,
        description="Log the results shown for analytics. False for internal lookups nobody sees.",
    ),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
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

    return run_search(
        db=db,
        filters=SearchFilters(
            q=q,
            category_slug=category_slug,
            city=city,
            lat=lat,
            lng=lng,
            radius_km=radius_km,
            min_rating=min_rating,
            sort=sort,
            page=page,
            page_size=page_size,
        ),
        background=background,
        user=user,
        track=track,
    )
