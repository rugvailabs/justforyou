"""Customer-to-business chat.

One thread per (customer, listing), both sides signed in. Anonymous contact is
covered by enquiries; a back-and-forth needs a durable identity to reply to.

Authorisation is participation, not role: you may read or write a thread if you
are its customer or the owner of its listing, and nothing else grants access -
not being an admin, not owning some other listing.

Delivery is polling. `GET /messages?after_id=` returns only what is new, so the
client can ask every few seconds cheaply. Swapping in a WebSocket later needs
no change to these tables.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.business import Business, BusinessStatus
from app.models.chat import Conversation, Message
from app.models.user import User
from app.schemas.chat import (
    ConversationDetail,
    ConversationOut,
    ConversationStart,
    MessageCreate,
    MessageOut,
)

router = APIRouter(prefix="/chat", tags=["chat"])

PREVIEW_CHARS = 120


def _role(conversation: Conversation, business: Business, user: User) -> str | None:
    """Which side of the thread the caller is on, or None if neither."""
    if conversation.customer_id == user.id:
        return "customer"
    if business.owner_id is not None and business.owner_id == user.id:
        return "owner"
    return None


def _load_participant(
    db: Session, conversation_id: int, user: User
) -> tuple[Conversation, Business, str]:
    """Resolve a thread the caller participates in, or refuse.

    404 rather than 403 for a thread the caller has nothing to do with: the
    existence of a conversation between two other parties is itself private.
    """
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )

    business = db.get(Business, conversation.business_id)
    role = _role(conversation, business, user) if business is not None else None
    if business is None or role is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )
    return conversation, business, role


def _unread(db: Session, conversation: Conversation, role: str, user: User) -> int:
    """Messages from the other side since this side last read."""
    read_at = (
        conversation.customer_read_at
        if role == "customer"
        else conversation.owner_read_at
    )
    stmt = select(func.count(Message.id)).where(
        Message.conversation_id == conversation.id,
        Message.sender_id != user.id,
    )
    if read_at is not None:
        stmt = stmt.where(Message.created_at > read_at)
    return db.scalar(stmt) or 0


def _preview(db: Session, conversation: Conversation) -> str | None:
    body = db.scalar(
        select(Message.body)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.id.desc())
        .limit(1)
    )
    if body is None:
        return None
    return body if len(body) <= PREVIEW_CHARS else body[: PREVIEW_CHARS - 1] + "…"


def _to_out(
    db: Session,
    conversation: Conversation,
    business: Business,
    role: str,
    user: User,
) -> ConversationOut:
    other = (
        business.name
        if role == "customer"
        else (conversation.customer.name if conversation.customer else "Customer")
    )
    return ConversationOut(
        id=conversation.id,
        business_id=business.id,
        business_name=business.name,
        business_slug=business.slug,
        customer_id=conversation.customer_id,
        my_role=role,
        other_party_name=other,
        last_message_at=conversation.last_message_at,
        last_message_preview=_preview(db, conversation),
        unread=_unread(db, conversation, role, user),
        created_at=conversation.created_at,
    )


def _message_out(message: Message, user: User) -> MessageOut:
    return MessageOut(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        sender_name=message.sender.name if message.sender else "Former user",
        mine=message.sender_id == user.id,
        body=message.body,
        created_at=message.created_at,
    )


@router.post(
    "/conversations", response_model=ConversationOut, status_code=status.HTTP_201_CREATED
)
def start_conversation(
    payload: ConversationStart,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationOut:
    """Get-or-create the caller's thread with a listing.

    Idempotent by design: "message this business" from the profile page must
    reopen the existing thread, not fork the history.
    """
    business = db.get(Business, payload.business_id)
    if (
        business is None
        or business.status is not BusinessStatus.approved
        or not business.is_active
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found"
        )

    if business.owner_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot start a chat with your own listing",
        )

    existing = db.scalar(
        select(Conversation).where(
            Conversation.business_id == business.id,
            Conversation.customer_id == current_user.id,
        )
    )
    if existing is not None:
        return _to_out(db, existing, business, "customer", current_user)

    conversation = Conversation(
        business_id=business.id, customer_id=current_user.id
    )
    db.add(conversation)
    try:
        db.commit()
    except IntegrityError:
        # Two tabs pressing the button at once. The unique constraint is the
        # real guard; fall back to the row that won.
        db.rollback()
        conversation = db.scalar(
            select(Conversation).where(
                Conversation.business_id == business.id,
                Conversation.customer_id == current_user.id,
            )
        )
        if conversation is None:
            raise
    db.refresh(conversation)
    return _to_out(db, conversation, business, "customer", current_user)


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ConversationOut]:
    """Every thread the caller is in, either side, most recently active first."""
    rows = db.execute(
        select(Conversation, Business)
        .join(Business, Business.id == Conversation.business_id)
        .where(
            (Conversation.customer_id == current_user.id)
            | (Business.owner_id == current_user.id)
        )
        .order_by(Conversation.last_message_at.desc(), Conversation.id.desc())
    ).all()

    out: list[ConversationOut] = []
    for conversation, business in rows:
        role = _role(conversation, business, current_user)
        if role is None:
            continue
        out.append(_to_out(db, conversation, business, role, current_user))
    return out


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationDetail:
    """A thread with its full history."""
    conversation, business, role = _load_participant(db, conversation_id, current_user)
    base = _to_out(db, conversation, business, role, current_user)
    messages = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.id.asc())
    ).all()
    return ConversationDetail(
        **base.model_dump(),
        messages=[_message_out(m, current_user) for m in messages],
    )


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
def list_messages(
    conversation_id: int,
    after_id: int = Query(default=0, ge=0, description="Only messages with a higher id"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MessageOut]:
    """Messages in a thread, oldest first.

    `after_id` is what makes polling cheap: the client asks only for what it
    has not seen. Ids are monotonic within a thread, so no timestamp
    comparison or clock agreement is needed.
    """
    conversation, _business, _role = _load_participant(db, conversation_id, current_user)

    messages = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation.id, Message.id > after_id)
        .order_by(Message.id.asc())
    ).all()
    return [_message_out(m, current_user) for m in messages]


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
)
def send_message(
    conversation_id: int,
    payload: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    """Post a message to a thread the caller participates in."""
    conversation, _business, role = _load_participant(db, conversation_id, current_user)

    now = datetime.now(timezone.utc)
    message = Message(
        conversation_id=conversation.id,
        sender_id=current_user.id,
        body=payload.body.strip(),
    )
    db.add(message)

    conversation.last_message_at = now
    # Sending implies having read what came before, so the sender's own unread
    # count does not stay stuck at whatever it was.
    if role == "customer":
        conversation.customer_read_at = now
    else:
        conversation.owner_read_at = now

    db.commit()
    db.refresh(message)
    return _message_out(message, current_user)


@router.post("/conversations/{conversation_id}/read", response_model=ConversationOut)
def mark_read(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationOut:
    """Mark everything currently in the thread as read for the caller's side."""
    conversation, business, role = _load_participant(db, conversation_id, current_user)

    now = datetime.now(timezone.utc)
    if role == "customer":
        conversation.customer_read_at = now
    else:
        conversation.owner_read_at = now
    db.commit()
    db.refresh(conversation)
    return _to_out(db, conversation, business, role, current_user)
