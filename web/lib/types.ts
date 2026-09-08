/**
 * TypeScript mirrors of the backend's Pydantic schemas.
 *
 * Source of truth is http://localhost:8000/openapi.json (FastAPI, title
 * "justdial-ca"). Names here match the backend's schema names exactly so the
 * two can be diffed by eye when the API changes.
 */

/* ------------------------------------------------------------------ enums */

/** app/models/user.py - how a user wants to be contacted. */
export type PreferredContactMethod = "email" | "sms" | "phone";

export type ConsentType = "record_audio" | "send_email" | "send_sms";

/** How the caller described their problem. */
export type InputType = "text" | "audio";

export type SubmissionStatus =
  | "SUBMITTED"
  | "UPLOADED"
  | "TRANSCRIBED"
  | "EXTRACTED"
  | "MATCHED"
  | "SENT"
  | "SOLVED"
  | "APPROVED"
  | "NEEDS_REVIEW";

/* ------------------------------------------------------------------- auth */

/** POST /api/v1/signup */
export interface SignupRequest {
  /** 1-255 chars. */
  name: string;
  email: string;
  /** 8-72 chars - bcrypt truncates beyond 72 bytes. */
  password: string;
  /** Optional, max 32 chars. */
  phone?: string | null;
  /** Defaults to "email" server-side. */
  preferred_contact_method?: PreferredContactMethod;
}

/** POST /api/v1/login */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Returned by both /signup and /login.
 *
 * NOTE: the backend issues a single access token and no refresh token, so
 * there is no `TokenPair` to model. The JWT expires 60 minutes after issue
 * (ACCESS_TOKEN_EXPIRE_MINUTES in app/core/security.py); when it lapses the
 * user signs in again.
 */
export interface TokenResponse {
  access_token: string;
  /** Always "bearer". */
  token_type?: string;
}

/** GET /api/v1/me - the authenticated user. */
export interface UserResponse {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  preferred_contact_method: PreferredContactMethod;
  /** The only role signal the API exposes. It is NOT a JWT claim. */
  is_admin: boolean;
  /** ISO-8601 timestamp. */
  created_at: string;
}

/**
 * Claims actually present in the JWT, per app/core/security.py.
 *
 * `create_access_token` is called as `create_access_token({"sub": str(user.id)})`
 * and adds only `exp` and `iat`. There is deliberately no role/is_admin claim -
 * authorisation comes from GET /api/v1/me.
 */
export interface AccessTokenClaims {
  /** The user id, as a string (RFC 7519 requires `sub` to be a string). */
  sub: string;
  /** Expiry, seconds since epoch. */
  exp: number;
  /** Issued-at, seconds since epoch. */
  iat: number;
}

/* --------------------------------------------------------------- consents */

export interface ConsentResponse {
  id: number;
  consent_type: ConsentType;
  granted: boolean;
  policy_version: string;
  granted_at: string | null;
  revoked_at: string | null;
}

export interface ConsentGrantRequest {
  consent_type: ConsentType;
  policy_version: string;
}

/* ------------------------------------------------------------- API errors */

/** FastAPI's error envelope: `{"detail": ...}`. */
export interface ApiErrorPayload {
  detail?: unknown;
  [key: string]: unknown;
}

/** One entry of a 422 validation error from FastAPI. */
export interface ValidationErrorItem {
  loc: (string | number)[];
  msg: string;
  type: string;
}

/* -------------------------------------------------------------- directory */

/** Ordering accepted by /businesses/search. */
export type BusinessSort =
  | "relevance"
  | "rating"
  | "reviews"
  | "distance"
  | "name"
  | "newest";

/** GET /api/v1/categories */
export interface Category {
  id: number;
  name: string;
  slug: string;
  /** null for a root category. The taxonomy supports nesting; the seed is flat. */
  parent_id: number | null;
  description: string | null;
  /** Emoji rendered by the category grid. */
  icon: string | null;
  /** Active listings directly in this category. */
  business_count: number;
}

/** One row of GET /api/v1/businesses/search */
export interface BusinessListItem {
  id: number;
  name: string;
  slug: string;
  category_slug: string;
  category_name: string;
  description: string | null;
  address: string | null;
  city: string;
  province: string;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  /** null means "no reviews yet" - render that, not zero stars. */
  rating: number | null;
  review_count: number;
  verified: boolean;
  /** Only present when the request supplied lat/lng. */
  distance_km: number | null;
}

/** GET /api/v1/businesses/search */
export interface SearchResponse {
  items: BusinessListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

/** Query parameters accepted by searchBusinesses(). */
export interface BusinessSearchParams {
  q?: string;
  category_slug?: string;
  city?: string;
  /** lat and lng must be supplied together; the API 422s otherwise. */
  lat?: number;
  lng?: number;
  /** Requires lat/lng. Max 500. */
  radius_km?: number;
  min_rating?: number;
  sort?: BusinessSort;
  page?: number;
  /** 1-50, default 20. */
  page_size?: number;
}
