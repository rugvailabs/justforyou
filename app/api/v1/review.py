"""The human review console.

The confidence gate holds anything it is not sure of. This is the other half of
that promise: without somewhere for held tickets to go, the gate would simply
lose customers quietly.

Every route here is admin-only, and every decision writes an audit row naming
the reviewer. When a reviewer edits an answer before sending it, both versions
are kept - that pair is the accountability record, and the training signal for
the quality loop.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import require_admin
from app.models.extracted_problem import ExtractedProblem as ProblemRow
from app.models.match import Match
from app.models.provider import Provider
from app.models.review_queue import ReviewDecision, ReviewQueue
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.schemas.review import (
    ApproveRequest,
    InfoRequest,
    RejectRequest,
    ReviewDetail,
    ReviewListItem,
    ReviewStats,
)
from app.workers.tasks import notify_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/review", tags=["review"])


def _actor(user: User) -> str:
    return f"user:{user.id}"


def _age_hours(created: datetime | None) -> float:
    if created is None:
        return 0.0
    now = datetime.now(timezone.utc)
    return round((now - created).total_seconds() / 3600, 2)


def _load_open(db: Session, review_id: int) -> ReviewQueue:
    row = db.get(ReviewQueue, review_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Review item not found"
        )
    if row.resolved_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This ticket was already {row.decision.value if row.decision else 'resolved'}",
        )
    return row


def _guard_claim(row: ReviewQueue, reviewer: User) -> None:
    """Refuse to act on a ticket someone else is holding."""
    mine = _actor(reviewer)
    if row.claimed_by and row.claimed_by != mine:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This ticket is claimed by {row.claimed_by}. Ask them to "
            f"release it, or pick another.",
        )


# ---------------------------------------------------------------------------
# reading the queue
# ---------------------------------------------------------------------------
@router.get("/stats", response_model=ReviewStats)
def queue_stats(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ReviewStats:
    """Queue depth and age. A held ticket is a promise to a customer."""
    open_rows = list(
        db.scalars(select(ReviewQueue).where(ReviewQueue.resolved_at.is_(None)))
    )
    submissions = {
        s.id: s
        for s in db.scalars(
            select(Submission).where(
                Submission.id.in_([r.submission_id for r in open_rows] or [0])
            )
        )
    }
    ages = [
        _age_hours(submissions[r.submission_id].created_at)
        for r in open_rows
        if r.submission_id in submissions
    ]
    by_reason: dict[str, int] = {}
    for r in open_rows:
        code = r.reason.split(":", 1)[0].strip() or "unknown"
        by_reason[code] = by_reason.get(code, 0) + 1

    return ReviewStats(
        open_count=len(open_rows),
        claimed_count=sum(1 for r in open_rows if r.claimed_by),
        oldest_age_hours=max(ages) if ages else 0.0,
        by_reason=by_reason,
        resolved_today=db.scalar(
            select(func.count())
            .select_from(ReviewQueue)
            .where(
                ReviewQueue.resolved_at.isnot(None),
                ReviewQueue.resolved_at
                >= datetime.now(timezone.utc).replace(
                    hour=0, minute=0, second=0, microsecond=0
                ),
            )
        )
        or 0,
    )


@router.get("", response_model=list[ReviewListItem])
def list_queue(
    resolved: bool = Query(default=False, description="Show resolved tickets instead"),
    reason_code: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[ReviewListItem]:
    """Held tickets, oldest first - the customer waiting longest comes first."""
    stmt = select(ReviewQueue)
    stmt = stmt.where(
        ReviewQueue.resolved_at.isnot(None) if resolved else ReviewQueue.resolved_at.is_(None)
    )
    if reason_code:
        stmt = stmt.where(ReviewQueue.reason.startswith(reason_code))
    stmt = stmt.order_by(ReviewQueue.id.asc()).limit(limit).offset(offset)

    rows = list(db.scalars(stmt))
    submissions = {
        s.id: s
        for s in db.scalars(
            select(Submission).where(
                Submission.id.in_([r.submission_id for r in rows] or [0])
            )
        )
    }

    items: list[ReviewListItem] = []
    for row in rows:
        sub = submissions.get(row.submission_id)
        items.append(
            ReviewListItem(
                id=row.id,
                submission_id=row.submission_id,
                reason=row.reason,
                reason_code=row.reason.split(":", 1)[0].strip(),
                claimed_by=row.claimed_by,
                decision=row.decision.value if row.decision else None,
                resolved_at=row.resolved_at,
                submission_status=sub.status.value if sub else "unknown",
                age_hours=_age_hours(sub.created_at if sub else None),
                preview=(sub.transcript or "")[:160] if sub else "",
            )
        )
    return items


@router.get("/{review_id}", response_model=ReviewDetail)
def get_review(
    review_id: int,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ReviewDetail:
    """Everything a reviewer needs on one screen."""
    row = db.get(ReviewQueue, review_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Review item not found"
        )

    submission = db.get(Submission, row.submission_id)
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found"
        )

    problem = db.scalar(
        select(ProblemRow).where(ProblemRow.submission_id == row.submission_id)
    )
    match = db.scalar(
        select(Match)
        .where(Match.submission_id == row.submission_id)
        .order_by(Match.id.desc())
    )
    provider = db.get(Provider, match.provider_id) if match and match.provider_id else None
    customer = db.get(User, submission.user_id)

    return ReviewDetail(
        id=row.id,
        submission_id=row.submission_id,
        reason=row.reason,
        reason_code=row.reason.split(":", 1)[0].strip(),
        claimed_by=row.claimed_by,
        claimed_at=row.claimed_at,
        decision=row.decision.value if row.decision else None,
        decided_by=row.decided_by,
        resolved_at=row.resolved_at,
        reviewer_note=row.reviewer_note,
        age_hours=_age_hours(submission.created_at),
        submission_status=submission.status.value,
        preview=(submission.transcript or "")[:160],
        input_type=submission.input_type.value,
        customer_email=customer.email if customer else "unknown",
        customer_name=customer.name if customer else "unknown",
        transcript=submission.transcript,
        category=problem.category if problem else None,
        urgency=problem.urgency.value if problem else None,
        location=problem.location if problem else None,
        extraction_json=problem.raw_json if problem else None,
        solution_text=match.solution_text if match else None,
        original_solution_text=row.original_solution_text,
        solution_json=match.solution_json if match else None,
        gate_json=match.gate_json if match else None,
        confidence=match.confidence if match else None,
        provider_name=provider.name if provider else None,
        provider_contact=(
            (provider.contact_phone or provider.contact_email) if provider else None
        ),
    )


# ---------------------------------------------------------------------------
# claiming
# ---------------------------------------------------------------------------
@router.post("/{review_id}/claim", response_model=ReviewDetail)
def claim(
    review_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ReviewDetail:
    row = _load_open(db, review_id)
    _guard_claim(row, admin)

    row.claimed_by = _actor(admin)
    row.claimed_at = datetime.now(timezone.utc)
    db.commit()

    log_audit(
        db,
        actor=_actor(admin),
        action="review.claimed",
        target_table="review_queue",
        target_id=row.id,
        metadata={"submission_id": row.submission_id},
    )
    return get_review(review_id, admin, db)


@router.post("/{review_id}/release", response_model=ReviewDetail)
def release(
    review_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ReviewDetail:
    row = _load_open(db, review_id)
    _guard_claim(row, admin)

    row.claimed_by = None
    row.claimed_at = None
    db.commit()

    log_audit(
        db,
        actor=_actor(admin),
        action="review.released",
        target_table="review_queue",
        target_id=row.id,
        metadata={"submission_id": row.submission_id},
    )
    return get_review(review_id, admin, db)


# ---------------------------------------------------------------------------
# deciding
# ---------------------------------------------------------------------------
@router.post("/{review_id}/approve", response_model=ReviewDetail)
def approve(
    review_id: int,
    payload: ApproveRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ReviewDetail:
    """Release a held answer to the customer, as written or edited.

    This is the only path by which a held ticket is ever delivered. It moves the
    submission to APPROVED and re-enters the same notify_task the automatic path
    uses - same consent check, same messages_sent record.
    """
    row = _load_open(db, review_id)
    _guard_claim(row, admin)

    submission = db.get(Submission, row.submission_id)
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found"
        )

    match = db.scalar(
        select(Match)
        .where(Match.submission_id == row.submission_id)
        .order_by(Match.id.desc())
    )
    if match is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="There is no answer to approve. Reject this ticket instead.",
        )

    edited = False
    if payload.solution_text and payload.solution_text.strip() != (
        match.solution_text or ""
    ).strip():
        # Keep the AI's version. Losing it would destroy both the audit trail
        # and the only signal we have about what the model gets wrong.
        row.original_solution_text = match.solution_text
        match.solution_text = payload.solution_text.strip()
        edited = True

    match.needs_human_review = False
    row.decision = ReviewDecision.approved
    row.decided_by = _actor(admin)
    row.reviewer_note = payload.note
    row.resolved_at = datetime.now(timezone.utc)
    submission.status = SubmissionStatus.APPROVED
    db.commit()

    log_audit(
        db,
        actor=_actor(admin),
        action="review.approved",
        target_table="submissions",
        target_id=row.submission_id,
        metadata={
            "review_id": row.id,
            "edited": edited,
            "note": payload.note,
            "original_solution_text": row.original_solution_text,
            "final_solution_text": match.solution_text,
        },
    )

    logger.info(
        "review: submission %s approved by %s (edited=%s)",
        row.submission_id,
        _actor(admin),
        edited,
    )
    notify_task.delay(row.submission_id)

    return get_review(review_id, admin, db)


@router.post("/{review_id}/reject", response_model=ReviewDetail)
def reject(
    review_id: int,
    payload: RejectRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ReviewDetail:
    """Close a ticket without sending anything. Nothing reaches the customer."""
    row = _load_open(db, review_id)
    _guard_claim(row, admin)

    row.decision = ReviewDecision.rejected
    row.decided_by = _actor(admin)
    row.reviewer_note = payload.reason
    row.resolved_at = datetime.now(timezone.utc)
    db.commit()

    log_audit(
        db,
        actor=_actor(admin),
        action="review.rejected",
        target_table="submissions",
        target_id=row.submission_id,
        metadata={"review_id": row.id, "reason": payload.reason},
    )

    logger.info(
        "review: submission %s rejected by %s", row.submission_id, _actor(admin)
    )
    return get_review(review_id, admin, db)


@router.post("/{review_id}/request-info", response_model=ReviewDetail)
def request_info(
    review_id: int,
    payload: InfoRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ReviewDetail:
    """Record that we need something from the customer before answering.

    The question is stored and audited. Actually asking them is a delivery
    concern and rides on the same notification service once that flow exists;
    for now this closes the ticket with the question on the record.
    """
    row = _load_open(db, review_id)
    _guard_claim(row, admin)

    row.decision = ReviewDecision.info_requested
    row.decided_by = _actor(admin)
    row.reviewer_note = payload.question
    row.resolved_at = datetime.now(timezone.utc)
    db.commit()

    log_audit(
        db,
        actor=_actor(admin),
        action="review.info_requested",
        target_table="submissions",
        target_id=row.submission_id,
        metadata={"review_id": row.id, "question": payload.question},
    )
    return get_review(review_id, admin, db)
