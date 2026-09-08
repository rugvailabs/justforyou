/**
 * Receives a JWT from the client after a successful signup/login and stores it
 * as an httpOnly cookie. Client components cannot set httpOnly cookies, which
 * is why this round-trip through a route handler exists.
 */

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { ACCESS_TOKEN_COOKIE, ACCESS_TOKEN_MAX_AGE } from "@/lib/cookies";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let token: unknown;
  try {
    ({ token } = await req.json());
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body" }, { status: 400 });
  }

  if (typeof token !== "string" || token.split(".").length !== 3) {
    return NextResponse.json(
      { detail: "A JWT string is required in the `token` field" },
      { status: 400 },
    );
  }

  (await cookies()).set(ACCESS_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Local dev is plain http, so Secure would stop the cookie being stored.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });

  return NextResponse.json({ ok: true });
}
