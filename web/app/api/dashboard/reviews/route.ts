/**
 * Same-origin bridge for owner replies.
 *
 * The browser cannot POST to :8000 (no CORS) and cannot read the httpOnly JWT
 * cookie, so the reply goes through here. Backend status codes are forwarded
 * unchanged - a 403 from the ownership check has to stay a 403.
 */

import { NextRequest, NextResponse } from "next/server";

import { ApiError, replyToReview } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { business_id?: number; review_id?: number; reply?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  const { business_id: businessId, review_id: reviewId, reply } = body;
  if (typeof businessId !== "number" || typeof reviewId !== "number") {
    return NextResponse.json(
      { detail: "Numeric `business_id` and `review_id` are required." },
      { status: 400 },
    );
  }
  if (typeof reply !== "string" || reply.trim() === "") {
    return NextResponse.json({ detail: "A reply is required." }, { status: 400 });
  }

  try {
    const updated = await replyToReview(businessId, reviewId, reply.trim());
    return NextResponse.json({ review: updated }, { status: 200 });
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
