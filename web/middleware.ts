/**
 * Route protection for /dashboard/* and /admin/*.
 *
 * This is a cheap first gate, NOT the security boundary. It checks that a
 * well-formed, unexpired JWT cookie exists and - for /admin - that the cached
 * role says admin. It cannot verify the signature: the signing secret lives on
 * the backend and never reaches this app. Every protected page still calls
 * requireUser()/requireAdmin(), which ask FastAPI who the caller really is.
 *
 * Both failure cases redirect to /login, per the brief.
 */

import { NextRequest, NextResponse } from "next/server";

import { ACCESS_TOKEN_COOKIE, ROLE_COOKIE } from "@/lib/cookies";
import { isTokenExpired } from "@/lib/jwt";

/** Prefixes that require a signed-in user. */
const PROTECTED_PREFIXES = ["/dashboard", "/admin"];

/** Prefixes that additionally require is_admin. */
const ADMIN_PREFIXES = ["/admin"];

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Send the visitor to /login, remembering where they were headed. */
function redirectToLogin(
  req: NextRequest,
  pathname: string,
  clearCookies: boolean,
  forbidden = false,
): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  // `forbidden` marks "signed in, but not allowed". /login must not honour
  // `next` in that case or the two routes bounce off each other forever.
  url.search =
    `?next=${encodeURIComponent(pathname)}` + (forbidden ? "&forbidden=1" : "");

  const res = NextResponse.redirect(url);
  if (clearCookies) {
    // A stale token would otherwise bounce them again on the next click.
    res.cookies.delete(ACCESS_TOKEN_COOKIE);
    res.cookies.delete(ROLE_COOKIE);
  }
  return res;
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (!matches(pathname, PROTECTED_PREFIXES)) return NextResponse.next();

  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  // Signed out, or the token has lapsed.
  if (!token || isTokenExpired(token)) {
    return redirectToLogin(req, pathname, Boolean(token));
  }

  // Signed in but not an admin.
  if (matches(pathname, ADMIN_PREFIXES)) {
    if (req.cookies.get(ROLE_COOKIE)?.value !== "admin") {
      return redirectToLogin(req, pathname, false, true);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
