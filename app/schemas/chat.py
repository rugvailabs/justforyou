"""Schemas for customer-to-business chat."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ConversationStart(BaseModel):
    """Open (or reopen) the thread for a listing."""

    business_id: int


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    conversation_id: int
    sender_id: int
    sender_name: str
    # Which side sent it, resolved per-request against the caller. Saves the
    # front end re-deriving "was this me" from ids it would otherwise need.
    mine: bool
    body: str
    created_at: datetime


class ConversationOut(BaseModel):
    """A thread as one participant sees it.

    Deliberately viewer-relative: `other_party_name` and `unread` mean
    different things to the customer and the owner, and resolving that on the
    server keeps the same component usable for both roles.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    business_name: str
    business_slug: str
    customer_id: int
    # "customer" or "owner" - which side the caller is on.
    my_role: str
    other_party_name: str
    last_message_at: datetime
    last_message_preview: str | None
    unread: int
    created_at: datetime


class ConversationDetail(ConversationOut):
    messages: list[MessageOut]
