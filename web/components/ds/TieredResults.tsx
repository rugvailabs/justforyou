/**
 * A page of search results, grouped by placement tier.
 *
 *   ⭐ Featured   Annual subscribers        paid placement
 *   📈 Promoted   Monthly subscribers       paid placement, taking turns
 *   More businesses                         Basic and no plan, together
 *
 * The API already returns the results in this order; this only draws the
 * group headings and the dividers between them. Basic and unsubscribed
 * listings share one heading because the difference is the owner's plan, which
 * is nothing a customer choosing a plumber needs to see.
 *
 * With no paid listing on the page there are no headings at all - "More
 * businesses" above a plain list would only raise the question "more than
 * what?". A page that starts partway through a tier (page 2) gets the heading
 * again, so no card is ever shown without its group.
 */

import ListingCard from "@/components/ds/ListingCard";
import { cn } from "@/lib/cn";
import { tFor, type Locale } from "@/lib/i18n";
import type { BusinessListItem } from "@/lib/types";

type Group = "featured" | "promoted" | "rest";

function groupOf(item: BusinessListItem): Group {
  if (item.subscription_tier === "annual") return "featured";
  if (item.subscription_tier === "monthly") return "promoted";
  return "rest";
}

export default function TieredResults({
  items,
  searchId,
  locale = "en",
  className,
}: {
  items: BusinessListItem[];
  searchId?: string | null;
  locale?: Locale;
  className?: string;
}): JSX.Element {
  const t = tFor(locale);
  const hasPaid = items.some((item) => groupOf(item) !== "rest");

  if (!hasPaid) {
    return (
      <ul className={cn("space-y-3", className)}>
        {items.map((business) => (
          <li key={business.id}>
            <ListingCard business={business} searchId={searchId} locale={locale} />
          </li>
        ))}
      </ul>
    );
  }

  // Consecutive runs of one group, in the order the API returned them.
  const runs: { group: Group; items: BusinessListItem[] }[] = [];
  for (const item of items) {
    const group = groupOf(item);
    const last = runs[runs.length - 1];
    if (last && last.group === group) last.items.push(item);
    else runs.push({ group, items: [item] });
  }

  // Headings stay in ink: the gold and silver tones clear 4.5:1 inside their
  // own badges, not as 11px text on the page canvas.
  const HEADINGS: Record<Group, { title: string; caption?: string; tone: string }> = {
    featured: {
      title: `⭐ ${t("listing.featured")}`,
      caption: t("listing.featuredCaption"),
      tone: "text-ink",
    },
    promoted: {
      title: `📈 ${t("listing.promoted")}`,
      caption: t("listing.promotedCaption"),
      tone: "text-ink",
    },
    rest: { title: t("listing.moreBusinesses"), tone: "text-ink-muted" },
  };

  return (
    <div className={cn("space-y-6", className)}>
      {runs.map((run, index) => {
        const heading = HEADINGS[run.group];
        const id = `results-${run.group}-${index}`;
        return (
          <section key={id} aria-labelledby={id}>
            {index > 0 ? <hr className="mb-5 border-line" /> : null}
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id={id} className={cn("text-micro uppercase", heading.tone)}>
                {heading.title}
              </h2>
              {heading.caption ? (
                <p className="text-meta text-ink-muted">{heading.caption}</p>
              ) : null}
            </div>
            <ul className="space-y-3">
              {run.items.map((business) => (
                <li key={business.id}>
                  <ListingCard business={business} searchId={searchId} locale={locale} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
