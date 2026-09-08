/**
 * Upload one KYC document, and return the URL that goes on the form.
 *
 * The backend presigns a PUT straight to object storage so that FastAPI never
 * handles document bytes. The browser still cannot make that PUT itself: the
 * signed URL points at the storage host, which is a different origin, and
 * whether it answers a preflight is a property of whatever bucket the
 * deployment happens to use. So this handler stands in the middle - it asks
 * for the signature as the signed-in owner, then streams the file to it.
 *
 * The bytes pass through the Next server, not the API. If a deployment's
 * storage is configured to allow the browser's origin, this handler can be
 * replaced by handing `upload_url` to the client and letting it PUT directly;
 * the contract the form sees would not change.
 */

import { NextRequest, NextResponse } from "next/server";

import { ApiError, presignDocument } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Matches ALLOWED_DOCUMENT_CONTENT_TYPES in app/services/storage.py. */
const ACCEPTED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);

/**
 * A licence scan is a page, not a video. The backend does not enforce a size -
 * a presigned PUT goes straight to storage - so the limit lives here, where
 * the bytes actually pass through something we control.
 */
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { detail: "Expected a multipart upload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const businessId = Number(form.get("business_id"));
  const purpose = String(form.get("purpose") ?? "document");

  if (!(file instanceof File)) {
    return NextResponse.json({ detail: "No file was sent." }, { status: 400 });
  }
  if (!Number.isInteger(businessId) || businessId < 1) {
    return NextResponse.json(
      { detail: "A numeric `business_id` is required." },
      { status: 400 },
    );
  }
  if (!ACCEPTED.has(file.type)) {
    return NextResponse.json(
      { detail: "Upload a PDF, JPEG, PNG, HEIC or WebP." },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { detail: "That file is over 10 MB. Please upload a smaller scan." },
      { status: 413 },
    );
  }

  let presigned;
  try {
    // Owner-scoped server-side: the backend refuses a business_id this account
    // does not own, so a forged field in the form cannot write elsewhere.
    presigned = await presignDocument({
      business_id: businessId,
      filename: file.name,
      content_type: file.type,
      purpose,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message },
        { status: error.status === 0 ? 502 : error.status },
      );
    }
    throw error;
  }

  // Stub mode: storage is not configured, so there is nowhere to put the
  // bytes. The document_url is a stable placeholder and the form still works -
  // that is the point of the stub. Say so rather than pretending it uploaded.
  if (presigned.stub) {
    return NextResponse.json(
      {
        document_url: presigned.document_url,
        stub: true,
        detail:
          "Document storage is not configured, so the file was not stored. " +
          "The reference was recorded and the form can be submitted.",
      },
      { status: 200 },
    );
  }

  try {
    const upload = await fetch(presigned.upload_url, {
      method: "PUT",
      // The Content-Type is part of what was signed; changing it here breaks
      // the signature.
      headers: { "Content-Type": file.type },
      body: await file.arrayBuffer(),
    });

    if (!upload.ok) {
      return NextResponse.json(
        { detail: `Storage rejected the upload (HTTP ${upload.status}).` },
        { status: 502 },
      );
    }
  } catch (cause) {
    return NextResponse.json(
      {
        detail:
          "Could not reach document storage. " +
          (cause instanceof Error ? cause.message : String(cause)),
      },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { document_url: presigned.document_url, stub: false, filename: file.name },
    { status: 201 },
  );
}
