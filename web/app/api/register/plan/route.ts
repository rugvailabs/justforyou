/**
 * Business registration, step 2: save the chosen plan.
 *
 * Called the moment "Select" is clicked, so the choice survives a refresh or a
 * closed browser. Choosing again replaces it.
 */

import { NextRequest, NextResponse } from "next/server";

import { chooseRegistrationPlan } from "@/lib/api";
import { apiErrorResponse } from "@/lib/api-error-response";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest): Promise<NextResponse> {
  let planId: unknown;
  try {
    planId = ((await req.json()) as { plan_id?: unknown }).plan_id;
  } catch {
    return NextResponse.json({ detail: "Malformed JSON body." }, { status: 400 });
  }
  if (typeof planId !== "number") {
    return NextResponse.json({ detail: "Choose a plan to continue." }, { status: 400 });
  }

  try {
    const state = await chooseRegistrationPlan(planId);
    return NextResponse.json({ state }, { status: 200 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
