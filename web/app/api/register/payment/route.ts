/**
 * Business registration, step 3: pay for the chosen plan (test mode), which
 * completes registration.
 *
 * The amount is not sent: the backend charges what its own order summary
 * says. The card is forwarded and nothing else is done with it - not logged,
 * not stored, not echoed back.
 */

import { NextRequest, NextResponse } from "next/server";

import { payForRegistration } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";
import type { RegistrationPaymentRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RegistrationPaymentRequest;
  try {
    body = (await req.json()) as RegistrationPaymentRequest;
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  try {
    const state = await payForRegistration({
      card_number: String(body.card_number ?? ""),
      exp_month: Number(body.exp_month),
      exp_year: Number(body.exp_year),
      cvc: String(body.cvc ?? ""),
      cardholder_name: typeof body.cardholder_name === "string" ? body.cardholder_name : null,
      accept_terms: body.accept_terms === true,
    });
    return NextResponse.json({ state }, { status: 200 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
