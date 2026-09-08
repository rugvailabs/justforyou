"""v1 API routers."""

from fastapi import APIRouter

from app.api.v1 import (
    admin_businesses,
    audit,
    auth,
    businesses,
    business_reviews,
    businesses_owner,
    categories,
    consents,
    enquiries,
    profile,
    review,
    submissions,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(admin_businesses.router)
api_router.include_router(auth.router)
api_router.include_router(audit.router)
api_router.include_router(businesses.router)
api_router.include_router(businesses_owner.router)
api_router.include_router(enquiries.router)
api_router.include_router(business_reviews.router)
api_router.include_router(categories.router)
api_router.include_router(consents.router)
api_router.include_router(profile.router)
api_router.include_router(review.router)
api_router.include_router(submissions.router)

__all__ = ["api_router"]
