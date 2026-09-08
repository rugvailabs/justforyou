/**
 * Site footer.
 *
 * Only links to routes that exist. A footer full of dead "About / Careers /
 * Press" links is the fastest way to make a product feel like a template, and
 * every one of them is a 404 somebody has to explain later.
 */

import Link from "next/link";

import { tFor, type Locale } from "@/lib/i18n";

export default function SiteFooter({
  locale = "en",
}: {
  locale?: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const year = new Date().getFullYear();

  const columns: { heading: string; links: { href: string; label: string }[] }[] = [
    {
      heading: t("footer.forCustomers"),
      links: [
        { href: "/search", label: t("footer.browseCategories") },
        { href: "/chat", label: t("common.messages") },
      ],
    },
    {
      heading: t("footer.forBusinesses"),
      links: [
        { href: "/dashboard/new-listing", label: t("footer.addListing") },
        { href: "/dashboard", label: t("footer.ownerSignIn") },
      ],
    },
  ];

  return (
    <footer className="mt-section border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap gap-10">
          <div className="min-w-[16rem] flex-1">
            <p className="text-card-title font-semibold text-ink">
              JustDial <span className="text-brand-700">CA</span>
            </p>
            <p className="mt-1 max-w-sm text-meta text-ink-subtle">
              {t("common.tagline")}
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-micro uppercase text-ink-subtle">{column.heading}</h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded-sm text-body text-ink-muted hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-6 text-meta text-ink-subtle">
          <p>
            &copy; {year} JustDial CA. {t("footer.rights")}
          </p>
          <p>{t("footer.madeIn")}</p>
        </div>
      </div>
    </footer>
  );
}
