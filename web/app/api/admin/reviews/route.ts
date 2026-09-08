/**
 * Same-origin bridge for deleting a review.
 *
 * Separate from /api/admin/moderate, which changes a listing's status. This
 * one destroys content, so it is deliberately its own route rather than
 * another action verb on a shared endpoint.
 */

import { NextRequest, NextResponse } from "next/server";

import { ApiError, deleteReview } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  let body: { review_id?: unknown };
  try {
    body = (await req.json()) as { review_id?: unknown };
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  if (typeof body.review_id !== "number") {
    return NextResponse.json(
      { detail: "A numeric `review_id` is required." },
      { status: 400 },
    );
  }

  try {
    await deleteReview(body.review_id);
    return NextResponse.json({ ok: true }, { status: 200 });
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
