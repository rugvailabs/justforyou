/**
 * Mints a WebSocket ticket for the caller.
 *
 * Runs server-side so the session cookie can be exchanged for a ticket
 * without the access token ever reaching the browser. The client asks here,
 * gets 60 seconds of one conversation, and spends it opening the socket.
 */

import { NextRequest, NextResponse } from "next/server";

import { ApiError, getWsTicket } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { conversation_id?: unknown };
  try {
    body = (await req.json()) as { conversation_id?: unknown };
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  if (typeof body.conversation_id !== "number") {
    return NextResponse.json(
      { detail: "A numeric `conversation_id` is required." },
      { status: 400 },
    );
  }

  try {
    const ticket = await getWsTicket(body.conversation_id);
    return NextResponse.json(ticket, { status: 200 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message },
        { status: error.status === 0 ? 502 : error.status },
      );
    }
    throw error;
  }
}
