/**
 * Open one submitted KYC document.
 *
 * A three-step hop, and each step exists for a reason:
 *
 *   browser -> here          the browser has a session cookie, not a bearer
 *                            token, and cannot call :8000 itself
 *   here    -> API           adds the token, admin-only on the API side
 *   API     -> 307           signs the s3:// address at read time, because a
 *                            signature minted at upload expired long ago
 *   here    -> 307 browser   hands the signed URL on, so the file goes
 *                            straight from storage to the reviewer and no
 *                            document bytes pass through this server
 *
 * The signed URL is short-lived, so one that ends up in a screenshot or a log
 * stops working rather than exposing a licence scan indefinitely.
 */

import { NextRequest, NextResponse } from "next/server";

import { ApiError, getVerificationDocumentLink } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Belt and braces: the API is the real gate, but an unauthenticated hit
  // should bounce to login rather than produce a 502 from a failed call.
  await requireAdmin("/admin/verifications");

  const id = Number(req.nextUrl.searchParams.get("id"));
  const kind = req.nextUrl.searchParams.get("kind");

  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json(
      { detail: "A numeric `id` is required." },
      { status: 400 },
    );
  }
  if (kind !== "license" && kind !== "gst") {
    return NextResponse.json(
      { detail: "`kind` must be license or gst." },
      { status: 400 },
    );
  }

  let signed: string | null;
  try {
    signed = await getVerificationDocumentLink(id, kind);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message },
        { status: error.status === 0 ? 502 : error.status },
      );
    }
    throw error;
  }

  if (signed === null) {
    return NextResponse.json(
      {
        detail:
          "That document cannot be opened. Either none was submitted, or it " +
          "was recorded while document storage was unconfigured and no file " +
          "was stored.",
      },
      { status: 409 },
    );
  }

  return NextResponse.redirect(signed, 307);
}
