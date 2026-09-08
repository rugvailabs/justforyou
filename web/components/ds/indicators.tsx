/**
 * The small status components: rating, verified, open/closed, category chip.
 *
 * Each one reads real data and says so honestly when the data is missing -
 * "No reviews yet" rather than an empty five-star row, "Hours not listed"
 * rather than a guess. A directory that renders zeros where it has nulls
 * teaches people not to trust the numbers it does have.
 */

import Link from "next/link";
import { BadgeCheck, Clock, Star } from "lucide-react";

import { Badge } from "@/components/ds/primitives";
import { cn } from "@/lib/cn";
import { formatCount, formatRating } from "@/lib/format";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import { getOpenState, type OpeningHours } from "@/lib/opening-hours";
import type { VerificationStatus } from "@/lib/types";

/* ------------------------------------------------------------ RatingPill */

export function RatingPill({
  rating,
  reviewCount,
  size = "md",
  locale = "en",
  className,
}: {
  rating: number | null;
  reviewCount?: number;
  size?: "sm" | "md";
  locale?: Locale;
  className?: string;
}): JSX.Element {
  const t = tFor(locale);
  const intl = INTL_LOCALE[locale];

  // null is "nobody has reviewed this", which is not 0.0 and must not look
  // like a bad score.
  if (rating === null) {
    return (
      <span className={cn("text-meta text-ink-subtle", className)}>
        {t("listing.noReviews")}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-pill bg-rating/15 font-semibold text-rating-ink tabular",
          size === "sm" ? "px-1.5 py-0.5 text-meta" : "px-2 py-0.5 text-body",
        )}
      >
        <Star
          className={cn("fill-rating text-rating", size === "sm" ? "size-3" : "size-3.5")}
          aria-hidden="true"
        />
        {formatRating(rating)}
      </span>
      {reviewCount !== undefined ? (
        <span className="text-meta text-ink-subtle tabular">
          {reviewCount === 1
            ? t("listing.oneReview")
            : t("listing.reviews", { count: formatCount(reviewCount, intl) })}
        </span>
      ) : null}
    </span>
  );
}

/* --------------------------------------------------------- VerifiedBadge */

/**
 * Shown only when the business really passed KYC.
 *
 * `status` is the BusinessVerification.status this app already stores - the
 * same value the admin queue decides. It is optional because the public search
 * payload does not carry it: everything in public search is verified by
 * definition (the search gate joins on it), so a list item passes
 * `implied` instead of inventing a boolean.
 */
export function VerifiedBadge({
  status,
  implied = false,
  locale = "en",
  className,
}: {
  status?: VerificationStatus | null;
  /** True where visibility itself proves verification - public search results. */
  implied?: boolean;
  locale?: Locale;
  className?: string;
}): JSX.Element | null {
  const t = tFor(locale);
  const isVerified = status === "verified" || (status === undefined && implied);
  if (!isVerified) return null;

  return (
    <Badge tone="verified" className={cn("gap-1", className)} title={t("listing.verifiedHint")}>
      <BadgeCheck className="size-3" aria-hidden="true" />
      {t("listing.verified")}
    </Badge>
  );
}

/* ------------------------------------------------------------- OpenStatus */

export function OpenStatus({
  hours,
  locale = "en",
  className,
  showUnknown = false,
}: {
  hours: OpeningHours | null | undefined;
  locale?: Locale;
  className?: string;
  /** Say "hours not listed" instead of rendering nothing. */
  showUnknown?: boolean;
}): JSX.Element | null {
  const t = tFor(locale);
  const state = getOpenState(hours, new Date(), INTL_LOCALE[locale]);

  if (state.status === "unknown") {
    if (!showUnknown) return null;
    return (
      <span className={cn("inline-flex items-center gap-1 text-meta text-ink-subtle", className)}>
        <Clock className="size-3.5" aria-hidden="true" />
        {t("listing.noHours")}
      </span>
    );
  }

  if (state.status === "open" || state.status === "closing-soon") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-meta", className)}>
        <span className="font-medium text-open">{t("listing.open")}</span>
        <span className="text-ink-subtle">
          &middot; {t("listing.closesAt", { time: state.until })}
        </span>
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-meta", className)}>
      <span className="font-medium text-closed">{t("listing.closed")}</span>
      {state.opensAt !== null ? (
        <span className="text-ink-subtle">
          &middot;{" "}
          {state.opensDay !== null
            ? t("listing.opensDay", { day: state.opensDay, time: state.opensAt })
            : t("listing.opensAt", { time: state.opensAt })}
        </span>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------ CategoryChip */

export function CategoryChip({
  name,
  slug,
  icon,
  count,
  locale = "en",
  className,
}: {
  name: string;
  slug: string;
  icon?: string | null;
  count?: number;
  locale?: Locale;
  className?: string;
}): JSX.Element {
  const intl = INTL_LOCALE[locale];
  return (
    <Link
      href={`/search?category=${encodeURIComponent(slug)}`}
      className={cn(
        "group inline-flex items-center gap-2 rounded-pill border border-line bg-surface " +
          "px-3 py-1.5 text-body text-ink transition-colors hover:border-brand-300 hover:bg-brand-50 " +
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="text-[1rem] leading-none">
          {icon}
        </span>
      ) : null}
      <span className="font-medium">{name}</span>
      {count !== undefined ? (
        <span className="text-meta text-ink-subtle tabular">{formatCount(count, intl)}</span>
      ) : null}
    </Link>
  );
}

/* ------------------------------------------------------------ SponsoredBadge */

/**
 * Paid placement, labelled as such.
 *
 * NOT WIRED UP. The spec maps this to an `is_featured` field; no such column
 * exists on businesses, and nothing in the API returns one. The treatment is
 * defined here so the design is settled, but no component passes it, because
 * marking listings "sponsored" when none has paid for placement would be a lie
 * told in the product's own voice.
 */
export function SponsoredBadge({
  locale = "en",
  className,
}: {
  locale?: Locale;
  className?: string;
}): JSX.Element {
  const t = tFor(locale);
  return (
    <Badge tone="sponsored" className={className}>
      {t("listing.sponsored")}
    </Badge>
  );
}
