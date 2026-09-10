/**
 * Same-origin bridge for support messages.
 *
 * The browser cannot POST to :8000 (no CORS). Auth is optional: a signed-in
 * sender is attributed via the cookie, and an anonymous one is accepted -
 * the person best placed to report that sign-up is broken is someone who
 * could not complete one.
 */

import { NextRequest, NextResponse } from "next/server";

import { ApiError, createSupportMessage } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { SupportKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const KINDS = new Set<SupportKind>(["enquiry", "feedback", "bug"]);

function text(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.length > max ? undefined : trimmed;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  const kind = body.kind as SupportKind;
  if (!KINDS.has(kind)) {
    return NextResponse.json({ detail: "Unknown message type." }, { status: 400 });
  }

  const email = text(body.email, 320);
  if (email === undefined || email === null || !email.includes("@")) {
    return NextResponse.json(
      { detail: "A valid email address is required so we can reply." },
      { status: 400 },
    );
  }

  const message = text(body.message, 5000);
  if (message === undefined || message === null) {
    return NextResponse.json(
      { detail: "Tell us what is going on - the message cannot be empty." },
      { status: 400 },
    );
  }

  const name = text(body.name, 255);
  const subject = text(body.subject, 255);
  const pageUrl = text(body.page_url, 2048);
  const userAgent = text(body.user_agent, 512);
  if ([name, subject, pageUrl, userAgent].some((v) => v === undefined)) {
    return NextResponse.json({ detail: "One of those fields is too long." }, { status: 400 });
  }

  try {
    const accepted = await createSupportMessage(
      {
        kind,
        email,
        message,
        name: name ?? null,
        subject: subject ?? null,
        page_url: pageUrl ?? null,
        user_agent: userAgent ?? null,
      },
      getAccessToken(),
    );
    return NextResponse.json(accepted, { status: 201 });
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
