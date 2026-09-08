/**
 * Same-origin bridge for chat.
 *
 * The browser cannot reach :8000 (no CORS) and cannot read the httpOnly JWT,
 * so both polling and sending go through here.
 *
 * GET  ?conversation_id=&after_id=   messages the client has not seen
 * POST { conversation_id, body }     send
 * POST { conversation_id, read }     mark read
 */

import { NextRequest, NextResponse } from "next/server";

import { ApiError, getNewMessages, markConversationRead, sendMessage } from "@/lib/api";

export const dynamic = "force-dynamic";

function fail(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { detail: error.message },
      { status: error.status === 0 ? 502 : error.status },
    );
  }
  throw error;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const conversationId = Number(req.nextUrl.searchParams.get("conversation_id"));
  const afterId = Number(req.nextUrl.searchParams.get("after_id") ?? 0);

  if (!Number.isInteger(conversationId) || conversationId < 1) {
    return NextResponse.json(
      { detail: "A numeric `conversation_id` is required." },
      { status: 400 },
    );
  }

  try {
    const messages = await getNewMessages(
      conversationId,
      Number.isFinite(afterId) && afterId > 0 ? afterId : 0,
    );
    return NextResponse.json({ messages }, { status: 200 });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { conversation_id?: number; body?: string; read?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  const conversationId = body.conversation_id;
  if (typeof conversationId !== "number") {
    return NextResponse.json(
      { detail: "A numeric `conversation_id` is required." },
      { status: 400 },
    );
  }

  try {
    if (body.read === true) {
      const conversation = await markConversationRead(conversationId);
      return NextResponse.json({ conversation }, { status: 200 });
    }

    if (typeof body.body !== "string" || body.body.trim() === "") {
      return NextResponse.json({ detail: "A message is required." }, { status: 400 });
    }
    const message = await sendMessage(conversationId, body.body.trim());
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
