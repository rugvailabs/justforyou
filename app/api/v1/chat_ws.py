"""Realtime delivery for chat, over a WebSocket.

AUTH: a socket cannot carry an httpOnly cookie reliably across origins, and
this app's JWT deliberately never reaches the browser - it lives in an
httpOnly cookie so that XSS cannot lift it. Putting the access token in the
socket URL would undo that, and URLs leak: into logs, proxies, referrers.

So the client first asks a normal authenticated endpoint for a TICKET: a JWT
that lives for 60 seconds, names one conversation, and is useless for anything
else. It is minted server-side, handed to the browser, and spent immediately.
A stolen ticket buys a minute of one conversation rather than the account.

FAN-OUT is in-process: one dict of conversation id -> live sockets. That is
correct for a single backend and wrong the moment there are two, because a
message published on one worker never reaches a subscriber on another. Redis
pub/sub is the usual fix and the REST history means nothing is lost meanwhile -
a reconnect re-reads it.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, DefaultDict, Set

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal, get_db
from app.core.deps import get_current_user
from app.core.security import JWTError, create_access_token, decode_access_token
from app.models.business import Business
from app.models.chat import Conversation, Message
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])

TICKET_TTL_SECONDS = 60
MAX_BODY_CHARS = 4000

# conversation id -> sockets currently watching it.
_rooms: DefaultDict[int, Set[WebSocket]] = defaultdict(set)
# Guards _rooms against concurrent connect/disconnect interleaving.
_lock = asyncio.Lock()


def _participant_role(conversation: Conversation, business: Business, user_id: int):
    if conversation.customer_id == user_id:
        return "customer"
    if business.owner_id is not None and business.owner_id == user_id:
        return "owner"
    return None


@router.post("/api/v1/chat/ws-ticket")
def issue_ws_ticket(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Mint a short-lived ticket for one conversation's socket.

    Authorised exactly like the REST thread: a non-participant gets the same
    404 they would get reading it, so this cannot be used to discover that a
    conversation exists.
    """
    conversation = db.get(Conversation, conversation_id)
    business = (
        db.get(Business, conversation.business_id) if conversation is not None else None
    )
    if (
        conversation is None
        or business is None
        or _participant_role(conversation, business, current_user.id) is None
    ):
        # Mirrors the REST endpoint's 404 rather than 403.
        from fastapi import HTTPException

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )

    ticket = create_access_token(
        # `ws` scopes the ticket to one conversation, so a leaked ticket cannot
        # be replayed against another thread or against the REST API.
        {"sub": str(current_user.id), "ws": conversation_id},
        expires_delta=timedelta(seconds=TICKET_TTL_SECONDS),
    )
    return {"ticket": ticket, "expires_in": TICKET_TTL_SECONDS}


def _authorise(ticket: str, conversation_id: int) -> tuple[User, Conversation] | None:
    """Resolve a ticket to (user, conversation), or None if it does not hold."""
    try:
        claims = decode_access_token(ticket)
    except JWTError:
        return None

    if claims.get("ws") != conversation_id:
        return None

    subject = claims.get("sub")
    try:
        user_id = int(subject)
    except (TypeError, ValueError):
        return None

    # Its own session: a socket outlives any request-scoped one.
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        conversation = db.get(Conversation, conversation_id)
        business = (
            db.get(Business, conversation.business_id)
            if conversation is not None
            else None
        )
        if (
            user is None
            or conversation is None
            or business is None
            or _participant_role(conversation, business, user.id) is None
        ):
            return None
        # Detach what the caller needs, so the session can close.
        db.expunge(user)
        db.expunge(conversation)
        return user, conversation
    finally:
        db.close()


async def _broadcast(conversation_id: int, payload: dict[str, Any]) -> None:
    """Send to everyone watching, dropping sockets that have gone away."""
    async with _lock:
        sockets = list(_rooms.get(conversation_id, ()))

    dead: list[WebSocket] = []
    for socket in sockets:
        try:
            await socket.send_json(payload)
        except Exception:
            # A send failing means the peer is gone; reap rather than retry.
            dead.append(socket)

    if dead:
        async with _lock:
            for socket in dead:
                _rooms[conversation_id].discard(socket)


def _persist(conversation_id: int, sender_id: int, body: str) -> dict[str, Any] | None:
    """Write the message and return the wire payload."""
    db = SessionLocal()
    try:
        conversation = db.get(Conversation, conversation_id)
        if conversation is None:
            return None

        now = datetime.now(timezone.utc)
        message = Message(
            conversation_id=conversation_id, sender_id=sender_id, body=body
        )
        db.add(message)
        conversation.last_message_at = now
        # Sending implies having read what came before.
        if conversation.customer_id == sender_id:
            conversation.customer_read_at = now
        else:
            conversation.owner_read_at = now
        db.commit()
        db.refresh(message)

        sender = db.get(User, sender_id)
        return {
            "type": "message",
            "id": message.id,
            "conversation_id": conversation_id,
            "sender_id": sender_id,
            "sender_name": sender.name if sender is not None else "Former user",
            "body": message.body,
            "created_at": message.created_at.isoformat(),
        }
    finally:
        db.close()


@router.websocket("/ws/conversations/{conversation_id}")
async def conversation_socket(
    websocket: WebSocket, conversation_id: int, ticket: str = ""
) -> None:
    """Live channel for one conversation.

    Closes with 1008 (policy violation) rather than accepting-then-closing on a
    bad ticket, so the client can tell "not allowed" from "dropped".
    """
    resolved = await asyncio.to_thread(_authorise, ticket, conversation_id)
    if resolved is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user, _conversation = resolved
    await websocket.accept()

    async with _lock:
        _rooms[conversation_id].add(websocket)

    try:
        await websocket.send_json({"type": "ready", "user_id": user.id})

        while True:
            data = await websocket.receive_json()
            body = str(data.get("body", "")).strip()
            if not body:
                continue
            if len(body) > MAX_BODY_CHARS:
                body = body[:MAX_BODY_CHARS]

            # Blocking DB work off the event loop, or one slow write stalls
            # every other socket this worker is serving.
            payload = await asyncio.to_thread(_persist, conversation_id, user.id, body)
            if payload is not None:
                await _broadcast(conversation_id, payload)

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("chat socket failed for conversation %s", conversation_id)
    finally:
        async with _lock:
            _rooms[conversation_id].discard(websocket)
            if not _rooms[conversation_id]:
                del _rooms[conversation_id]
