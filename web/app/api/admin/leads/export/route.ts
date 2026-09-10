/**
 * Streams the leads CSV out of FastAPI under our own origin.
 *
 * A plain <a href> to :8000 cannot work: the JWT lives in an httpOnly cookie
 * this origin owns, and the API has no CORS. So the browser asks us, we attach
 * the token server-side, and the file comes back with its Content-Disposition
 * intact so the download names itself.
 *
 * The body is passed through rather than parsed - it is a file, and reading it
 * into memory here to hand it straight on would be pure waste.
 */

import { NextRequest, NextResponse } from "next/server";

import { API_BASE_URL } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const token = getAccessToken();
  if (token === undefined) {
    return NextResponse.json({ detail: "Sign in as an admin." }, { status: 401 });
  }

  // Only the filters the endpoint accepts; anything else is dropped rather
  // than forwarded into a query string we do not control.
  const incoming = req.nextUrl.searchParams;
  const forward = new URLSearchParams();
  for (const key of ["enquiry_type", "business_id"]) {
    const value = incoming.get(key);
    if (value) forward.set(key, value);
  }

  const suffix = forward.toString();
  const upstream = await fetch(
    `${API_BASE_URL}/admin/enquiries/export${suffix ? `?${suffix}` : ""}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );

  if (!upstream.ok) {
    return NextResponse.json(
      { detail: "Could not build the export." },
      { status: upstream.status },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "text/csv; charset=utf-8",
      "Content-Disposition":
        upstream.headers.get("content-disposition") ?? 'attachment; filename="leads.csv"',
      "Cache-Control": "no-store",
    },
  });
}
