"use client";

/**
 * Step 3: the order summary, and payment.
 *
 * Every amount on this page comes from the server's order summary - the same
 * computation that decides what is charged - so the total shown is the total
 * taken. Prices are in Canadian dollars with GST/HST for the business's
 * province shown line by line, and a paid plan cannot be bought without
 * ticking the box that states the automatic renewal in plain words.
 *
 * TEST MODE: no payment processor is connected. The card form accepts only
 * the published test numbers and nothing is charged; the page says so before
 * anyone types. A free plan skips the card entirely and completes on the
 * terms alone.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check, Clock, CreditCard, Lock } from "lucide-react";

import { Alert } from "@/components/ds/feedback";
import { Badge, Button, Card, Input, Label } from "@/components/ds/primitives";
import { PROVINCES, formatCad, formatDate } from "@/lib/format";
import type { OrderSummary } from "@/lib/types";

const TEST_CARDS = [
  { number: "4242 4242 4242 4242", result: "Payment succeeds" },
  { number: "4000 0000 0000 0002", result: "Card declined" },
  { number: "4000 0000 0000 9995", result: "Insufficient funds" },
];

function money(amount: string, currency: string): string {
  return `${formatCad(amount) ?? amount} ${currency}`;
}

/** "4242424242424242" -> "4242 4242 4242 4242", as the person types. */
function groupCardNumber(value: string): string {
  return value.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** "1229" -> "12 / 29". */
function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits;
}

