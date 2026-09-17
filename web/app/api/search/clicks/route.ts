/**
 * Same-origin bridge for search click tracking.
 *
 * Called with navigator.sendBeacon as someone leaves a results page, so it
 * must answer quickly and never fail loudly: a lost click is a slightly low
 * number in a report, never an error in front of the person clicking.
 */

import { NextRequest, NextResponse } from "next/server";

import { recordSearchClick } from "@/lib/api";
import type { ClickAction } from "@/lib/types";

export const dynamic = "force-dynamic";

const ACTIONS: ClickAction[] = ["view", "call", "enquire"];

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as {
    search_id?: unknown;
    business_id?: unknown;
    action?: unknown;
  } | null;

  if (
    !body ||
    typeof body.search_id !== "string" ||
    typeof body.business_id !== "number" ||
    !ACTIONS.includes(body.action as ClickAction)
  ) {
    return NextResponse.json({ recorded: false }, { status: 400 });
  }

  try {
    const result = await recordSearchClick({
      search_id: body.search_id,
      business_id: body.business_id,
      action: body.action as ClickAction,
    });
    return NextResponse.json(result, { status: 202 });
  } catch {
    return NextResponse.json({ recorded: false }, { status: 202 });
  }
}
