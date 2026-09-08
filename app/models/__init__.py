"""All ORM models, imported here so Base.metadata is fully populated.

Alembic autogenerate only sees tables that have been imported, so every new
model file must be added to this module.
"""

from app.models.audit_log import AuditLog
from app.models.base import Base
from app.models.business import Business, BusinessStatus
from app.models.business_review import BusinessReview
from app.models.category import Category
from app.models.consent import Consent, ConsentType
from app.models.enquiry import Enquiry, EnquiryType
from app.models.extracted_problem import ExtractedProblem, Urgency
from app.models.match import Match, MatchType
from app.models.message_sent import (
    MessageChannel,
    MessageSent,
    MessageStatus,
)
from app.models.provider import Provider
from app.models.review_queue import ReviewDecision, ReviewQueue
from app.models.submission import InputType, Submission, SubmissionStatus
from app.models.user import PreferredContactMethod, User, UserRole

__all__ = [
    "AuditLog",
    "Base",
    "Business",
    "BusinessStatus",
    "BusinessReview",
    "Category",
    "Consent",
    "ConsentType",
    "Enquiry",
    "EnquiryType",
    "ExtractedProblem",
    "Urgency",
    "Match",
    "MatchType",
    "MessageChannel",
    "MessageSent",
    "MessageStatus",
    "Provider",
    "ReviewQueue",
    "ReviewDecision",
    "Submission",
    "InputType",
    "SubmissionStatus",
    "PreferredContactMethod",
    "User",
    "UserRole",
]
