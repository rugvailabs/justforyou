/**
 * Server-side session helpers.
 *
 * Import only from Server Components, Server Actions and route handlers - this
 * module reads httpOnly cookies through next/headers.
 *
 * On roles: the backend's JWT carries only `sub`, `exp` and `iat`
 * (app/core/security.py), so a role CANNOT be decoded from the token. The only
 * role signal the API exposes is `is_admin` on GET /api/v1/me. We cache it in
 * a separate httpOnly cookie at sign-in so the edge middleware can gate
 * /admin without a network round-trip on every request; `getCurrentUser()`
 * re-reads the authoritative value from the backend whenever it matters.
 */

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getMe, ApiError } from "@/lib/api";
import { ACCESS_TOKEN_COOKIE, ROLE_COOKIE, type Role } from "@/lib/cookies";
import { decodeAccessToken, isTokenExpired } from "@/lib/jwt";
import type { UserResponse } from "@/lib/types";

const KNOWN_ROLES: readonly Role[] = ["customer", "business_owner", "admin"];

/** The cached role, defaulting to the least-privileged value. */
function readRoleCookie(): Role {
  const value = cookies().get(ROLE_COOKIE)?.value;
  return KNOWN_ROLES.includes(value as Role) ? (value as Role) : "customer";
}

export interface Session {
  /** The raw JWT, as stored in the httpOnly cookie. */
  token: string;
  /** `sub` decoded to a number - the backend stores the user id as a string. */
  userId: number;
  /** Expiry as a Date, from the `exp` claim. */
  expiresAt: Date;
  /**
   * Role as cached at sign-in. A hint for rendering, not an authorisation
   * decision - use `requireAdmin()` when it must be right.
   */
  role: Role;
}

/** The raw JWT, or undefined when signed out. */
export function getAccessToken(): string | undefined {
  return cookies().get(ACCESS_TOKEN_COOKIE)?.value;
}

/**
 * The current session, read entirely from cookies - no network call.
 *
 * Returns null when there is no cookie, or the token is malformed or expired.
 */
export function getSession(): Session | null {
  const token = getAccessToken();
  if (!token || isTokenExpired(token)) return null;

  const claims = decodeAccessToken(token);
  if (claims === null) return null;

  const userId = Number.parseInt(claims.sub, 10);
  if (!Number.isFinite(userId)) return null;

  return {
    token,
    userId,
    expiresAt: new Date(claims.exp * 1000),
    role: readRoleCookie(),
  };
}

/** True when a usable token is present. */
export function isAuthenticated(): boolean {
  return getSession() !== null;
}

/**
 * The signed-in user, straight from GET /api/v1/me - the authoritative answer,
 * including `is_admin`.
 *
 * Returns null when signed out or the backend rejects the token. Wrapped in
 * React's `cache` so several components in one render share a single call.
 */
export const getCurrentUser = cache(async (): Promise<UserResponse | null> => {
  const session = getSession();
  if (session === null) return null;

  try {
    return await getMe(session.token);
  } catch (error) {
    // 401 means the token is stale or forged: treat as signed out.
    if (error instanceof ApiError && error.isUnauthorized) return null;
    throw error;
  }
});

/** Build the /login URL, flagging the "signed in but refused" dead end. */
function loginUrl(returnTo: string | undefined, forbidden: boolean): string {
  const params = new URLSearchParams();
  if (returnTo) params.set("next", returnTo);
  if (forbidden) params.set("forbidden", "1");
  const qs = params.toString();
  return qs ? `/login?${qs}` : "/login";
}

/**
 * Require a signed-in user, or redirect to /login.
 *
 * A cookie that the backend rejects (stale token, rotated SECRET_KEY) counts
 * as `forbidden` rather than signed-out: the cookie still parses, so /login
 * would otherwise treat them as signed in and redirect back here in a loop.
 * The forbidden panel gives them a Sign out button, which is the way out.
 *
 * @param returnTo path to come back to after signing in.
 */
export async function requireUser(returnTo?: string): Promise<UserResponse> {
  const user = await getCurrentUser();
  if (user === null) {
    redirect(loginUrl(returnTo, getSession() !== null));
  }
  return user;
}

/**
 * Require a business owner, verified against the backend.
 *
 * Admins pass too, so they can administer any listing. Like requireAdmin this
 * checks /me rather than the cached cookie, because the cookie is only a hint.
 */
export async function requireBusinessOwner(
  returnTo?: string,
): Promise<UserResponse> {
  const user = await requireUser(returnTo);
  if (user.role !== "business_owner" && user.role !== "admin" && !user.is_admin) {
    redirect(loginUrl(returnTo, true));
  }
  // A business account that has not finished registering has no listing and
  // no plan yet; the backend refuses its dashboard calls, so send it back to
  // finish rather than render a page of errors.
  if (!user.is_active) redirect("/register");
  return user;
}

/**
 * Require an admin, verified against the backend rather than the role cookie.
 *
 * Non-admins are sent to /login rather than shown a 403, matching the brief.
 */
export async function requireAdmin(returnTo?: string): Promise<UserResponse> {
  const user = await requireUser(returnTo);
  if (!user.is_admin) {
    // Signed in, just not an admin - always the forbidden dead end.
    redirect(loginUrl(returnTo, true));
  }
  return user;
}
