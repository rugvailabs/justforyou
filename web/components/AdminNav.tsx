import Link from "next/link";

/**
 * Navigation across the admin surfaces.
 *
 * Before this each admin page had a back-link to the overview and no way to
 * reach a sibling queue, so clearing listings then verifications meant going
 * up and down through the overview twice. The counts are on the tabs because a
 * moderator's next question after finishing one queue is whether another has
 * anything in it.
 */

type AdminSection = "overview" | "listings" | "reviews" | "verifications";

const TABS: { key: AdminSection; href: string; label: string }[] = [
  { key: "overview", href: "/admin", label: "Overview" },
  { key: "listings", href: "/admin/listings", label: "Listings" },
  { key: "verifications", href: "/admin/verifications", label: "Verifications" },
  { key: "reviews", href: "/admin/reviews", label: "Reviews" },
];

export default function AdminNav({
  current,
  pendingListings,
  pendingVerifications,
}: {
  current: AdminSection;
  /** Omitted when the count could not be loaded - no badge is better than a wrong one. */
  pendingListings?: number;
  pendingVerifications?: number;
}): JSX.Element {
  const counts: Partial<Record<AdminSection, number | undefined>> = {
    listings: pendingListings,
    verifications: pendingVerifications,
  };

  return (
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Admin sections">
      {TABS.map((tab) => {
        const selected = tab.key === current;
        const count = counts[tab.key];
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={selected ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
              selected
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {tab.label}
            {count !== undefined && count > 0 ? (
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
                  selected ? "bg-white text-slate-900" : "bg-amber-100 text-amber-800"
                }`}
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
