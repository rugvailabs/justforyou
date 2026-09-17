/**
 * The disclosure above a list that contains paid placements.
 *
 * Each card already carries its own Featured/Promoted badge; this says, once
 * and in plain words, what those badges mean for the order of the list. It
 * renders only when the list actually contains a paid placement.
 */

import { Info } from "lucide-react";

import { cn } from "@/lib/cn";
import { tFor, type Locale } from "@/lib/i18n";
import type { BusinessListItem } from "@/lib/types";

export default function PlacementNote({
  items,
  locale = "en",
  className,
}: {
  items: BusinessListItem[];
  locale?: Locale;
  className?: string;
}): JSX.Element | null {
  const hasPaid = items.some(
    (item) => item.subscription_tier === "annual" || item.subscription_tier === "monthly",
  );
  if (!hasPaid) return null;

  const t = tFor(locale);
  return (
    <p className={cn("flex items-start gap-2 text-meta text-ink-muted", className)}>
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {t("listing.placementNote")}
    </p>
  );
}
