/**
 * The 5-to-1 histogram, from GET /businesses/{id}/reviews/summary.
 *
 * Rendered only when the summary actually holds reviews. The caller checks -
 * see the profile page - because an all-zero histogram beside a headline
 * rating is worse than no histogram: it reads as "everyone rated this zero"
 * rather than "nobody has rated this".
 *
 * The bar is a real <meter>-like row rather than a decorative div: each row is
 * a labelled proportion, and the accessible name carries the count, so a
 * screen reader gets "5 stars, 412 reviews" instead of a wall of bars.
 *
 * Percentages are of the largest bucket, not of the total. Scaling to the
 * total makes every bar short on a listing with one dominant rating, which is
 * most of them - the shape of the distribution is the point.
 */

import { Star } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatCount, formatRating } from "@/lib/format";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import type { BusinessReviewSummary } from "@/lib/types";

export default function RatingBreakdown({
  summary,
  locale = "en",
  className,
}: {
  summary: BusinessReviewSummary;
  locale?: Locale;
  className?: string;
}): JSX.Element {
  const t = tFor(locale);
  const intl = INTL_LOCALE[locale];

  const rows = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: summary.breakdown[String(stars)] ?? 0,
  }));

  // Guarded: a summary with a review_count but an empty breakdown would divide
  // by zero and render NaN-width bars.
  const peak = Math.max(...rows.map((row) => row.count), 1);

  return (
    <div className={cn("flex flex-wrap items-center gap-x-8 gap-y-4", className)}>
      <div className="flex flex-col items-center">
        <span className="flex items-baseline gap-1">
          <span className="text-page-title tabular text-ink">
            {formatRating(summary.average_rating) ?? "—"}
          </span>
          <Star className="size-4 fill-rating text-rating" aria-hidden="true" />
        </span>
        <span className="mt-0.5 text-meta text-ink-subtle tabular">
          {summary.review_count === 1
            ? t("listing.oneReview")
            : t("listing.reviews", { count: formatCount(summary.review_count, intl) })}
        </span>
      </div>

      <ul className="min-w-[14rem] flex-1 space-y-1">
        {rows.map((row) => {
          const label =
            row.stars === 1
              ? t("business.oneStar")
              : t("business.starCount", { stars: row.stars });

          return (
            <li key={row.stars} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-meta text-ink-muted tabular">
                {label}
              </span>
              <span
                role="img"
                aria-label={`${label}: ${formatCount(row.count, intl)}`}
                className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-muted"
              >
                <span
                  className="block h-full rounded-pill bg-rating"
                  style={{ width: `${(row.count / peak) * 100}%` }}
                />
              </span>
              <span
                aria-hidden="true"
                className="w-10 shrink-0 text-right text-meta text-ink-subtle tabular"
              >
                {formatCount(row.count, intl)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
