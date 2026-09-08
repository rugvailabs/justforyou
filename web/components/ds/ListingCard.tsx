/**
 * One business in a list.
 *
 * Sourced entirely from BusinessListItem, which is what /businesses/search
 * actually returns. Two consequences worth stating, because the design assumed
 * otherwise:
 *
 *   - There is no photo on a list item. The backend has no business_photos
 *     table, so the thumbnail slot is a category-tinted monogram rather than a
 *     stock image pretending to be this business's storefront.
 *   - There are no opening hours on a list item either; they exist only on
 *     BusinessDetail. So OpenStatus renders on the profile page and is simply
 *     absent here, rather than guessing.
 *
 * Feature chips come from what the row genuinely carries - a website, a
 * distance when the search supplied a point - not from a tags field the list
 * item does not have.
 */

import Link from "next/link";
import { Globe, MapPin } from "lucide-react";

import ShowNumber from "@/components/ds/ShowNumber";
import { RatingPill, VerifiedBadge } from "@/components/ds/indicators";
import { Button, Card } from "@/components/ds/primitives";
import { cn } from "@/lib/cn";
import { formatDistance, formatLocality } from "@/lib/format";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import type { BusinessListItem } from "@/lib/types";

/** A stable colour per category, so the same trade looks the same everywhere. */
const MONOGRAM_TONES = [
  "bg-brand-100 text-brand-800",
  "bg-rating/20 text-rating-ink",
  "bg-open-bg text-open",
  "bg-surface-muted text-ink-muted",
];

function monogramTone(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return MONOGRAM_TONES[Math.abs(hash) % MONOGRAM_TONES.length];
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0] ?? "").join("").toUpperCase();
}

export default function ListingCard({
  business,
  locale = "en",
  className,
}: {
  business: BusinessListItem;
  locale?: Locale;
  className?: string;
}): JSX.Element {
  const t = tFor(locale);
  const intl = INTL_LOCALE[locale];
  const distance = formatDistance(business.distance_km, intl);

  return (
    <Card className={cn("flex gap-4 p-4 transition-colors hover:border-line-strong", className)}>
      <div
        aria-hidden="true"
        className={cn(
          "hidden size-16 shrink-0 items-center justify-center rounded-card text-section-heading font-semibold sm:flex",
          monogramTone(business.category_slug),
        )}
      >
        {initials(business.name)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-card-title text-ink">
            {/* The whole card is not a link: it holds buttons, and nesting
                interactive elements inside an anchor breaks both. */}
            <Link
              href={`/business/${business.slug}`}
              className="rounded-sm hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {business.name}
            </Link>
          </h3>
          {/* Everything in public search has passed KYC - that is the gate -
              so visibility itself is the proof. */}
          <VerifiedBadge implied locale={locale} />
        </div>

        <p className="mt-0.5 text-meta text-ink-subtle">
          {business.category_name} &middot; {formatLocality(business.city, business.province)}
        </p>

        <div className="mt-1.5">
          <RatingPill
            rating={business.rating}
            reviewCount={business.review_count}
            size="sm"
            locale={locale}
          />
        </div>

        {business.description !== null ? (
          <p className="mt-2 line-clamp-2 text-body text-ink-muted">
            {business.description}
          </p>
        ) : null}

        {(distance !== null || business.website !== null) ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-subtle">
            {distance !== null ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden="true" />
                <span className="tabular">{t("listing.away", { distance })}</span>
              </span>
            ) : null}
            {business.website !== null ? (
              <span className="inline-flex items-center gap-1">
                <Globe className="size-3.5" aria-hidden="true" />
                {t("listing.website")}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {business.phone !== null ? (
            <ShowNumber
              businessId={business.id}
              phone={business.phone}
              locale={locale}
            />
          ) : null}
          <Button asChild variant="primary" size="sm">
            <Link href={`/business/${business.slug}#enquire`}>{t("listing.enquire")}</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
