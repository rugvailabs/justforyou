/**
 * Same-origin bridge for lead capture.
 *
 * The browser cannot POST to :8000 (no CORS), and a signed-in visitor's JWT is
 * in an httpOnly cookie it cannot read. This handler runs server-side, so
 * lib/api.ts picks the token out of the cookie jar when there is one - which
 * is what attributes the lead to a logged-in customer. Anonymous visitors
 * simply have no cookie and the enquiry is stored without a user_id.
 */

import { NextRequest, NextResponse } from "next/server";

import { ApiError, createEnquiry } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { EnquiryCreate } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPES = new Set(["call_click", "callback", "quote", "chat"]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: EnquiryCreate & { business_id?: number };
  try {
    body = (await req.json()) as EnquiryCreate & { business_id?: number };
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  const { business_id: businessId, ...enquiry } = body;
  if (typeof businessId !== "number") {
    return NextResponse.json(
      { detail: "A numeric `business_id` is required." },
      { status: 400 },
    );
  }
  if (!TYPES.has(String(enquiry.enquiry_type))) {
    return NextResponse.json({ detail: "Unknown enquiry type." }, { status: 400 });
  }

  try {
    // undefined when signed out - the enquiry is then anonymous, which the
    // backend explicitly allows.
    const ack = await createEnquiry(businessId, enquiry, getAccessToken());
    return NextResponse.json(ack, { status: 201 });
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
