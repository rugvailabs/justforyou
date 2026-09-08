/** Name of the httpOnly cookie holding the backend JWT. */
export const ACCESS_TOKEN_COOKIE = "jd_access_token";

/**
 * Cookie lifetime in seconds. Matches ACCESS_TOKEN_EXPIRE_MINUTES on the
 * backend (60 minutes), so the cookie and the JWT expire together.
 */
export const ACCESS_TOKEN_MAX_AGE = 60 * 60;
