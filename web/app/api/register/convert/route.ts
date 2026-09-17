/**
 * Business registration, step 1, for a signed-in customer.
 *
 * Their account becomes a business account. The token does not change, but
 * the role cached in the session cookie does - middleware reads it - so the
 * cookies are written again from the account as it now is.
 */

import { NextRequest, NextResponse } from "next/server";

import { convertToBusinessAccount, getMe } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";
import { ACCESS_TOKEN_COOKIE } from "@/lib/cookies";
import { setSessionCookies } from "@/lib/session-cookies";
import type { RegistrationDetailsUpdate } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ detail: "Sign in to continue." }, { status: 401 });
  }

  let body: RegistrationDetailsUpdate;
  try {
    body = (await req.json()) as RegistrationDetailsUpdate;
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  try {
    const state = await convertToBusinessAccount(body);
    const user = await getMe(token);
    const res = NextResponse.json({ state }, { status: 200 });
    setSessionCookies(res, token, user);
    return res;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
