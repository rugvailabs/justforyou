/**
 * Turn a failed backend call into the route handler's response.
 *
 * Keeps the backend's status and message, so a 402 decline or a 409 duplicate
 * email reaches the page as itself. Status 0 means FastAPI was never reached;
 * NextResponse cannot send 0, so that becomes a 502. Anything that is not an
 * ApiError is a bug and is rethrown.
 */

import { NextResponse } from "next/server";

import { ApiError } from "@/lib/api";

export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { detail: error.message },
      { status: error.status === 0 ? 502 : error.status },
    );
  }
  throw error;
}
