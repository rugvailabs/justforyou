/**
 * Business registration: complete on the free plan, which has nothing to pay.
 * The terms still have to be accepted; the backend refuses without them.
 */

import { NextRequest, NextResponse } from "next/server";

import { completeFreeRegistration } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as { accept_terms?: unknown } | null;

  try {
    const state = await completeFreeRegistration(body?.accept_terms === true);
    return NextResponse.json({ state }, { status: 200 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
