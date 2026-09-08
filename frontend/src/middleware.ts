/**
 * Route protection. Redirects to /login when the auth cookie is missing or the
 * JWT it holds has already expired.
 *
 * The signature is deliberately NOT verified here: middleware runs on the edge
 * runtime, and the backend already rejects forged tokens with a 401. This is a
 * cheap first gate to avoid rendering a protected page for an obviously
 * logged-out visitor, never the security boundary.
 */

import { NextRequest, NextResponse } from "next/server";

import { ACCESS_TOKEN_COOKIE } from "@/lib/cookies";

const PROTECTED_PREFIXES = [
  "/admin",
  "/profile",
  "/dashboard",
  "/record",
  "/consent",
  "/submissions",
];

function isExpired(token: string): boolean {
  try {
    const [, payload] = token.split(".");
    if (!payload) return true;
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
    if (typeof json.exp !== "number") return false; // no exp claim: let the backend decide
    return json.exp * 1000 <= Date.now();
  } catch {
    return true; // unparseable is treated as unusable
  }
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!needsAuth) return NextResponse.next();

  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token || isExpired(token)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    const res = NextResponse.redirect(url);
    if (token) res.cookies.delete(ACCESS_TOKEN_COOKIE); // clear the stale one
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/profile/:path*",
    "/dashboard/:path*",
    "/record/:path*",
    "/consent/:path*",
    "/submissions/:path*",
  ],
};
