/**
 * Business registration, step 1.
 *
 *   POST  start: creates the business account (inactive until registration
 *         completes) with the business details, and signs the owner in so
 *         they can carry on - or come back after closing the browser.
 *   PUT   edit the details after going back from a later step.
 *
 * The browser cannot call FastAPI directly (no CORS, and the JWT lives in an
 * httpOnly cookie), so this route does it server-side. Validation is the
 * backend's; its messages come back as they are.
 */

import { NextRequest, NextResponse } from "next/server";

import { getMe, startRegistration, updateRegistrationDetails } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";
import { setSessionCookies } from "@/lib/session-cookies";
import type { RegistrationDetailsUpdate, RegistrationStartRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await readJson<RegistrationStartRequest>(req);
  if (body === null) {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  try {
    const started = await startRegistration(body);
    const user = await getMe(started.access_token);
    const res = NextResponse.json({ state: started.state }, { status: 201 });
    setSessionCookies(res, started.access_token, user);
    return res;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const body = await readJson<RegistrationDetailsUpdate>(req);
  if (body === null) {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  try {
    const state = await updateRegistrationDetails(body);
    return NextResponse.json({ state }, { status: 200 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
