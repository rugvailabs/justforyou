/**
 * Typed fetch wrapper for the browser.
 *
 * Requests go to the same-origin Next.js proxy at /api/proxy/*, which reads the
 * httpOnly JWT cookie server-side and forwards it to FastAPI as an
 * Authorization header. That keeps the token unreadable by JavaScript and
 * avoids needing CORS on the backend.
 */

export interface ApiErrorPayload {
  detail?: unknown;
  [key: string]: unknown;
}

/** Developer-only context. Never rendered to a user. */
export interface ApiErrorDebug {
  contentType?: string;
  /** Truncated raw body, for the console and bug reports. */
  body?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly payload: ApiErrorPayload | null;
  /** Present when the response could not be parsed as JSON. */
  readonly debug: ApiErrorDebug | null;

  constructor(
    status: number,
    message: string,
    payload: ApiErrorPayload | null,
    debug: ApiErrorDebug | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.debug = debug;
  }

  /** True when the server replied with something that wasn't JSON at all. */
  get isMalformedResponse(): boolean {
    return this.debug !== null;
  }

  /** True when the caller is unauthenticated or the token has expired. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** True when authenticated but not permitted - e.g. a missing consent. */
  get isForbidden(): boolean {
    return this.status === 403;
  }
}

export const PROXY_PREFIX = "/api/proxy";

/**
 * A readable sentence for a response that wasn't JSON at all.
 *
 * A non-JSON body means the request never reached FastAPI, or died on the way
 * back: the Next dev server rendering its own HTML error page, a proxy or
 * gateway timeout, an HTML maintenance page. The body is useless to a user and
 * dumping it on screen shows them a wall of markup, so it is logged for the
 * developer and replaced with something actionable.
 */
function messageForNonJson(status: number): string {
  if (status === 502 || status === 504) {
    return "We can't reach the server right now. Please try again in a moment.";
  }
  if (status >= 500) {
    return "Something went wrong on our end. Please try again in a moment.";
  }
  if (status === 0) {
    return "No response from the server. Check your connection and try again.";
  }
  // A non-JSON 4xx is unusual - most likely a misrouted request.
  return `Unexpected response from the server (HTTP ${status}). Please try again.`;
}

/** True when the body is a page rather than data - HTML, or an XML doctype. */
function looksLikeMarkup(body: string): boolean {
  return /^\s*(<!doctype|<html|<\?xml)/i.test(body);
}

/** Turn FastAPI's `detail` (string, or 422 validation array) into one line. */
function messageFromPayload(payload: ApiErrorPayload | null, status: number): string {
  const detail = payload?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((d) => {
        if (d && typeof d === "object" && "msg" in d) {
          const loc = "loc" in d && Array.isArray(d.loc) ? d.loc.slice(1).join(".") : "";
          return loc ? `${loc}: ${String(d.msg)}` : String(d.msg);
        }
        return String(d);
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  return `Request failed with status ${status}`;
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${PROXY_PREFIX}${path.startsWith("/") ? path : `/${path}`}`;

  const init: RequestInit = {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    cache: "no-store",
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (cause) {
    // The request never completed - offline, DNS, the dev server not running.
    throw new ApiError(0, messageForNonJson(0), null, {
      body: cause instanceof Error ? cause.message : String(cause),
    });
  }

  const text = await res.text();

  // Decide whether this is JSON before trying to parse it, and never let a
  // non-JSON body become a user-facing message. An HTML error page rendered as
  // the login error is how a dead dev server or a proxy timeout used to end up
  // on screen as raw markup.
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("json");

  let payload: ApiErrorPayload | null = null;
  let parseFailed = false;

  if (text && isJson && !looksLikeMarkup(text)) {
    try {
      payload = JSON.parse(text) as ApiErrorPayload;
    } catch {
      parseFailed = true;
    }
  } else if (text) {
    parseFailed = true;
  }

  if (parseFailed) {
    // The raw body is for the developer, not the customer.
    console.error(
      `API ${method} ${url} returned ${res.status} with non-JSON body ` +
        `(content-type: ${contentType || "none"}):`,
      text.slice(0, 2000),
    );
    throw new ApiError(res.status, messageForNonJson(res.status), null, {
      contentType,
      body: text.slice(0, 2000),
    });
  }

  if (!res.ok) {
    throw new ApiError(res.status, messageFromPayload(payload, res.status), payload);
  }
  return payload as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("POST", path, body ?? {});
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>("PATCH", path, body);
}

/* ------------------------------------------------------------------ */
/* Backend response shapes                                             */
/* ------------------------------------------------------------------ */

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserResponse {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  preferred_contact_method: "email" | "sms" | "phone";
  is_admin: boolean;
  created_at: string;
}

export interface ConsentResponse {
  id: number;
  user_id: number;
  consent_type: "record_audio" | "send_email" | "send_sms";
  policy_version: string;
  granted_at: string;
  revoked_at: string | null;
  ip_address: string;
  method: string;
  language: string | null;
}

export interface SubmissionResponse {
  id: number;
  user_id: number;
  input_type: "text" | "audio";
  /** Object-storage key of the audio recording; null for text submissions. */
  video_path: string | null;
  status:
    | "SUBMITTED"
    | "UPLOADED"
    | "TRANSCRIBED"
    | "EXTRACTED"
    | "MATCHED"
    | "SENT"
    | "NEEDS_REVIEW";
  transcript: string | null;
  language_detected: string | null;
  created_at: string;
}

export interface MatchedProvider {
  id: number;
  name: string;
  category: string;
  region: string;
  contact_email: string;
  contact_phone: string | null;
  verified: boolean;
}

export interface SubmissionMatch {
  id: number;
  /** "provider" = a vetted listing; "ai_generated" = still being worked on. */
  match_type: "provider" | "ai_generated";
  solution_text: string;
  needs_human_review: boolean;
  provider: MatchedProvider | null;
}

export interface SubmissionDetail extends SubmissionResponse {
  category: string | null;
  urgency: string | null;
  location: string | null;
  match: SubmissionMatch | null;
}

/* ------------------------------------------------------------------ */
/* Review console                                                      */
/* ------------------------------------------------------------------ */

export interface ReviewStats {
  open_count: number;
  claimed_count: number;
  /** How long the customer waiting longest has waited. */
  oldest_age_hours: number;
  by_reason: Record<string, number>;
  resolved_today: number;
}

export interface ReviewListItem {
  id: number;
  submission_id: number;
  reason: string;
  reason_code: string;
  claimed_by: string | null;
  decision: "approved" | "rejected" | "info_requested" | null;
  resolved_at: string | null;
  submission_status: string;
  age_hours: number;
  preview: string;
}

export interface ReviewDetail extends ReviewListItem {
  claimed_at: string | null;
  decided_by: string | null;
  reviewer_note: string | null;
  input_type: string;
  customer_email: string;
  customer_name: string;
  transcript: string | null;
  category: string | null;
  urgency: string | null;
  location: string | null;
  extraction_json: Record<string, unknown> | null;
  solution_text: string | null;
  /** The AI's version, present only once a reviewer has edited the answer. */
  original_solution_text: string | null;
  solution_json: Record<string, unknown> | null;
  gate_json: { passed?: boolean; reasons?: string[]; checks?: Record<string, boolean> } | null;
  confidence: number | null;
  provider_name: string | null;
  provider_contact: string | null;
}
