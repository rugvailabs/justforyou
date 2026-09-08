/**
 * Same-origin bridge for the KYC form.
 *
 * Same reasoning as the listing bridge: the browser cannot POST to :8000
 * directly (no CORS on the backend, and the JWT is an httpOnly cookie client
 * JS cannot read), so this runs server-side where lib/api.ts can read the
 * cookie jar.
 *
 * Backend status codes are forwarded rather than flattened - a 403 from the
 * ownership check has to stay a 403, and a 422 carries the field-level reason
 * the form shows.
 */

import { NextRequest, NextResponse } from "next/server";

import { ApiError, submitVerification } from "@/lib/api";
import type { VerificationSubmit } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Body extends VerificationSubmit {
  business_id?: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  const { business_id: businessId, ...payload } = body;
  if (typeof businessId !== "number") {
    return NextResponse.json(
      { detail: "A numeric `business_id` is required." },
      { status: 400 },
    );
  }

  try {
    const verification = await submitVerification(businessId, payload);
    return NextResponse.json({ verification }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      // status 0 means the request never reached FastAPI; NextResponse cannot
      // take 0, so report it as a gateway failure.
      return NextResponse.json(
        { detail: error.message },
        { status: error.status === 0 ? 502 : error.status },
      );
    }
    throw error;
  }
}
