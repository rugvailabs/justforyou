/**
 * Writing the session cookies onto a response.
 *
 * Shared by the two route handlers that sign somebody in: /api/auth/session
 * (sign in, sign up) and /api/register (business registration, which creates
 * the account in step 1). Both must set exactly the same cookies, or the edge
 * middleware and the server helpers would disagree about who is signed in.
 */

import type { NextResponse } from "next/server";

import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  ROLE_COOKIE,
} from "@/lib/cookies";
import type { UserResponse } from "@/lib/types";

/**
 * Attach the session cookies to `res`.
 *
 * `secure` is off outside production because local dev is plain http and
 * Safari drops Secure cookies on an insecure origin - which would break the
 * whole flow. Every other hardening flag stays on in both environments.
 */
export function setSessionCookies(
  res: NextResponse,
  token: string,
  user: UserResponse,
): void {
  const common = {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_TOKEN_MAX_AGE,
  };

  res.cookies.set(ACCESS_TOKEN_COOKIE, token, common);
  // Role is cached so middleware can gate /admin without calling the backend.
  // is_admin still wins: it is the authority for the review console, and a
  // user can be flagged admin without role having been migrated.
  res.cookies.set(ROLE_COOKIE, user.is_admin ? "admin" : user.role, common);
}
