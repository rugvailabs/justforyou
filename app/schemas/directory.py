"""Schemas for the public directory: categories and business search."""

from __future__ import annotations

import enum

from pydantic import BaseModel, ConfigDict, Field


class BusinessSort(str, enum.Enum):
    """Ordering for /businesses/search.

    `distance` is only meaningful when lat/lng are supplied; the endpoint
    rejects it otherwise rather than silently falling back.
    """

    relevance = "relevance"
    rating = "rating"
    reviews = "reviews"
    distance = "distance"
    name = "name"
    newest = "newest"


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    parent_id: int | None
    description: str | None
    icon: str | None
    # Active listings directly in this category. Rendered on the category grid.
    business_count: int = 0


class BusinessListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    category_slug: str
    category_name: str
    description: str | None
    address: str | None
    city: str
    province: str
    postal_code: str | None
    latitude: float | None
    longitude: float | None
    phone: str | None
    website: str | None
    # NULL when the listing has no ratings yet - render "No reviews yet",
    # not zero stars.
    rating: float | None
    review_count: int
    verified: bool
    # Great-circle distance from the ?lat/?lng the caller passed. Absent from
    # every response that did not supply a point to measure from.
    distance_km: float | None = None


class SearchResponse(BaseModel):
    items: list[BusinessListItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_prev: bool
