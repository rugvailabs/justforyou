"use client";

/**
 * Step 2: choose a plan. Mandatory - there is no way past this step without one.
 *
 * Three cards, in the order the API gives (Annual, Monthly, Basic): name,
 * badge, price, the first three features, "Learn more" and "Select". Select
 * saves the choice immediately, so it survives a refresh, a closed browser or a
 * trip back to step 1. Continuing without a choice shows an error; the
 * payment step is also refused server-side without one.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check, Clock } from "lucide-react";

import { Alert } from "@/components/ds/feedback";
import { Badge, Button, Card } from "@/components/ds/primitives";
import { cn } from "@/lib/cn";
import { formatCad } from "@/lib/format";
import type { Plan } from "@/lib/types";

import PlanDetailsModal from "./PlanDetailsModal";
import { isFree, monthlyCost, priceLabel } from "./planDisplay";

export default function PlanStep({
  plans,
  selectedPlanId: savedPlanId,
}: {
  plans: Plan[];
  /** The plan saved earlier, if any. */
  selectedPlanId: number | null;
}): JSX.Element {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(savedPlanId);
  const [selecting, setSelecting] = useState<number | null>(null);
  const [details, setDetails] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function select(plan: Plan): Promise<boolean> {
    setError(null);
    setSelecting(plan.id);
    try {
      const res = await fetch("/api/register/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: plan.id }),
      });
      if (!res.ok) {
        const payload: unknown = await res.json().catch(() => null);
        setError(
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : `Could not select ${plan.name} (HTTP ${res.status}).`,
        );
        return false;
      }
      setSelected(plan.id);
      // Pin the URL to step 2 before re-rendering: without ?step=2 (arriving
      // from sign-in, say) the page shows the furthest step, which choosing a
      // plan has just made step 3 - and would jump straight to payment.
      router.replace("/register?step=2", { scroll: false });
      router.refresh();
      return true;
    } catch {
      setError("Could not reach the server. Please try again.");
      return false;
    } finally {
      setSelecting(null);
    }
  }

  function onContinue(): void {
    if (selected === null) {
      setError("Choose a plan to continue. Select one of the plans above.");
      return;
    }
    router.push("/register?step=3");
  }

  if (plans.length === 0) {
    return (
      <Alert tone="warning">
        No plans are on offer right now, so registration cannot be finished. Please
        try again later.
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const active = plan.id === selected;
          const price = priceLabel(plan);
          const top = plan.features.slice(0, 3);
          const more = plan.features.length - top.length;
          return (
            <Card
              key={plan.id}
              aria-label={`${plan.name} plan${active ? ", selected" : ""}`}
              className={cn(
                "flex flex-col gap-4 p-5 transition-shadow",
                active && "border-brand-700 ring-2 ring-brand-700",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-card-title text-ink">{plan.name}</h3>
                {plan.badge ? (
                  <Badge tone={isFree(plan) ? "success" : plan.billing_cycle === "yearly" ? "brand" : "neutral"}>
                    {plan.badge}
                  </Badge>
                ) : null}
              </div>

              <div>
                <span className="text-page-title tabular text-ink">{price.amount}</span>
                <span className="text-body text-ink-muted"> {price.per}</span>
                <p className="text-meta tabular text-ink-muted">
                  {isFree(plan)
                    ? "No card needed"
                    : plan.billing_cycle === "yearly"
                      ? `${formatCad(Math.round(monthlyCost(plan) * 100) / 100)} a month, billed yearly · plus GST/HST`
                      : "Billed monthly · plus GST/HST"}
                </p>
              </div>

              <ul className="space-y-2">
                {top.map((feature) => (
                  <li key={feature.label} className="flex items-start gap-2 text-body text-ink">
                    {feature.status === "included" ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                    ) : (
                      <Clock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                    )}
                    <span>
                      {feature.label}
                      {feature.status === "coming_soon" ? (
                        <span className="ml-1 text-meta text-warning">(coming soon)</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              {more > 0 ? (
                <p className="-mt-2 text-meta text-ink-muted">
                  + {more} more {more === 1 ? "feature" : "features"}
                </p>
              ) : null}

              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => setDetails(plan)} className="flex-1">
                  Learn More
                </Button>
                <Button
                  type="button"
                  onClick={() => void select(plan)}
                  disabled={active || selecting !== null}
                  aria-pressed={active}
                  className="flex-1"
                >
                  {active ? (
                    <>
                      <Check aria-hidden="true" />
                      Selected
                    </>
                  ) : selecting === plan.id ? (
                    "Selecting…"
                  ) : (
                    "Select"
                  )}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {error !== null ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost">
          <Link href="/register?step=1">
            <ArrowLeft aria-hidden="true" />
            Back
          </Link>
        </Button>
        <Button size="lg" onClick={onContinue} disabled={selecting !== null}>
          Continue
        </Button>
      </div>

      {details !== null ? (
        <PlanDetailsModal
          plan={details}
          plans={plans}
          selectedPlanId={selected}
          selecting={selecting === details.id}
          onSelect={async (plan) => {
            // The modal closes on selection - but only once it has been saved.
            if (await select(plan)) setDetails(null);
          }}
          onClose={() => setDetails(null)}
        />
      ) : null}
    </div>
  );
}
