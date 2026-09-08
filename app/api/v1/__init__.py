"""v1 API routers."""

from fastapi import APIRouter

from app.api.v1 import (
    admin_businesses,
    admin_overview,
    audit,
    auth,
    businesses,
    business_reviews,
    businesses_owner,
    chat,
    categories,
    consents,
    otp,
    enquiries,
    payments,
    profile,
    review,
    submissions,
    verification,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(admin_businesses.router)
api_router.include_router(admin_overview.router)
api_router.include_router(auth.router)
api_router.include_router(otp.router)
api_router.include_router(audit.router)
api_router.include_router(businesses.router)
api_router.include_router(businesses_owner.router)
api_router.include_router(enquiries.router)
api_router.include_router(business_reviews.router)
api_router.include_router(categories.router)
api_router.include_router(chat.router)
api_router.include_router(consents.router)
api_router.include_router(payments.router)
api_router.include_router(profile.router)
api_router.include_router(review.router)
api_router.include_router(submissions.router)
api_router.include_router(verification.router)

__all__ = ["api_router"]
