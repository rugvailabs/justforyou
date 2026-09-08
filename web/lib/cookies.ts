/**
 * Cookie names and lifetimes shared by the route handler, middleware and the
 * server-side session helpers.
 */

/**
 * httpOnly cookie holding the backend JWT.
 *
 * Prefixed `jd_web_` so it cannot collide with the sibling app in ../frontend,
 * which uses `jd_access_token`. Cookies are scoped by host, not port, so on
 * localhost both apps share one jar and identical names would overwrite each
 * other mid-session.
 */
export const ACCESS_TOKEN_COOKIE = "jd_web_access_token";

/**
 * httpOnly cookie caching `is_admin` from GET /api/v1/me.
 *
 * The JWT carries no role claim, so without this the edge middleware would
 * have to call the backend on every /admin request. It is written once, at
 * sign-in, from a response the backend authored. It is a UX gate only - every
 * admin endpoint re-checks the real user server-side.
 */
export const ROLE_COOKIE = "jd_web_role";

/**
 * Mirrors the backend's UserRole enum. Cached at sign-in so edge middleware
 * can gate /dashboard and /admin without a round trip; the server-side
 * require* helpers re-check against /me, which is what actually counts.
 */
export type Role = "customer" | "business_owner" | "admin";

/**
 * Cookie lifetime in seconds.
 *
 * Matches ACCESS_TOKEN_EXPIRE_MINUTES (60) in app/core/security.py, so the
 * cookie and the JWT inside it lapse together.
 */
export const ACCESS_TOKEN_MAX_AGE = 60 * 60;
