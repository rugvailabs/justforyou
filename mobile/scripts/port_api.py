"""Derive mobile/src/lib/api.ts from web/lib/api.ts.

Run from the mobile/ directory. Everything not listed here is carried across
byte for byte, which is the point: the two clients should differ only where
the platform forces them to.
"""

import io

src = io.open('../web/lib/api.ts', encoding='utf-8').read()

# 1. Header: say what a port is and what changed.
old_header = src[:src.index('import { ACCESS_TOKEN_COOKIE }')]
new_header = '''/**
 * Typed fetch wrapper around the FastAPI backend.
 *
 * A port of web/lib/api.ts. Everything below the transport layer - the error
 * class, the message flattening, the endpoint functions and their contracts -
 * is deliberately unchanged, so a backend change is a diff against one file in
 * each app rather than a hunt through screens.
 *
 * Two things differ, both structural:
 *
 *   1. TOKEN SOURCE. The web client reads an httpOnly cookie, which is why it
 *      can only run server-side. There is no such cookie on a phone: the token
 *      comes from the OS keystore (tokenStore.ts) and this module runs on the
 *      device.
 *   2. CORS DOES NOT APPLY. No CORSMiddleware is what forces the web app to
 *      proxy every call through its own route handlers. A native app is not a
 *      browser origin, so it calls the API directly and needs no proxy.
 */

'''
src = new_header + src[len(old_header):]

# 2. Imports: local paths, and the two modules that replace the cookie jar.
src = src.replace(
    'import { ACCESS_TOKEN_COOKIE } from "@/lib/cookies";\nimport type {',
    'import { API_BASE_URL } from "./config";\n'
    'import { clearToken, getToken } from "./tokenStore";\nimport type {',
    1)
src = src.replace('} from "@/lib/types";', '} from "./types";', 1)

# 3. The base URL moves to config.ts, which resolves the packager's host.
old_base = '''/** Trailing slash trimmed so `${API_BASE_URL}${path}` never doubles up. */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"
).replace(/\\/+$/, "");'''
assert old_base in src
new_base = (
    "/** Resolved in config.ts, which knows the developer machine's LAN "
    "address. */\nexport { API_BASE_URL };"
)
src = src.replace(old_base, new_base, 1)

# 4. A phone loses signal far more often than a browser tab loses its server.
src = src.replace('"Could not reach the server. Is the backend running?"',
                  '"Could not reach the server. Check your connection."')
src = src.replace(
    'if (status === 0) return "Could not reach the server. Is the backend running?";',
    'if (status === 0) return "Could not reach the server. Check your connection.";')

# 5. Swap the cookie reader for the keystore, and add the 401 hook.
old_cookie = '''  /**
   * Attach the JWT. Defaults to true. When no `token` is supplied the cookie
   * jar is read, so this only works inside a request scope.
   */
  auth?: boolean;
  /** Use this token instead of the cookie - e.g. one just returned by /login. */
  token?: string;
}

/** Read the JWT from the httpOnly cookie, if we're inside a request scope. */
async function tokenFromCookie(): Promise<string | undefined> {
  // Imported lazily: a static import of next/headers would poison any module
  // graph that a client component happens to touch.
  const { cookies } = await import("next/headers");
  return cookies().get(ACCESS_TOKEN_COOKIE)?.value;
}'''
assert old_cookie in src
new_cookie = '''  /** Attach the JWT. Defaults to true; the keystore is read when it is. */
  auth?: boolean;
  /** Use this token instead of the keystore - e.g. one just returned by /login. */
  token?: string;
}

/**
 * Called when the backend rejects our token, before the error propagates.
 *
 * The web app answers a 401 by redirecting to /login, which a server component
 * can do mid-render. A phone has nowhere to redirect from: the session provider
 * registers a callback that drops the keystore entry and re-renders signed out,
 * so a token that expired overnight does not leave the UI half-authenticated.
 */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}'''
src = src.replace(old_cookie, new_cookie, 1)

src = src.replace('    const bearer = token ?? (await tokenFromCookie());',
                  '    const bearer = token ?? (await getToken());', 1)

# 6. React Native's fetch has no browser HTTP cache to opt out of.
old_fetch = '''      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
      // Auth responses must never be served from a cache.
      cache: rest.cache ?? "no-store",
    });'''
assert old_fetch in src
src = src.replace(old_fetch, '''      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    });''', 1)

# 7. Act on a rejected token wherever it surfaces.
old_204 = '  // 204 and friends carry no body.'
assert old_204 in src
src = src.replace(old_204, '''  // A rejected token is worth acting on wherever it surfaces, not only on the
  // screen that happened to make the call.
  if (res.status === 401 && auth) {
    await clearToken();
    onUnauthorized?.();
  }

  // 204 and friends carry no body.''', 1)

# 8. Comments that describe the web app rather than this one.
src = src.replace('''/**
 * POST /api/v1/login - exchange email + password for a JWT.
 *
 * The backend has no OTP flow; `requestOtp`/`verifyOtp` have no endpoints to
 * call. Auth is email + bcrypt password (app/api/v1/auth.py).
 *
 * @throws {ApiError} 401 when the credentials are wrong.
 */''', '''/**
 * POST /api/v1/login - exchange email + password for a JWT.
 *
 * Kept for the seeded owner and admin accounts, which have passwords. Phone
 * numbers sign in through requestOtp/verifyOtp instead.
 *
 * @throws {ApiError} 401 when the credentials are wrong.
 */''', 1)

src = src.replace(''' * The access token is deliberately NOT used for the socket: it lives in an
 * httpOnly cookie so XSS cannot lift it, and a URL query string leaks into
 * logs, proxies and referrers. A stolen ticket buys a minute of one
 * conversation instead of the account.''',
''' * The access token is not used for the socket even though this client, unlike
 * the web one, could reach it: a URL query string leaks into logs, proxies and
 * crash reports, and on a phone it lands in the OS network log too. A stolen
 * ticket buys a minute of one conversation instead of the account.''', 1)

src = src.replace(''' * Defaults to pending, oldest first, so the longest-waiting owner surfaces
 * first - the opposite of every other list in this API.''',
''' * Defaults to pending, oldest first, so the longest-waiting owner surfaces
 * first - the opposite of every other list in this API.
 *
 * No mobile screen calls this: moderation stays on the web, where a decision
 * gets a full listing in front of it. Ported anyway so the two clients keep
 * one shape - an endpoint present in one file and missing from the other is
 * how they start to drift.''', 1)

src = src.replace('''/**
 * GET /api/v1/me - the signed-in user, including the `is_admin` flag that
 * stands in for a role (the JWT itself carries no role claim).''',
'''/**
 * GET /api/v1/me - the signed-in user, including the `role` the tab bar keys
 * off (the JWT itself carries no role claim).''', 1)

io.open('src/lib/api.ts', 'w', encoding='utf-8', newline='').write(src)
print('wrote src/lib/api.ts:', len(src.splitlines()), 'lines')
