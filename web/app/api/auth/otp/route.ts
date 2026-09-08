/**
 * Same-origin bridge for requesting an OTP.
 *
 * Verification goes through /api/auth/session (it ends in a cookie); this
 * route only asks for a code. The backend's 429 and its Retry-After are
 * forwarded untouched, so the form's countdown can be driven by what the
 * server actually enforces rather than a guess.
 */

import { NextRequest, NextResponse } from "next/server";

import { ApiError, requestOtp } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { phone?: unknown };
  try {
    body = (await req.json()) as { phone?: unknown };
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  if (typeof body.phone !== "string" || body.phone.trim() === "") {
    return NextResponse.json({ detail: "A phone number is required." }, { status: 400 });
  }

  try {
    const accepted = await requestOtp(body.phone.trim());
    return NextResponse.json(accepted, { status: 202 });
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
