/**
 * "How is my listing doing in search?" - for the owner.
 *
 * Impressions (times shown in results), clicks (opened, number revealed, or
 * enquiry started from a result), click-through rate and average position,
 * over the last 30 days. These are the numbers a paid plan is supposed to
 * move, so they are shown as they are, including when they are zero.
 */

import { Card } from "@/components/ds/primitives";
import { formatCount } from "@/lib/format";
import type { BusinessSearchPerformance } from "@/lib/types";

const TIER_NAMES: Record<string, string> = {
  annual: "Featured (Annual)",
  monthly: "Promoted (Monthly)",
  basic: "Basic",
  none: "No plan",
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }): JSX.Element {
  return (
    <div>
      <dt className="text-meta text-ink-muted">{label}</dt>
      <dd className="text-section-heading tabular text-ink">{value}</dd>
      {hint ? <dd className="text-meta text-ink-muted">{hint}</dd> : null}
    </div>
  );
}

export default function SearchPerformanceCard({
  performance,
  intl = "en-CA",
}: {
  performance: BusinessSearchPerformance;
  intl?: string;
}): JSX.Element {
  const { impressions, clicks, ctr, avg_position, clicks_by_action, impressions_by_tier, days } =
    performance;
  const tiers = Object.entries(impressions_by_tier).filter(([, n]) => (n ?? 0) > 0);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-card-title text-ink">Search performance</h2>
        <span className="text-meta text-ink-muted">Last {days} days</span>
      </div>

      {impressions === 0 ? (
        <p className="mt-2 text-body text-ink-muted">
          Your listing has not appeared in search results in this period. Listings
          appear once they are approved and verified.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Shown in search" value={formatCount(impressions, intl)} />
            <Stat
              label="Clicks"
              value={formatCount(clicks, intl)}
              hint={`${clicks_by_action.view} views · ${clicks_by_action.call} calls · ${clicks_by_action.enquire} enquiries`}
            />
            <Stat label="Click-through rate" value={`${(ctr * 100).toFixed(1)}%`} />
            <Stat
              label="Average position"
              value={avg_position !== null ? avg_position.toFixed(1) : "-"}
              hint="1 is the top of the results"
            />
          </dl>
          {tiers.length > 0 ? (
            <p className="mt-4 text-meta text-ink-muted">
              Shown as:{" "}
              {tiers
                .map(([tier, n]) => `${TIER_NAMES[tier] ?? tier} ${formatCount(n ?? 0, intl)}×`)
                .join(" · ")}
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}
