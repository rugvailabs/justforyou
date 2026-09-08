/**
 * Typed fetch wrapper around the FastAPI backend.
 *
 * SERVER-SIDE ONLY. Two reasons, both structural:
 *
 *   1. The backend mounts no CORSMiddleware (verified: an OPTIONS preflight to
 *      /api/v1/login returns 405 with no access-control-allow-origin header),
 *      so a browser on :3000 cannot call :8000 directly.
 *   2. The JWT lives in an httpOnly cookie, which client JavaScript cannot
 *      read by design.
 *
 * Call it from Server Components, Server Actions and route handlers. Client
 * components reach the API through our own route handlers instead.
 */

import { ACCESS_TOKEN_COOKIE } from "@/lib/cookies";
import type {
  ApiErrorPayload,
  BusinessSearchParams,
  Category,
  LoginRequest,
  SearchResponse,
  SignupRequest,
  TokenResponse,
  UserResponse,
  ValidationErrorItem,
} from "@/lib/types";

/** Trailing slash trimmed so `${API_BASE_URL}${path}` never doubles up. */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"
).replace(/\/+$/, "");

/* ------------------------------------------------------------------ errors */

export class ApiError extends Error {
  readonly status: number;
  readonly payload: ApiErrorPayload | null;
  /** Set when the body was not JSON at all; holds a truncated copy. */
  readonly rawBody: string | null;

  constructor(
    status: number,
    message: string,
    payload: ApiErrorPayload | null = null,
    rawBody: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.rawBody = rawBody;
  }

  /** No token, or the token expired / was rejected. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Authenticated, but not allowed - e.g. a non-admin hitting /review. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** Signup against an email that already exists. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  /** FastAPI request-validation failure. */
  get isValidationError(): boolean {
    return this.status === 422;
  }

  /** The network never reached the backend. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/**
 * Turn FastAPI's `detail` into one human sentence.
 *
 * `detail` is a plain string for HTTPException, but a list of
 * {loc, msg, type} objects for a 422. Both shapes reach here.
 */
function messageFromPayload(
  status: number,
  payload: ApiErrorPayload | null,
): string {
  const detail = payload?.detail;

  if (typeof detail === "string" && detail.trim() !== "") return detail;

  if (Array.isArray(detail)) {
    const parts = (detail as ValidationErrorItem[])
      .map((item) => {
        // Drop the leading "body"/"query" segment - it means nothing to a user.
        const field = Array.isArray(item?.loc)
          ? item.loc.filter((s) => s !== "body" && s !== "query").join(".")
          : "";
        return field ? `${field}: ${item?.msg ?? ""}` : (item?.msg ?? "");
      })
      .filter(Boolean);
    if (parts.length > 0) return parts.join("; ");
  }

  if (status === 0) return "Could not reach the server. Is the backend running?";
  if (status >= 500) return "The server hit an error. Please try again shortly.";
  return `Request failed (HTTP ${status}).`;
}

/* ----------------------------------------------------------------- request */

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  /** Serialised as JSON. Use `rawBody` for FormData and friends. */
  body?: unknown;
  /** Escape hatch for multipart uploads; passed through untouched. */
  rawBody?: BodyInit;
  /**
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
}

/**
 * Fetch `path` (e.g. "/login") against the API base URL.
 *
 * Resolves with the parsed JSON body on 2xx; throws {@link ApiError} on
 * anything else, including transport failures.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { body, rawBody, auth = true, token, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  if (body !== undefined && !finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (!finalHeaders.has("Accept")) finalHeaders.set("Accept", "application/json");

  if (auth) {
    const bearer = token ?? (await tokenFromCookie());
    if (bearer) finalHeaders.set("Authorization", `Bearer ${bearer}`);
  }

  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: finalHeaders,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
      // Auth responses must never be served from a cache.
      cache: rest.cache ?? "no-store",
    });
  } catch (cause) {
    throw new ApiError(
      0,
      "Could not reach the server. Is the backend running?",
      null,
      cause instanceof Error ? cause.message : String(cause),
    );
  }

  // 204 and friends carry no body.
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    if (res.ok) return undefined as T;
    throw new ApiError(res.status, messageFromPayload(res.status, null));
  }

  const text = await res.text();
  let payload: ApiErrorPayload | null = null;
  let parsed = false;
  try {
    payload = text === "" ? null : (JSON.parse(text) as ApiErrorPayload);
    parsed = true;
  } catch {
    parsed = false;
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      parsed
        ? messageFromPayload(res.status, payload)
        : messageFromPayload(res.status, null),
      parsed ? payload : null,
      parsed ? null : text.slice(0, 500),
    );
  }

  if (!parsed) {
    throw new ApiError(
      res.status,
      "The server returned a malformed response.",
      null,
      text.slice(0, 500),
    );
  }

  return payload as T;
}

/* ------------------------------------------------------------- auth calls */

/**
 * POST /api/v1/login - exchange email + password for a JWT.
 *
 * The backend has no OTP flow; `requestOtp`/`verifyOtp` have no endpoints to
 * call. Auth is email + bcrypt password (app/api/v1/auth.py).
 *
 * @throws {ApiError} 401 when the credentials are wrong.
 */
export function login(payload: LoginRequest): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/login", {
    method: "POST",
    body: payload,
    auth: false,
  });
}

/**
 * POST /api/v1/signup - create an account and get a JWT back (201).
 *
 * @throws {ApiError} 409 when the email is already registered.
 */
export function signup(payload: SignupRequest): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/signup", {
    method: "POST",
    body: payload,
    auth: false,
  });
}

/**
 * GET /api/v1/me - the signed-in user, including the `is_admin` flag that
 * stands in for a role (the JWT itself carries no role claim).
 *
 * Doubles as token validation: a bad or expired JWT yields a 401.
 */
export function getMe(token?: string): Promise<UserResponse> {
  return apiFetch<UserResponse>("/me", { method: "GET", token });
}

/* -------------------------------------------------------- directory calls */

/**
 * GET /api/v1/categories - the category taxonomy.
 *
 * Omit `parentId` for the root level; pass one to get that category's
 * children. Public, so no token is attached.
 */
export function getCategories(parentId?: number): Promise<Category[]> {
  const qs = parentId === undefined ? "" : `?parent_id=${encodeURIComponent(parentId)}`;
  return apiFetch<Category[]>(`/categories${qs}`, { method: "GET", auth: false });
}

/**
 * GET /api/v1/businesses/search - the directory search.
 *
 * Undefined and empty values are dropped rather than sent as blanks, so a
 * cleared filter does not become `city=`. Public, so no token is attached.
 *
 * @throws {ApiError} 422 when lat/lng are not supplied together, when
 * `radius_km` or `sort=distance` are used without a point, or when a value is
 * out of range.
 */
export function searchBusinesses(
  params: BusinessSearchParams = {},
): Promise<SearchResponse> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    qs.set(key, String(value));
  }
  const suffix = qs.toString();
  return apiFetch<SearchResponse>(
    `/businesses/search${suffix ? `?${suffix}` : ""}`,
    { method: "GET", auth: false },
  );
}
