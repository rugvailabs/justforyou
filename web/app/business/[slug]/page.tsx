/**
 * Business detail page.
 *
 * A Server Component: the listing is fetched during render, so the initial
 * paint needs no spinner and the markup is crawlable - which is the whole
 * point of per-business pages on a directory site. generateMetadata gives each
 * one a real title/description for the same reason.
 *
 * SCOPE. Several sections the spec calls for have no backend behind them and
 * are therefore absent rather than faked - see the "Not yet available" note
 * rendered at the foot of the page:
 *   - photo gallery      (no business_photos table)
 *   - reviews + replies  (no reviews table; the API's ReviewDetail schemas are
 *                         the admin moderation queue, something else entirely)
 *   - enquiry form       (no enquiries table, no get_current_user_optional)
 *   - opening hours/tags (no such columns on businesses)
 * Inventing placeholder content for them would misrepresent the data.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import ClickToCall from "@/components/ClickToCall";
import MapEmbed from "@/components/MapEmbed";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import RatingStars from "@/components/ui/RatingStars";
import { ButtonLink } from "@/components/ui/Button";
import { getBusinessBySlug } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const business = await getBusinessBySlug(params.slug);
  if (business === null) return { title: "Listing not found" };

  return {
    title: `${business.name} - ${business.city}, ${business.province}`,
    description:
      business.description ??
      `${business.name}, ${business.category_name} in ${business.city}.`,
  };
}

export default async function BusinessPage({
  params,
}: {
  params: { slug: string };
}): Promise<JSX.Element> {
  const business = await getBusinessBySlug(params.slug);

  // No detail endpoint means no 404 from the backend; an unmatched slug is
  // simply absent from the search results, which is the same thing here.
  if (business === null) notFound();

  const hasPoint = business.latitude !== null && business.longitude !== null;
  const address = [business.address, business.city, business.province]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold">
          JustDial CA
        </Link>
        {business.category_slug !== null ? (
          <Link
            href={`/search?category=${encodeURIComponent(business.category_slug)}`}
            className="text-sm underline"
          >
            More in {business.category_name}
          </Link>
        ) : null}
      </header>

      {/* --- identity ---------------------------------------------------- */}
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {business.name}
          </h1>
          {business.verified ? <Badge tone="success">✓ Verified</Badge> : null}
        </div>
        <p className="mt-1 text-slate-600">
          {business.category_slug !== null ? (
            <Link
              href={`/search?category=${encodeURIComponent(business.category_slug)}`}
              className="underline"
            >
              {business.category_name}
            </Link>
          ) : (
            business.category_name
          )}
          {address ? ` · ${business.city}, ${business.province}` : ""}
        </p>
        <div className="mt-2">
          <RatingStars
            rating={business.rating}
            reviewCount={business.review_count}
          />
        </div>
      </div>

      {/* --- action bar --------------------------------------------------- */}
      {/* Sticky: this is the page's conversion point, so it must stay reachable
          without scrolling back up. */}
      <div className="sticky top-0 z-10 -mx-6 mb-6 border-y border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          {business.phone !== null ? (
            <ClickToCall businessId={business.id} phone={business.phone} />
          ) : (
            <span className="text-sm text-slate-500">No phone number listed</span>
          )}

          {/* Plain link by design - chat is wired up in a later step. */}
          <ButtonLink
            href={`/chat/new?business=${business.id}`}
            variant="secondary"
          >
            💬 Start chat
          </ButtonLink>

          {business.website !== null ? (
            <a
              href={business.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100"
            >
              🌐 Website
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          {business.description !== null ? (
            <section className="mb-6">
              <h2 className="mb-2 text-lg font-semibold text-slate-900">About</h2>
              <p className="text-slate-700">{business.description}</p>
            </section>
          ) : null}

          <section>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Location</h2>
            <Card>
              <address className="not-italic text-slate-700">
                {business.address !== null ? <div>{business.address}</div> : null}
                <div>
                  {business.city}, {business.province}
                  {business.postal_code !== null ? ` ${business.postal_code}` : ""}
                </div>
              </address>

              {hasPoint ? (
                <div className="mt-3">
                  <MapEmbed
                    latitude={business.latitude as number}
                    longitude={business.longitude as number}
                    name={business.name}
                  />
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${business.latitude}&mlon=${business.longitude}#map=17/${business.latitude}/${business.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm underline"
                  >
                    Open in OpenStreetMap
                  </a>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  This listing has no coordinates, so it cannot be mapped.
                </p>
              )}
            </Card>
          </section>
        </div>

        <aside>
          <Card>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Contact
            </h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="font-medium text-slate-700">Phone</dt>
                <dd className="text-slate-600">
                  {business.phone !== null
                    ? "Hidden - use “Show number” above"
                    : "Not listed"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Website</dt>
                <dd className="truncate text-slate-600">
                  {business.website ?? "Not listed"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Category</dt>
                <dd className="text-slate-600">
                  {business.category_name ?? "Uncategorised"}
                </dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>

      {/* --- honest gap notice -------------------------------------------- */}
      <section className="mt-8">
        <Card className="border-slate-300 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-800">
            Not yet available
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Photos, customer reviews, opening hours and the enquiry form need
            backend tables and endpoints that do not exist yet. They are left
            out rather than mocked, so nothing on this page is placeholder data.
          </p>
        </Card>
      </section>
    </div>
  );
}
