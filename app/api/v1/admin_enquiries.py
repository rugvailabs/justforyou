"""The global lead inbox, and its CSV export.

Distinct from GET /businesses/{id}/enquiries, which is an owner reading their
own leads. This is every lead across the directory, and it exists because
nothing did: admin had a `total_enquiries` count on the overview and no way to
look at a single one of them.

Behind require_admin, and worth being explicit about why that matters more here
than on most admin routes: these rows carry contact details customers gave to a
specific business, not to us. It is the most personal data in the application,
so every read is audit-logged - a bare count cannot be misused and a list of
names and phone numbers can.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import require_admin
from app.models.business import Business
from app.models.enquiry import Enquiry, EnquiryType
from app.models.user import User
from app.schemas.directory import AdminEnquiryOut, AdminEnquiryPage

router = APIRouter(prefix="/admin/enquiries", tags=["admin"])

#: Hard ceiling on an export. Building a CSV in memory is fine at this size and
#: is not fine unbounded; past this the answer is a background job, not a
#: bigger number here.
EXPORT_LIMIT = 5000

#: Characters a spreadsheet treats as the start of a formula. A contact name
#: beginning with one of these becomes executable code when a colleague opens
#: the export, which is the whole reason the writer below is not str.join.
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _base_query(
    enquiry_type: EnquiryType | None, business_id: int | None
) -> Select[tuple[Enquiry, Business]]:
    """The join every read here shares: a lead and the listing it was left on."""
    stmt = select(Enquiry, Business).join(Business, Enquiry.business_id == Business.id)
    if enquiry_type is not None:
        stmt = stmt.where(Enquiry.enquiry_type == enquiry_type)
    if business_id is not None:
        stmt = stmt.where(Enquiry.business_id == business_id)
    return stmt


def _to_out(enquiry: Enquiry, business: Business) -> AdminEnquiryOut:
    return AdminEnquiryOut(
        id=enquiry.id,
        business_id=enquiry.business_id,
        enquiry_type=enquiry.enquiry_type,
        message=enquiry.message,
        contact_name=enquiry.contact_name,
        contact_phone=enquiry.contact_phone,
        contact_email=enquiry.contact_email,
        user_id=enquiry.user_id,
        created_at=enquiry.created_at,
        business_name=business.name,
        business_slug=business.slug,
    )


@router.get("", response_model=AdminEnquiryPage)
def list_enquiries(
    enquiry_type: EnquiryType | None = Query(default=None),
    business_id: int | None = Query(default=None, ge=1),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminEnquiryPage:
    """Every lead in the directory, newest first."""
    stmt = _base_query(enquiry_type, business_id)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    rows = db.execute(
        stmt.order_by(Enquiry.created_at.desc(), Enquiry.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    log_audit(
        db,
        actor=f"user:{admin.id}",
        action="admin.enquiries.list",
        target_table="enquiries",
        # A listing is not one row, so there is no id to name. 0 rather than a
        # misleading one.
        target_id=0,
        metadata={
            "type": enquiry_type.value if enquiry_type is not None else None,
            "business_id": business_id,
            "page": page,
            "returned": len(rows),
        },
    )

    return AdminEnquiryPage(
        items=[_to_out(enquiry, business) for enquiry, business in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


def _safe_cell(value: object) -> str:
    """Neutralise a value a spreadsheet would otherwise run as a formula."""
    text = "" if value is None else str(value)
    if text[:1] in FORMULA_PREFIXES:
        # A leading apostrophe is how Excel and Sheets are told "this is text".
        return "'" + text
    return text


@router.get("/export")
def export_enquiries(
    enquiry_type: EnquiryType | None = Query(default=None),
    business_id: int | None = Query(default=None, ge=1),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Response:
    """The same rows as CSV, honouring the same filters."""
    rows = db.execute(
        _base_query(enquiry_type, business_id)
        .order_by(Enquiry.created_at.desc(), Enquiry.id.desc())
        .limit(EXPORT_LIMIT)
    ).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer, quoting=csv.QUOTE_ALL, lineterminator="\n")
    writer.writerow(
        [
            "enquiry_id",
            "created_at",
            "type",
            "business_id",
            "business_name",
            "business_slug",
            "contact_name",
            "contact_phone",
            "contact_email",
            "signed_in_user_id",
            "message",
        ]
    )
    for enquiry, business in rows:
        writer.writerow(
            [
                _safe_cell(enquiry.id),
                _safe_cell(enquiry.created_at.isoformat()),
                _safe_cell(enquiry.enquiry_type.value),
                _safe_cell(business.id),
                _safe_cell(business.name),
                _safe_cell(business.slug),
                _safe_cell(enquiry.contact_name),
                _safe_cell(enquiry.contact_phone),
                _safe_cell(enquiry.contact_email),
                _safe_cell(enquiry.user_id),
                _safe_cell(enquiry.message),
            ]
        )

    log_audit(
        db,
        actor=f"user:{admin.id}",
        action="admin.enquiries.export",
        target_table="enquiries",
        target_id=0,
        metadata={
            "rows": len(rows),
            "type": enquiry_type.value if enquiry_type is not None else None,
            "business_id": business_id,
            "truncated": len(rows) == EXPORT_LIMIT,
        },
    )

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    return Response(
        # BOM so Excel on Windows reads this as UTF-8 rather than the system
        # codepage, which mangles every accented name in the file.
        content="﻿" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="leads-{stamp}.csv"'},
    )
