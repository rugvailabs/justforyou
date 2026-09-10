import Link from "next/link";

import { cn } from "@/lib/cn";

/**
 * Navigation across the admin surfaces.
 *
 * Before this each admin page had a back-link to the overview and no way to
 * reach a sibling queue, so clearing listings then verifications meant going
 * up and down through the overview twice. The counts are on the tabs because a
 * moderator's next question after finishing one queue is whether another has
 * anything in it.
 */

type AdminSection =
  | "overview"
  | "listings"
  | "verifications"
  | "reviews"
  | "leads";

const TABS: { key: AdminSection; href: string; label: string }[] = [
  { key: "overview", href: "/admin", label: "Overview" },
  { key: "listings", href: "/admin/listings", label: "Listings" },
  { key: "verifications", href: "/admin/verifications", label: "Verifications" },
  { key: "reviews", href: "/admin/reviews", label: "Reviews" },
  { key: "leads", href: "/admin/leads", label: "Leads" },
];

export default function AdminNav({
  current,
  pendingListings,
  pendingVerifications,
  className,
}: {
  current: AdminSection;
  /** Omitted when the count could not be loaded - no badge is better than a wrong one. */
  pendingListings?: number;
  pendingVerifications?: number;
  className?: string;
}): JSX.Element {
  const counts: Partial<Record<AdminSection, number | undefined>> = {
    listings: pendingListings,
    verifications: pendingVerifications,
  };

  // mb-5 stays the default so the five pages that call this with no props
    // keep the spacing they were built against; a caller can override it.
  return (
    <nav className={cn("mb-5 flex flex-wrap gap-2", className)} aria-label="Admin sections">
      {TABS.map((tab) => {
        const selected = tab.key === current;
        const count = counts[tab.key];
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-input px-3 py-1.5 text-body font-medium",
              "transition-colors focus-visible:outline focus-visible:outline-2",
              "focus-visible:outline-offset-2 focus-visible:outline-ring",
              selected
                ? "bg-brand-700 text-ink-inverse"
                : "border border-line-strong bg-surface text-ink hover:bg-surface-muted",
            )}
          >
            {tab.label}
            {count !== undefined && count > 0 ? (
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-pill px-1.5",
                  "text-micro tabular",
                  selected ? "bg-surface text-brand-800" : "bg-warning-bg text-warning",
                )}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
