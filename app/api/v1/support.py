"""Support messages: questions, feedback and bug reports.

These come to us rather than to a business, which is what separates them from
an enquiry. Anyone may send one, signed in or not - the person best placed to
report that sign-up is broken is precisely someone who could not complete one.

The row is written first and the notification email sent afterwards, on a
best-effort basis: if SMTP is down, the message is still recorded and the
endpoint still reports success, because losing somebody's bug report to a mail
outage is the one failure mode worth designing against here.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import get_current_user_optional
from app.models.support import SupportMessage
from app.models.user import User
from app.schemas.support import SupportMessageAccepted, SupportMessageCreate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/support", tags=["support"])

SMTP_TIMEOUT_SECONDS = 15

KIND_SUBJECTS = {
    "enquiry": "Customer care enquiry",
    "feedback": "Feedback",
    "bug": "Bug report",
}


def _notify(record: SupportMessage) -> None:
    """Email the support inbox. Never raises - the row is the record."""
    settings = get_settings()

    message = EmailMessage()
    label = KIND_SUBJECTS.get(record.kind.value, "Support message")
    message["Subject"] = f"[{label}] {record.subject or f'#{record.id}'}"
    message["From"] = settings.mail_from
    message["To"] = settings.support_email
    # So a reply from the inbox reaches the person who wrote in, rather than
    # the no-reply envelope sender.
    message["Reply-To"] = record.email

    lines = [
        f"Kind:    {record.kind.value}",
        f"From:    {record.name or 'not given'} <{record.email}>",
        f"Account: {record.user_id if record.user_id is not None else 'not signed in'}",
        f"Ref:     support #{record.id}",
    ]
    if record.page_url:
        lines.append(f"Page:    {record.page_url}")
    if record.user_agent:
        lines.append(f"Browser: {record.user_agent}")
    lines.extend(["", record.message])
    message.set_content("\n".join(lines))

    try:
        with smtplib.SMTP(
            settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS
        ) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    except Exception:
        # Logged, not raised: the support message is already persisted, and
        # telling the sender their bug report failed - when it did not - would
        # cost us the report on the retry they do not make.
        logger.exception("Could not email support message %s", record.id)


@router.post(
    "", response_model=SupportMessageAccepted, status_code=status.HTTP_201_CREATED
)
def create_support_message(
    payload: SupportMessageCreate,
    request: Request,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> SupportMessageAccepted:
    """Send us a question, some feedback, or a bug report."""
    record = SupportMessage(
        kind=payload.kind,
        name=payload.name,
        email=payload.email,
        subject=payload.subject,
        message=payload.message,
        page_url=payload.page_url,
        # Truncated rather than rejected: a browser string nobody controls
        # should not be able to fail somebody's bug report on a 422.
        user_agent=(payload.user_agent or request.headers.get("user-agent"))[:512]
        if (payload.user_agent or request.headers.get("user-agent"))
        else None,
        user_id=current_user.id if current_user is not None else None,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    _notify(record)

    return SupportMessageAccepted(id=record.id, created_at=record.created_at)
