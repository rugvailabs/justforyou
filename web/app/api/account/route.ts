/**
 * Same-origin bridge for profile edits.
 *
 * The browser cannot PATCH :8000 directly (no CORS) and cannot read the
 * httpOnly JWT, so the update goes through here.
 *
 * Only the three fields the API accepts are forwarded. Anything else in the
 * body is dropped rather than passed along - this route must not become a way
 * to set fields the profile endpoint never intended to expose.
 */

import { NextRequest, NextResponse } from "next/server";

import { ApiError, updateProfile } from "@/lib/api";
import type { PreferredContactMethod, ProfileUpdate } from "@/lib/types";

export const dynamic = "force-dynamic";

const CONTACT_METHODS = new Set(["email", "sms", "phone"]);

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }

  const payload: ProfileUpdate = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (name === "") {
      return NextResponse.json(
        { detail: "Your name cannot be empty." },
        { status: 400 },
      );
    }
    payload.name = name;
  }

  // null is meaningful here - it clears the number - so it is forwarded,
  // while undefined leaves the field alone.
  if (body.phone === null) payload.phone = null;
  else if (typeof body.phone === "string") payload.phone = body.phone.trim() || null;

  if (
    typeof body.preferred_contact_method === "string" &&
    CONTACT_METHODS.has(body.preferred_contact_method)
  ) {
    payload.preferred_contact_method =
      body.preferred_contact_method as PreferredContactMethod;
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ detail: "Nothing to update." }, { status: 400 });
  }

  try {
    const user = await updateProfile(payload);
    return NextResponse.json({ user }, { status: 200 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message },
        { status: error.status === 0 ? 502 : error.status },
      );
    }
    throw error;
  }
}