export default function PaymentStep({ order }: { order: OrderSummary }): JSX.Element {
  const router = useRouter();
  const { plan } = order;
  const paid = order.requires_payment;
  const provinceName = PROVINCES.find((p) => p.code === order.province)?.en ?? order.province;
  const cycleWord = plan.billing_cycle === "yearly" ? "year" : "month";

  const [cardholder, setCardholder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (!accepted) {
      setError(
        paid
          ? "Tick the box to accept the terms and the automatic renewal."
          : "Tick the box to accept the terms.",
      );
      return;
    }

    let body: Record<string, unknown> = { accept_terms: true };
    if (paid) {
      const expiryDigits = expiry.replace(/\D/g, "");
      if (expiryDigits.length !== 4) {
        setError("Enter the expiry date as MM / YY.");
        return;
      }
      body = {
        ...body,
        card_number: cardNumber,
        exp_month: Number(expiryDigits.slice(0, 2)),
        exp_year: Number(expiryDigits.slice(2)),
        cvc,
        cardholder_name: cardholder,
      };
    }

    setSubmitting(true);
    try {
      const res = await fetch(paid ? "/api/register/payment" : "/api/register/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload: unknown = await res.json().catch(() => null);
        setError(
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : `Could not complete registration (HTTP ${res.status}).`,
        );
        // 409: already complete, or no plan - the page knows which.
        if (res.status === 409) router.refresh();
        return;
      }
      router.push("/register?step=4");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const included = plan.features.filter((f) => f.status === "included");
  const comingSoon = plan.features.filter((f) => f.status === "coming_soon");

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-5 lg:order-2">
        <Card className="space-y-4 p-5 lg:sticky lg:top-20">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-meta text-ink-muted">Order summary</p>
              <h2 className="text-card-title text-ink">{plan.name} plan</h2>
            </div>
            {plan.badge ? <Badge tone={paid ? "brand" : "success"}>{plan.badge}</Badge> : null}
          </div>

          <dl className="space-y-1.5 text-body">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Validity</dt>
              <dd className="text-right text-ink">
                {paid ? order.period_label : "No expiry"}
              </dd>
            </div>
            {order.renews_on ? (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Renews on</dt>
                <dd className="text-right tabular text-ink">{formatDate(order.renews_on)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 border-t border-line pt-2">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd className="tabular text-ink">{money(order.subtotal, order.currency)}</dd>
            </div>
            {order.tax_lines.map((line) => (
              <div key={line.name} className="flex justify-between gap-4">
                <dt className="text-ink-muted">
                  {line.name} ({line.rate}%)
                </dt>
                <dd className="tabular text-ink">{money(line.amount, order.currency)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-line pt-2 font-semibold">
              <dt className="text-ink">{paid ? "Total due today" : "Total"}</dt>
              <dd className="tabular text-ink">{money(order.total, order.currency)}</dd>
            </div>
          </dl>
          {paid ? (
            <p className="text-meta text-ink-muted">
              Tax calculated for {provinceName}.
              {order.uncollected_taxes.length > 0
                ? ` ${order.uncollected_taxes.join(", ")} is not charged.`
                : ""}
            </p>
          ) : null}

          <div>
            <p className="text-meta font-medium text-ink-muted">What you get</p>
            <ul className="mt-1.5 space-y-1.5">
              {included.map((f) => (
                <li key={f.label} className="flex items-start gap-2 text-meta text-ink">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
                  {f.label}
                </li>
              ))}
              {comingSoon.map((f) => (
                <li key={f.label} className="flex items-start gap-2 text-meta text-ink-muted">
                  <Clock className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
                  {f.label} (coming soon)
                </li>
              ))}
            </ul>
          </div>

          <Link href="/register?step=2" className="inline-block text-meta text-brand-700 underline underline-offset-4">
            Change plan
          </Link>
        </Card>
      </div>

      <div className="space-y-5 lg:order-1">
        {paid ? (
          <>
            <Alert tone="warning" title="Test mode">
              No payment processor is connected yet. Nothing is charged and real cards
              are refused - use a test card below with any future expiry date and any
              3-digit security code.
            </Alert>

            <Card className="space-y-4 p-5">
              <h2 className="flex items-center gap-2 text-card-title text-ink">
                <CreditCard className="size-5 text-ink-muted" aria-hidden="true" />
                Card details
              </h2>
              <div>
                <Label htmlFor="pay-name">Name on card</Label>
                <Input id="pay-name" autoComplete="cc-name" maxLength={255} value={cardholder} onChange={(e) => setCardholder(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pay-number">Card number</Label>
                <Input
                  id="pay-number"
                  required
                  inputMode="numeric"
                  autoComplete="cc-number"
                  placeholder="4242 4242 4242 4242"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(groupCardNumber(e.target.value))}
                  className="tabular"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="pay-expiry">Expiry</Label>
                  <Input
                    id="pay-expiry"
                    required
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    placeholder="MM / YY"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    className="tabular"
                  />
                </div>
                <div>
                  <Label htmlFor="pay-cvc">Security code</Label>
                  <Input
                    id="pay-cvc"
                    required
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    placeholder="123"
                    maxLength={4}
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, ""))}
                    className="tabular"
                  />
                </div>
              </div>
              <div>
                <p className="text-meta font-medium text-ink-muted">Test cards</p>
                <ul className="mt-1 space-y-1">
                  {TEST_CARDS.map((card) => (
                    <li key={card.number} className="flex flex-wrap items-center gap-x-3">
                      <button
                        type="button"
                        onClick={() => setCardNumber(card.number)}
                        className="rounded-sm text-meta tabular text-brand-700 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {card.number}
                      </button>
                      <span className="text-meta text-ink-muted">{card.result}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="flex items-center gap-1.5 text-meta text-ink-muted">
                <Lock className="size-3.5" aria-hidden="true" />
                Card details are used for this payment only and are never stored.
              </p>
            </Card>
          </>
        ) : (
          <Card className="space-y-2 p-5">
            <h2 className="text-card-title text-ink">No payment needed</h2>
            <p className="text-body text-ink-muted">
              {plan.name} is free. Accept the terms below to finish registering.
            </p>
          </Card>
        )}

        <Card className="p-5">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1 size-4 accent-brand-700"
            />
            <span className="text-body text-ink">
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="text-brand-700 underline underline-offset-4">
                Terms of Use
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="text-brand-700 underline underline-offset-4">
                Privacy Policy
              </Link>
              {paid ? (
                <>
                  , and I authorize justforyou to charge{" "}
                  <span className="font-semibold tabular">{money(order.total, order.currency)}</span>{" "}
                  today and the {plan.name} price plus applicable taxes every {cycleWord}{" "}
                  after that. The plan renews automatically
                  {order.renews_on ? ` on ${formatDate(order.renews_on)}` : ""} until I cancel.
                </>
              ) : (
                "."
              )}
            </span>
          </label>
        </Card>

        {error !== null ? <Alert tone="error">{error}</Alert> : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button asChild variant="ghost">
            <Link href="/register?step=2">
              <ArrowLeft aria-hidden="true" />
              Back
            </Link>
          </Button>
          <Button type="submit" size="lg" disabled={submitting}>
            {paid ? <Lock aria-hidden="true" /> : null}
            {submitting
              ? paid
                ? "Processing…"
                : "Completing…"
              : paid
                ? `Pay ${money(order.total, order.currency)}`
                : "Complete registration"}
          </Button>
        </div>
      </div>
    </form>
  );
}
