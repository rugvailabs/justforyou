/**
 * Same-origin bridge for moderation decisions.
 *
 * Backend status codes pass through unchanged: a 403 from require_admin has
 * to stay a 403 so the UI can tell "not allowed" from "went wrong".
 */

import { NextRequest, NextResponse } from "next/server";

import { ApiError, moderateBusiness } from "@/lib/api";
import type { ModerationAction } from "@/lib/types";

export const dynamic = "force-dynamic";

const ACTIONS = new Set<ModerationAction>(["approve", "reject", "suspend"]);
// The API requires a reason for these; rejecting early gives a better message
// than a raw 422.
const NEEDS_REASON = new Set<ModerationAction>(["reject", "suspend"]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { business_id?: number; action?: ModerationAction; reason?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  const { business_id: businessId, action, reason } = body;
  if (typeof businessId !== "number") {
    return NextResponse.json(
      { detail: "A numeric `business_id` is required." },
      { status: 400 },
    );
  }
  if (action === undefined || !ACTIONS.has(action)) {
    return NextResponse.json(
      { detail: "`action` must be approve, reject or suspend." },
      { status: 400 },
    );
  }
  if (NEEDS_REASON.has(action) && (typeof reason !== "string" || reason.trim().length < 3)) {
    return NextResponse.json(
      { detail: "A reason of at least 3 characters is required, and the owner will see it." },
      { status: 400 },
    );
  }

  try {
    const updated = await moderateBusiness(
      businessId,
      action,
      typeof reason === "string" && reason.trim() ? reason.trim() : undefined,
    );
    return NextResponse.json({ business: updated }, { status: 200 });
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
