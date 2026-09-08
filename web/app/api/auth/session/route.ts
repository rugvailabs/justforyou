/**
 * Session route handler - the only place the JWT is written to a cookie.
 *
 * Why the browser posts credentials here instead of calling FastAPI directly:
 *
 *   - The backend mounts no CORSMiddleware, so a fetch from :3000 to :8000 is
 *     blocked before it starts (an OPTIONS preflight to /login answers 405).
 *   - The token must land in an httpOnly cookie, and client JavaScript cannot
 *     set one. Doing the exchange here means the JWT never touches the browser.
 *
 * POST accepts three shapes:
 *   { mode: "login",  email, password }
 *   { mode: "signup", name, email, password, phone?, preferred_contact_method? }
 *   { mode: "token",  access_token }   - for a token obtained elsewhere
 *
 * The brief asked this route to take "access/refresh tokens". The backend
 * issues a single access token and no refresh token (TokenResponse in
 * app/schemas/auth.py), so "token" mode takes just the one.
 *
 * DELETE clears the session (sign out).
 * GET reports the current session, for client components that need it.
 */

import { NextRequest, NextResponse } from "next/server";

import { ApiError, getMe, login, signup, verifyOtp } from "@/lib/api";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  ROLE_COOKIE,
} from "@/lib/cookies";
import { isTokenExpired } from "@/lib/jwt";
import type { PreferredContactMethod, TokenResponse, UserResponse } from "@/lib/types";

/** Never cache an auth exchange. */
export const dynamic = "force-dynamic";

interface SessionRequestBody {
  mode?: "login" | "signup" | "token" | "otp";
  email?: unknown;
  password?: unknown;
  name?: unknown;
  phone?: unknown;
  preferred_contact_method?: unknown;
  access_token?: unknown;
  role?: unknown;
  // Shared with signup above; OTP verification reuses `phone`.
  code?: unknown;
}

function bad(detail: string, status = 400): NextResponse {
  return NextResponse.json({ detail }, { status });
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * Attach the session cookies to `res`.
 *
 * `secure` is off outside production because local dev is plain http and
 * Safari drops Secure cookies on an insecure origin - which would break the
 * whole flow. Every other hardening flag stays on in both environments.
 */
function setSessionCookies(
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: SessionRequestBody;
  try {
    body = (await req.json()) as SessionRequestBody;
  } catch {
    return bad("Malformed JSON body.");
  }

  const mode = body.mode ?? (isNonEmptyString(body.access_token) ? "token" : "login");

  let token: string;
  try {
    if (mode === "token") {
      if (!isNonEmptyString(body.access_token)) {
        return bad("`access_token` is required in token mode.");
      }
      token = body.access_token;
      if (isTokenExpired(token)) return bad("That token is malformed or expired.", 401);
    } else if (mode === "otp") {
      // Phone code sign-in. The backend distinguishes its failure modes by
      // status (404 none / 410 expired / 400 wrong / 429 throttled), and
      // those statuses are forwarded untouched so the form can say which.
      if (!isNonEmptyString(body.phone)) return bad("`phone` is required.");
      if (!isNonEmptyString(body.code)) return bad("`code` is required.");

      const issued: TokenResponse = await verifyOtp(
        body.phone,
        body.code,
        isNonEmptyString(body.name) ? body.name : undefined,
      );
      token = issued.access_token;
    } else if (mode === "signup") {
      if (!isNonEmptyString(body.name)) return bad("`name` is required.");
      if (!isNonEmptyString(body.email)) return bad("`email` is required.");
      if (!isNonEmptyString(body.password)) return bad("`password` is required.");

      // Only these two are forwarded. Passing the role straight through would
      // let anyone mint an admin by POSTing {"role":"admin"} here; the backend
      // rejects it too, but this route must not be the thing relying on that.
      const requestedRole =
        body.role === "business_owner" ? "business_owner" : "customer";

      const created: TokenResponse = await signup({
        name: body.name,
        email: body.email,
        password: body.password,
        role: requestedRole,
        phone: isNonEmptyString(body.phone) ? body.phone : null,
        ...(isNonEmptyString(body.preferred_contact_method)
          ? {
              preferred_contact_method:
                body.preferred_contact_method as PreferredContactMethod,
            }
          : {}),
      });
      token = created.access_token;
    } else {
      if (!isNonEmptyString(body.email)) return bad("`email` is required.");
      if (!isNonEmptyString(body.password)) return bad("`password` is required.");

      const issued: TokenResponse = await login({
        email: body.email,
        password: body.password,
      });
      token = issued.access_token;
    }

    // Round-trip through /me: proves the token is genuinely valid and yields
    // the is_admin flag the JWT does not carry.
    const user = await getMe(token);

    const res = NextResponse.json({ user }, { status: 200 });
    setSessionCookies(res, token, user);
    return res;
  } catch (error) {
    if (error instanceof ApiError) {
      // 0 means we never reached FastAPI - report it as a gateway failure
      // rather than passing a nonsense status to NextResponse.
      const status = error.status === 0 ? 502 : error.status;
      return NextResponse.json({ detail: error.message }, { status });
    }
    throw error;
  }
}

/** Sign out: drop both cookies. */
export async function DELETE(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ACCESS_TOKEN_COOKIE);
  res.cookies.delete(ROLE_COOKIE);
  return res;
}

/** Report the current session without exposing the token itself. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token || isTokenExpired(token)) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
  }

  try {
    const user = await getMe(token);
    return NextResponse.json({ authenticated: true, user }, { status: 200 });
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
    }
    throw error;
  }
}
