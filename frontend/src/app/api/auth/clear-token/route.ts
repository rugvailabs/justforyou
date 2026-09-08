/** Clears the auth cookie. Used by AuthContext.logout(). */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ACCESS_TOKEN_COOKIE } from "@/lib/cookies";

export async function POST(): Promise<NextResponse> {
  (await cookies()).delete(ACCESS_TOKEN_COOKIE);
  return NextResponse.json({ ok: true });
}
