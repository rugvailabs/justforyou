/**
 * Step 4: registration complete.
 *
 * By now the account is active, the listing exists (pending review), the
 * subscription is linked to it, and for a paid plan there is a receipt. This
 * says all of that, and what still has to happen, because "registered" is not
 * "live": a listing appears in search only once a moderator has approved it
 * and the business has passed verification.
 */

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { ListingStatusBadge } from "@/components/ds/status";
import { Button, Card } from "@/components/ds/primitives";
import { formatCad, formatDate } from "@/lib/format";
import type { RegistrationState } from "@/lib/types";

function money(amount: string, currency: string): string {
  return `${formatCad(amount) ?? amount} ${currency}`;
}

export default function CompleteStep({ state }: { state: RegistrationState }): JSX.Element {
  const { business, subscription, receipt, account } = state;

  // An owner from before registration existed: nothing to summarise.
  if (business === null || subscription === null) {
    return (
      <Card className="p-6">
        <h2 className="text-card-title text-ink">Your account is already set up</h2>
        <p className="mt-1 text-body text-ink-muted">
          Manage your listings from the dashboard.
        </p>
        <Button asChild className="mt-4">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </Card>
    );
  }

  const { plan } = subscription;
  const free = Number(plan.amount) <= 0;

  return (
    <div className="space-y-5">
      <Card className="flex items-start gap-3 border-success/30 bg-success-bg p-5">
        <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
        <div>
          <h2 className="text-card-title text-ink">Registration complete</h2>
          <p className="mt-1 text-body text-ink-muted">
            Your account is active and {business.name} is registered on the {plan.name} plan.
            {" "}We are emailing a welcome message and your{" "}
            {receipt ? "receipt" : "plan confirmation"} to {account.email}.
          </p>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h3 className="text-card-title text-ink">Your plan</h3>
          <dl className="space-y-1.5 text-body">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Plan</dt>
              <dd className="text-right text-ink">{plan.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Status</dt>
              <dd className="text-right text-ink">Active</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{free ? "Validity" : "Paid until"}</dt>
              <dd className="text-right tabular text-ink">
                {subscription.current_period_end
                  ? `${formatDate(subscription.current_period_end)} (renews automatically)`
                  : "No expiry"}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="space-y-3 p-5">
          <h3 className="text-card-title text-ink">Your listing</h3>
          <p className="text-body text-ink">{business.name}</p>
          <ListingStatusBadge status={business.status} showHint />
        </Card>
      </div>

      {receipt ? (
        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-card-title text-ink">Receipt</h3>
            <span className="text-meta tabular text-ink-muted">
              {receipt.receipt_number} · {formatDate(receipt.created_at)}
            </span>
          </div>
          <dl className="max-w-md space-y-1.5 text-body">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{plan.name} plan</dt>
              <dd className="tabular text-ink">{money(receipt.subtotal, receipt.currency)}</dd>
            </div>
            {receipt.tax_lines.map((line) => (
              <div key={line.name} className="flex justify-between gap-4">
                <dt className="text-ink-muted">
                  {line.name} ({line.rate}%, {receipt.province})
                </dt>
                <dd className="tabular text-ink">{money(line.amount, receipt.currency)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-line pt-2 font-semibold">
              <dt className="text-ink">Total paid</dt>
              <dd className="tabular text-ink">{money(receipt.total, receipt.currency)}</dd>
            </div>
          </dl>
          <p className="text-meta text-ink-muted">
            {receipt.card_brand} ending {receipt.card_last4}
            {receipt.gst_hst_registration_number
              ? ` · GST/HST no. ${receipt.gst_hst_registration_number}`
              : ""}
            {receipt.gateway === "stub" ? " · Test mode: no real payment was taken." : ""}
          </p>
        </Card>
      ) : null}

      <Card className="space-y-3 p-5">
        <h3 className="text-card-title text-ink">Before your listing appears in search</h3>
        <ol className="list-decimal space-y-2 pl-5 text-body text-ink-muted">
          <li>
            <span className="text-ink">Verify your business.</span> Upload your business
            licence so our team can confirm the business is real.
          </li>
          <li>
            <span className="text-ink">Wait for review.</span> A moderator checks the
            listing&rsquo;s details; its status changes on your dashboard.
          </li>
          <li>
            <span className="text-ink">Complete your profile.</span> Opening hours, a
            description and a map pin help customers choose you.
          </li>
        </ol>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild>
            <Link href={`/dashboard/${business.id}/verification`}>Verify your business</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/dashboard/${business.id}/edit`}>Complete your profile</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
