/**
 * Same-origin bridge for leaving a review.
 *
 * The browser cannot POST to :8000 (no CORS), and the JWT is in an httpOnly
 * cookie it cannot read. This runs server-side, so lib/api.ts picks the token
 * out of the cookie jar.
 *
 * Unlike an enquiry, a review REQUIRES an account - so a missing cookie is
 * refused here rather than sent on to be refused there. That is not a security
 * boundary (the backend is), it just turns a signed-out submit into an answer
 * the form can act on instead of a round trip.
 *
 * The backend's statuses are forwarded untouched, because each one means
 * something different to the person filling in the form:
 *   403  you own this listing
 *   409  you have already reviewed it
 *   404  the listing is not publicly visible
 */

import { NextRequest, NextResponse } from "next/server";

import { ApiError, createReview } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Body {
  business_id?: unknown;
  rating?: unknown;
  title?: unknown;
  body?: unknown;
}

/** Trim, then treat "" as absent: the column is nullable and "" is not a title. */
function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.length > max ? undefined : trimmed;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = getAccessToken();
  if (token === undefined) {
    return NextResponse.json(
      { detail: "Sign in to leave a review." },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  const businessId = body.business_id;
  if (typeof businessId !== "number" || !Number.isInteger(businessId)) {
    return NextResponse.json(
      { detail: "A numeric `business_id` is required." },
      { status: 400 },
    );
  }

  // Mirrors BusinessReviewCreate: ge=1, le=5, and an integer - a 4.5 would be
  // silently coerced somewhere downstream rather than rejected.
  const rating = body.rating;
  if (
    typeof rating !== "number" ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return NextResponse.json(
      { detail: "Choose a rating from 1 to 5 stars." },
      { status: 400 },
    );
  }

  const title = optionalText(body.title, 255);
  if (title === undefined) {
    return NextResponse.json(
      { detail: "That title is too long (255 characters max)." },
      { status: 400 },
    );
  }

  const text = optionalText(body.body, 5000);
  if (text === undefined) {
    return NextResponse.json(
      { detail: "That review is too long (5000 characters max)." },
      { status: 400 },
    );
  }

  try {
    const review = await createReview(businessId, { rating, title, body: text });
    return NextResponse.json(review, { status: 201 });
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
