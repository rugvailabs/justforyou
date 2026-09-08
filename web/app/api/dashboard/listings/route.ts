/**
 * Same-origin bridge for the listing form.
 *
 * The browser cannot POST to the API directly: there is no CORS on the
 * backend, and the JWT lives in an httpOnly cookie that client JS cannot read.
 * This handler runs server-side, so lib/api.ts picks the token out of the
 * cookie jar for it.
 *
 * It forwards the backend's status codes rather than flattening them - a 403
 * from an ownership check has to stay a 403 so the caller can react to it.
 */

import { NextRequest, NextResponse } from "next/server";

import { ApiError, createBusiness, updateBusiness } from "@/lib/api";
import type { BusinessCreate, BusinessUpdate } from "@/lib/types";

export const dynamic = "force-dynamic";

function failure(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    // status 0 means the request never reached FastAPI; NextResponse cannot
    // take 0, so report it as a gateway failure.
    return NextResponse.json(
      { detail: error.message },
      { status: error.status === 0 ? 502 : error.status },
    );
  }
  throw error;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: BusinessCreate;
  try {
    body = (await req.json()) as BusinessCreate;
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  try {
    const created = await createBusiness(body);
    return NextResponse.json({ business: created }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let body: BusinessUpdate & { id?: number };
  try {
    body = (await req.json()) as BusinessUpdate & { id?: number };
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  const { id, ...updates } = body;
  if (typeof id !== "number") {
    return NextResponse.json(
      { detail: "A numeric `id` is required." },
      { status: 400 },
    );
  }

  try {
    const updated = await updateBusiness(id, updates);
    return NextResponse.json({ business: updated }, { status: 200 });
  } catch (error) {
    return failure(error);
  }
}
