/**
 * Plan display helpers shared by the plan cards, the details modal and the
 * order summary, so a price or a feature status reads the same everywhere.
 */

import { formatCad } from "@/lib/format";
import type { Plan, PlanFeature } from "@/lib/types";

export function isFree(plan: Plan): boolean {
  return Number(plan.amount) <= 0;
}

/** "$29.00 / month", "$290.00 / year", "Free". */
export function priceLabel(plan: Plan): { amount: string; per: string } {
  if (isFree(plan)) return { amount: "Free", per: "" };
  return {
    amount: formatCad(plan.amount) ?? plan.amount,
    per: plan.billing_cycle === "yearly" ? "/ year" : "/ month",
  };
}

/** What the plan costs per month - the yearly price spread over twelve. */
export function monthlyCost(plan: Plan): number {
  const amount = Number(plan.amount);
  return plan.billing_cycle === "yearly" ? amount / 12 : amount;
}

export const FEATURE_STATUS_LABEL: Record<PlanFeature["status"], string> = {
  included: "Included",
  coming_soon: "Coming soon",
};

/**
 * Every feature any plan lists, in first-seen order - the rows of the
 * comparison table. A plan that does not list a feature does not have it.
 */
export function allFeatureLabels(plans: Plan[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const plan of plans) {
    for (const feature of plan.features) {
      if (!seen.has(feature.label)) {
        seen.add(feature.label);
        labels.push(feature.label);
      }
    }
  }
  return labels;
}
