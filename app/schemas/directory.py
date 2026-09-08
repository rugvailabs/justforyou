"""Schemas for the public directory: categories and business search."""

from __future__ import annotations

import enum

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.models.business import BusinessStatus
from app.models.enquiry import EnquiryType


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


class BusinessOwnerItem(BaseModel):
    """A listing as its owner sees it - includes the moderation status."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    category_id: int
    status: BusinessStatus
    city: str
    province: str
    address: str | None
    rating: float | None
    review_count: int
    is_active: bool
    verified: bool
    # Why a listing was rejected or suspended. Shown to the owner - a decision
    # they cannot understand is a dead end.
    moderation_note: str | None = None
    moderated_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class BusinessDetail(BusinessOwnerItem):
    """Everything the edit form needs to round-trip a listing."""

    description: str | None
    postal_code: str | None
    latitude: float | None
    longitude: float | None
    phone: str | None
    whatsapp: str | None
    email: str | None
    website: str | None
    price_range: str | None
    tags: list[str] | None
    opening_hours: dict[str, Any] | None
    owner_id: int | None
    category_slug: str | None = None
    category_name: str | None = None


class BusinessCreate(BaseModel):
    """Owner-supplied fields for a new listing.

    Deliberately omits status, owner_id, rating, review_count and verified:
    those are set by the server. Accepting them from the client would let an
    owner self-approve or invent a rating.
    """

    name: str = Field(min_length=1, max_length=255)
    category_id: int
    description: str | None = Field(default=None, max_length=5000)
    address: str | None = Field(default=None, max_length=255)
    city: str = Field(min_length=1, max_length=128)
    province: str = Field(default="BC", min_length=2, max_length=2)
    postal_code: str | None = Field(default=None, max_length=16)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    phone: str | None = Field(default=None, max_length=32)
    whatsapp: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=320)
    website: HttpUrl | None = None
    price_range: str | None = Field(default=None, max_length=8)
    tags: list[str] | None = None
    opening_hours: dict[str, Any] | None = None


class BusinessUpdate(BaseModel):
    """PATCH payload. Every field optional; omitted fields are left alone."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    category_id: int | None = None
    description: str | None = Field(default=None, max_length=5000)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, min_length=1, max_length=128)
    province: str | None = Field(default=None, min_length=2, max_length=2)
    postal_code: str | None = Field(default=None, max_length=16)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    phone: str | None = Field(default=None, max_length=32)
    whatsapp: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=320)
    website: HttpUrl | None = None
    price_range: str | None = Field(default=None, max_length=8)
    tags: list[str] | None = None
    opening_hours: dict[str, Any] | None = None
    # The owner may pause a listing, but cannot change its moderation status.
    is_active: bool | None = None


class EnquiryCreate(BaseModel):
    """A lead posted from a public listing page.

    Anonymous callers are allowed, so contact details ride on the payload.
    `call_click` carries no message - it just records that someone revealed
    the number.
    """

    enquiry_type: EnquiryType
    message: str | None = Field(default=None, max_length=2000)
    contact_name: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=32)
    contact_email: str | None = Field(default=None, max_length=320)


class EnquiryOut(BaseModel):
    """A lead as its owner sees it."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    enquiry_type: EnquiryType
    message: str | None
    contact_name: str | None
    contact_phone: str | None
    contact_email: str | None
    # Present when the enquiry came from a signed-in customer.
    user_id: int | None
    created_at: datetime


class EnquiryAck(BaseModel):
    """Deliberately thin: the public endpoint confirms receipt and nothing more.

    Echoing the stored row back would let anyone enumerate a business's leads
    by posting one and reading the response.
    """

    id: int
    created_at: datetime


class BusinessReviewCreate(BaseModel):
    """A customer's review. Requires an account - see the endpoint."""

    rating: int = Field(ge=1, le=5)
    title: str | None = Field(default=None, max_length=255)
    body: str | None = Field(default=None, max_length=5000)


class OwnerReplyCreate(BaseModel):
    """The owner's single reply to a review."""

    reply: str = Field(min_length=1, max_length=2000)


class BusinessReviewOut(BaseModel):
    """A review as shown publicly and in the owner's dashboard.

    Carries the author's display name but never their email: the review page
    is public, and a reviewer has not consented to publishing their address.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    rating: int
    title: str | None
    body: str | None
    owner_reply: str | None
    owner_replied_at: datetime | None
    created_at: datetime
    author_id: int
    author_name: str


class BusinessReviewSummary(BaseModel):
    """Aggregate shown above the review list."""

    average_rating: float | None
    review_count: int
    # rating value -> how many reviews gave it, for the 5..1 histogram.
    breakdown: dict[int, int]


class ModerationDecision(BaseModel):
    """Reason attached to a moderation decision.

    Required for reject and suspend, optional on approve - an owner needs to
    know why they were turned down, not why they were let through.
    """

    reason: str = Field(
        min_length=3,
        max_length=1000,
        description="Shown to the listing owner. Recorded against the listing.",
    )


class ModerationQueueItem(BaseModel):
    """A listing as the moderator sees it, with enough context to decide."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    status: BusinessStatus
    city: str
    province: str
    address: str | None
    description: str | None
    phone: str | None
    website: str | None
    category_name: str
    owner_id: int | None
    # Admin-only surface, so identifying the submitter is appropriate here in
    # a way it never is on the public listing page.
    owner_email: str | None
    moderation_note: str | None
    moderated_at: datetime | None
    created_at: datetime


class ModerationStats(BaseModel):
    pending: int
    approved: int
    rejected: int
    suspended: int
