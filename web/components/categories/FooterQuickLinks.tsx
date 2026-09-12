/**
 * The long-tail footer strip from the reference block.
 *
 * The source generated every href with `/${slugify(label)}`, which produces a
 * plausible-looking URL for anything you type into the array - and a 404 for
 * every one of them that has no page. Each column here is therefore explicit
 * about whether its entries are links or not:
 *
 *   Top categories   real hrefs, to the city/category pages
 *   Neighbourhoods   NOT links. See below.
 *   For businesses   only the routes that exist
 *   Company          only the routes that exist
 *
 * NEIGHBOURHOODS ARE DELIBERATELY NOT LINKS. Gastown, Kitsilano and the rest
 * are the right long-tail surface eventually, but neighbourhood-level pages do
 * not exist and inventing /gastown would be eight dead links in the footer of
 * every page. They render as plain text with the reason stated once, the same
 * treatment the travel tiles use for flights and trains. They become links the
 * day the pages do.
 */

import Link from "next/link";

interface QuickLink {
  label: string;
  href: string;
}

const NEIGHBOURHOODS = [
  "Gastown",
  "Mount Pleasant",
  "Kitsilano",
  "Yaletown",
  "Strathcona",
  "Marpole",
  "North Vancouver",
  "Richmond",
] as const;

const FOR_BUSINESSES: QuickLink[] = [
  { label: "Free listing", href: "/dashboard/new-listing" },
  { label: "Business sign-in", href: "/dashboard" },
  { label: "Verified badge", href: "/about" },
];

const COMPANY: QuickLink[] = [
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms of use", href: "/terms" },
];

const LINK_CLASS =
  "rounded-sm text-body text-ink-muted hover:text-brand-700 hover:underline hover:underline-offset-4 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function Column({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <h2 className="mb-2.5 text-micro uppercase text-ink-subtle">{heading}</h2>
      <ul className="grid gap-[7px]">{children}</ul>
    </div>
  );
}

export default function FooterQuickLinks({
  topCategories,
}: {
  topCategories: readonly QuickLink[];
}): JSX.Element {
  return (
    <div className="border-t border-line bg-surface pb-6 pt-8">
      <div className="mx-auto max-w-[1320px] px-5">
        <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
          <Column heading="Top categories">
            {topCategories.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={LINK_CLASS}>
                  {link.label}
                </Link>
              </li>
            ))}
          </Column>

          <Column heading="Neighbourhoods">
            {NEIGHBOURHOODS.map((name) => (
              <li key={name} className="text-body text-ink-subtle">
                {name}
              </li>
            ))}
            <li className="mt-1 text-meta text-ink-subtle">
              Neighbourhood pages are not built yet.
            </li>
          </Column>

          <Column heading="For businesses">
            {FOR_BUSINESSES.map((link) => (
              <li key={link.label}>
                <Link href={link.href} className={LINK_CLASS}>
                  {link.label}
                </Link>
              </li>
            ))}
          </Column>

          <Column heading="Company">
            {COMPANY.map((link) => (
              <li key={link.label}>
                <Link href={link.href} className={LINK_CLASS}>
                  {link.label}
                </Link>
              </li>
            ))}
          </Column>
        </div>
      </div>
    </div>
  );
}
