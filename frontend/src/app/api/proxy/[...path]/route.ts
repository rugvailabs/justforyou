/**
 * Server-side proxy to the FastAPI backend.
 *
 * The browser calls /api/proxy/<path>; this handler reads the httpOnly
 * access_token cookie, attaches it as `Authorization: Bearer ...`, and forwards
 * the request. Two problems solved at once:
 *
 *   1. The JWT stays httpOnly, so client JavaScript can never read it.
 *   2. All browser traffic is same-origin, so the backend needs no CORS
 *      middleware (it currently has none).
 */

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { ACCESS_TOKEN_COOKIE } from "@/lib/cookies";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/** Hop-by-hop and origin-specific headers that must not be forwarded. */
const STRIPPED_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "cookie",
  "content-length",
  "accept-encoding",
]);

async function forward(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await ctx.params;
  const target = `${API_BASE_URL}/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const init: RequestInit = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD") {
    // Buffered rather than streamed: simple and reliable for dev. A very large
    // video will sit in memory here - switch to a streaming body with
    // `duplex: "half"` if that becomes a problem.
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    return NextResponse.json(
      {
        detail:
          `Cannot reach the backend at ${API_BASE_URL}. Is docker-compose up? ` +
          `(${err instanceof Error ? err.message : String(err)})`,
      },
      { status: 502 },
    );
  }

  const body = await upstream.arrayBuffer();
  const res = new NextResponse(body, { status: upstream.status });
  const contentType = upstream.headers.get("content-type");
  if (contentType) res.headers.set("content-type", contentType);
  return res;
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
export const DELETE = forward;
