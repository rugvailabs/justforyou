/**
 * Design-system preview.
 *
 * Not a product page - a place to see every shared component at once, on real
 * data, so a token change can be judged before it is applied page by page. It
 * fetches three live listings and one real listing's opening hours rather than
 * fixtures, because a component that only looks right on invented data is a
 * component that has not been tested.
 *
 * Route left in place deliberately: it is how the next four passes get checked.
 */

import { Suspense } from "react";

import ListingCard from "@/components/ds/ListingCard";
import SiteFooter from "@/components/ds/SiteFooter";
import SiteHeader from "@/components/ds/SiteHeader";
import {
  Breadcrumbs,
  EmptyState,
  ListingListSkeleton,
} from "@/components/ds/feedback";
import {
  CategoryChip,
  OpenStatus,
  RatingPill,
  SponsoredBadge,
  VerifiedBadge,
} from "@/components/ds/indicators";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ds/primitives";
import { ApiError, getBusinessBySlug, getCategories, searchBusinesses } from "@/lib/api";
import {
  formatAddress,
  formatCad,
  formatDistance,
  formatPhone,
  formatPostalCode,
  telHref,
} from "@/lib/format";
import type { BusinessDetail, BusinessListItem, Category } from "@/lib/types";

export const dynamic = "force-dynamic";

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="mt-section">
      <h2 className="text-section-heading text-ink">{title}</h2>
      {note !== undefined ? (
        <p className="mb-4 mt-1 max-w-prose text-meta text-ink-subtle">{note}</p>
      ) : (
        <div className="mb-4" />
      )}
      {children}
    </section>
  );
}

