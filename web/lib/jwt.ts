/**
 * Pure JWT payload helpers - no Node built-ins, no next/headers.
 *
 * Kept dependency-free so the edge middleware and the Node server runtime can
 * both import it.
 *
 * IMPORTANT: nothing here verifies the signature. The signing secret lives on
 * the backend and never reaches this app, so a decoded payload proves only
 * that someone handed us a well-formed token. Every check built on this is a
 * cheap gate to avoid rendering a page for an obviously signed-out visitor -
 * the backend stays the source of truth and rejects forged tokens with a 401.
 */

import type { AccessTokenClaims } from "@/lib/types";

/** base64url -> UTF-8 string, using whichever primitive the runtime offers. */
function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );

  if (typeof atob === "function") {
    // atob yields latin1; round-trip via bytes so non-ASCII survives.
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(padded, "base64").toString("utf8");
}

/**
 * Decode the claims without verifying the signature.
 *
 * Returns null when the token is not a well-formed JWT, or when it lacks the
 * `sub` claim this backend always sets.
 */
export function decodeAccessToken(token: string): AccessTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const claims = JSON.parse(
      decodeBase64Url(parts[1]),
    ) as Partial<AccessTokenClaims>;
    if (typeof claims?.sub !== "string") return null;
    return claims as AccessTokenClaims;
  } catch {
    return null;
  }
}

/**
 * True when the token is unusable: malformed, or past its `exp`.
 *
 * A token with no `exp` is left for the backend to judge, though this backend
 * always sets one (60 minutes after issue).
 */
export function isTokenExpired(token: string, skewSeconds = 0): boolean {
  const claims = decodeAccessToken(token);
  if (claims === null) return true;
  if (typeof claims.exp !== "number") return false;
  return claims.exp * 1000 <= Date.now() + skewSeconds * 1000;
}
