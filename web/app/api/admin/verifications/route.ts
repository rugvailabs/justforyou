/**
 * Same-origin bridge for the two KYC decisions.
 *
 * One handler for both verbs rather than two routes, because they are the same
 * decision with different evidence - and the client sends `action` explicitly
 * so an approval can never be a reject with a missing field.
 *
 * Backend status codes are forwarded rather than flattened: a 403 from a
 * non-admin has to stay a 403, and a 422 carries the reason the form shows.
 */

import { NextRequest, NextResponse } from "next/server";

import { ApiError, approveVerification, rejectVerification } from "@/lib/api";

export const dynamic = "force-dynamic";

interface Body {
  verification_id?: number;
  action?: "approve" | "reject";
  reason?: string;
  note?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  const { verification_id: id, action, reason, note } = body;

  if (typeof id !== "number") {
    return NextResponse.json(
      { detail: "A numeric `verification_id` is required." },
      { status: 400 },
    );
  }
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { detail: "`action` must be approve or reject." },
      { status: 400 },
    );
  }
  // Checked here as well as server-side so the form gets a useful message
  // instead of a 422 shaped like a schema error.
  if (action === "reject" && (reason === undefined || reason.trim().length < 3)) {
    return NextResponse.json(
      { detail: "Give the owner a reason - they have to act on it." },
      { status: 400 },
    );
  }

  try {
    const verification =
      action === "approve"
        ? await approveVerification(id, note?.trim() || undefined)
        : await rejectVerification(id, (reason as string).trim());
    return NextResponse.json({ verification }, { status: 200 });
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