export default async function DesignSystemPage(): Promise<JSX.Element> {
  const [categoriesResult, listingsResult, detailResult] = await Promise.allSettled([
    getCategories(),
    searchBusinesses({ page_size: 3, sort: "rating" }),
    getBusinessBySlug("coal-harbour-plumbing"),
  ]);

  const categories: Category[] =
    categoriesResult.status === "fulfilled" ? categoriesResult.value.slice(0, 6) : [];
  const listings: BusinessListItem[] =
    listingsResult.status === "fulfilled" ? listingsResult.value.items : [];
  const detail: BusinessDetail | null =
    detailResult.status === "fulfilled" ? detailResult.value : null;

  const apiDown =
    listingsResult.status === "rejected" &&
    listingsResult.reason instanceof ApiError &&
    listingsResult.reason.isNetworkError;

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: "Design system" }]}
        />
        <h1 className="mt-2 text-page-title text-ink">Design system</h1>
        <p className="mt-1 max-w-prose text-body text-ink-muted">
          Every shared component, rendered against live backend data. Tokens
          live in globals.css and are mapped in tailwind.config.ts - nothing
          below names a colour directly.
        </p>

        <Section
          title="Colour tokens"
          note="Brand teal, neutrals, and the semantic set. Each swatch is a token, not a hex value."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {[
              ["brand-600", "bg-brand-600"],
              ["brand-100", "bg-brand-100"],
              ["surface", "bg-surface border border-line"],
              ["surface-muted", "bg-surface-muted"],
              ["rating", "bg-rating"],
              ["open", "bg-open"],
              ["closed", "bg-closed"],
              ["sponsored", "bg-sponsored"],
              ["verified", "bg-verified"],
              ["danger", "bg-danger"],
              ["warning", "bg-warning"],
              ["success", "bg-success"],
            ].map(([name, className]) => (
              <div key={name} className="space-y-1">
                <div className={`h-12 rounded-card ${className}`} />
                <p className="text-micro uppercase text-ink-subtle">{name}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type scale">
          <Card className="space-y-3 p-5">
            <p className="text-page-title text-ink">Page title 30/36</p>
            <p className="text-section-heading text-ink">Section heading 20/28</p>
            <p className="text-card-title text-ink">Card title 16/22</p>
            <p className="text-body text-ink-muted">Body 14/20 - the default reading size.</p>
            <p className="text-meta text-ink-subtle">Metadata 13/18 - addresses, counts, timestamps.</p>
            <p className="text-micro uppercase text-ink-subtle">Micro 11/16 uppercase</p>
            <p className="text-body tabular text-ink">
              Tabular numerals: 4.5 &middot; 1,284 reviews &middot; {formatCad(29)} &middot; 1.4 km
            </p>
          </Card>
        </Section>

        <Section title="Buttons and inputs">
          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="link">Link</Button>
              <Button disabled>Disabled</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="demo-input">Postal code</Label>
                <Input id="demo-input" defaultValue={formatPostalCode("v6c3e1") ?? ""} />
              </div>
              <div>
                <Label htmlFor="demo-select">Province</Label>
                <Select id="demo-select" defaultValue="BC">
                  <option value="BC">BC</option>
                  <option value="ON">ON</option>
                  <option value="QC">QC</option>
                </Select>
              </div>
            </div>
          </Card>
        </Section>

        <Section
          title="Indicators"
          note="Verified reads real KYC status. Sponsored is styled but unused - no is_featured field exists."
        >
          <Card className="flex flex-wrap items-center gap-4 p-5">
            <RatingPill rating={4.5} reviewCount={128} />
            <RatingPill rating={null} />
            <VerifiedBadge status="verified" />
            <SponsoredBadge />
            <Badge tone="brand">Brand</Badge>
            <Badge tone="warning">Pending</Badge>
            <OpenStatus hours={detail?.opening_hours ?? null} showUnknown />
          </Card>
        </Section>

        <Section
          title="Category chips"
          note="Live from getCategories(), linking into the real /search route."
        >
          <div className="flex flex-wrap gap-2">
            {categories.length > 0 ? (
              categories.map((category) => (
                <CategoryChip
                  key={category.id}
                  name={category.name}
                  slug={category.slug}
                  icon={category.icon}
                  count={category.business_count}
                />
              ))
            ) : (
              <p className="text-body text-ink-subtle">Categories unavailable.</p>
            )}
          </div>
        </Section>

        <Section
          title="Listing card"
          note="Live from searchBusinesses(). Show number fires the real call_click enquiry."
        >
          {apiDown ? (
            <EmptyState
              title="The API is not reachable"
              body="Start the backend on port 8000 to see live listings here."
            />
          ) : listings.length > 0 ? (
            <div className="space-y-3">
              {listings.map((business) => (
                <ListingCard key={business.id} business={business} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No listings"
              body="Search returned nothing - seed the backend to populate the directory."
            />
          )}
        </Section>

        <Section title="Loading and empty states">
          <div className="grid gap-4 lg:grid-cols-2">
            <Suspense fallback={null}>
              <ListingListSkeleton count={2} />
            </Suspense>
            <EmptyState
              title="No listings match that"
              body="Try a broader search, or clear a filter or two."
              action={{ label: "Clear filters", href: "/search" }}
            />
          </div>
        </Section>

        <Section
          title="Canadian formatting"
          note="Applied wherever these values are rendered."
        >
          <Card className="p-5">
            <dl className="grid gap-x-8 gap-y-2 text-body sm:grid-cols-2">
              {[
                ["Postal code", formatPostalCode("v6c3e1")],
                ["Phone (display)", formatPhone("+1-604-555-0142")],
                ["Phone (tel: href)", telHref("+1-604-555-0142")],
                ["Distance", formatDistance(0.44)],
                ["Distance", formatDistance(3.2)],
                ["Currency", formatCad(290)],
                ["Address", detail !== null ? formatAddress(detail) : "—"],
              ].map(([label, value], index) => (
                <div key={`${label}-${index}`} className="flex gap-2">
                  <dt className="w-40 shrink-0 text-ink-subtle">{label}</dt>
                  <dd className="tabular text-ink">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </Section>
      </main>

      <SiteFooter />
    </>
  );
}
