/**
 * /search - results for whatever the query string says.
 *
 * searchParams is the only input: filters, sort, geo point and page all come
 * from the URL, so a result set is shareable and the back button behaves.
 */

import type { Metadata } from "next";
import Link from "next/link";

import Header from "@/components/Header";
import BusinessCard from "@/components/BusinessCard";
import SearchBar from "@/components/SearchBar";
import SearchFilters from "@/components/SearchFilters";
import Card from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { ApiError, getCategories, searchBusinesses } from "@/lib/api";
import type {
  BusinessSearchParams,
  BusinessSort,
  Category,
  SearchResponse,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Title and description come from the filters actually applied, so a shared
 * search link says what it shows rather than "Search" on every variation.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: RawParams;
}): Promise<Metadata> {
  const params = toSearchParams(searchParams);

  let subject = "Local businesses";
  if (params.category_slug) {
    const categories = await getCategories().catch(() => []);
    const match = categories.find((c) => c.slug === params.category_slug);
    subject = match?.name ?? params.category_slug;
  }
  if (params.q) subject = `${params.q}`;

  const where = params.city ?? "Metro Vancouver";
  const title = `${subject} in ${where}`;

  return {
    title,
    description:
      `Find ${subject.toLowerCase()} in ${where}. ` +
      "Compare ratings, read reviews and contact businesses directly.",
  };
}

const PAGE_SIZE = 12;

const SORTS: BusinessSort[] = [
  "relevance",
  "rating",
  "reviews",
  "distance",
  "name",
  "newest",
];

type RawParams = Record<string, string | string[] | undefined>;

/** First value only: ?city=a&city=b must not become an array. */
function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  const trimmed = v?.trim();
  return trimmed ? trimmed : undefined;
}

function num(value: string | string[] | undefined): number | undefined {
  const raw = one(value);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  // Reject NaN/Infinity here rather than sending garbage the API will 422 on.
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Translate the URL into API params, dropping anything malformed. */
function toSearchParams(raw: RawParams): BusinessSearchParams {
  const lat = num(raw.lat);
  const lng = num(raw.lng);
  // The API rejects a half-supplied point, so only forward a complete one.
  const hasPoint = lat !== undefined && lng !== undefined;

  const sortRaw = one(raw.sort);
  let sort = SORTS.includes(sortRaw as BusinessSort)
    ? (sortRaw as BusinessSort)
    : undefined;
  // Guard the same rule the API enforces, so a stale ?sort=distance in a
  // shared link degrades instead of 422-ing.
  if (sort === "distance" && !hasPoint) sort = undefined;

  const page = num(raw.page);

  return {
    q: one(raw.q),
    category_slug: one(raw.category),
    city: one(raw.city),
    lat: hasPoint ? lat : undefined,
    lng: hasPoint ? lng : undefined,
    radius_km: hasPoint ? num(raw.radius_km) : undefined,
    min_rating: num(raw.min_rating),
    sort,
    page: page !== undefined && page >= 1 ? Math.floor(page) : 1,
    page_size: PAGE_SIZE,
  };
}

/** Rebuild the current URL with one parameter changed. */
function urlWith(raw: RawParams, key: string, value: string): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    const single = one(v);
    if (single !== undefined) params.set(k, single);
  }
  if (value) params.set(key, value);
  else params.delete(key);
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: RawParams;
}): Promise<JSX.Element> {
  const params = toSearchParams(searchParams);

  const [categoriesResult, resultsResult] = await Promise.allSettled([
    getCategories(),
    searchBusinesses(params),
  ]);

  const categories: Category[] =
    categoriesResult.status === "fulfilled" ? categoriesResult.value : [];

  const failed = resultsResult.status === "rejected";
  const results: SearchResponse | null = failed
    ? null
    : (resultsResult as PromiseFulfilledResult<SearchResponse>).value;

  const errorMessage = failed
    ? resultsResult.reason instanceof ApiError
      ? resultsResult.reason.isNetworkError
        ? "The API is not reachable. Is the backend running on port 8000?"
        : resultsResult.reason.message
      : "Something went wrong running that search."
    : null;

  const page = results?.page ?? params.page ?? 1;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Header />

      <SearchBar
        className="mb-6"
        initialQuery={params.q ?? ""}
        initialCity={params.city ?? ""}
      />

      <div className="mb-6">
        <SearchFilters categories={categories} />
      </div>

      {errorMessage !== null ? (
        <Card className="border-red-200 bg-red-50">
          <h2 className="font-semibold text-red-800">Search failed</h2>
          <p className="mt-1 text-sm text-red-700">{errorMessage}</p>
          <div className="mt-3">
            <ButtonLink href="/search" variant="secondary" size="sm">
              Reset search
            </ButtonLink>
          </div>
        </Card>
      ) : results !== null && results.total === 0 ? (
        <Card>
          <h2 className="font-semibold text-slate-900">No matches</h2>
          <p className="mt-1 text-sm text-slate-600">
            Nothing matched those filters. Try a broader search - remove the
            city, lower the minimum rating, or widen the category.
          </p>
          <div className="mt-3">
            <ButtonLink href="/search" variant="secondary" size="sm">
              Clear all filters
            </ButtonLink>
          </div>
        </Card>
      ) : results !== null ? (
        <>
          <p className="mb-3 text-sm text-slate-600">
            {results.total.toLocaleString("en-CA")}{" "}
            {results.total === 1 ? "result" : "results"}
            {params.q ? ` for “${params.q}”` : ""}
            {params.city ? ` in ${params.city}` : ""}
            {results.total_pages > 1
              ? ` · page ${results.page} of ${results.total_pages}`
              : ""}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {results.items.map((business) => (
              <BusinessCard key={business.id} business={business} />
            ))}
          </div>

          {results.total_pages > 1 ? (
            <nav
              aria-label="Pagination"
              className="mt-8 flex items-center justify-between"
            >
              {results.has_prev ? (
                <ButtonLink
                  href={urlWith(searchParams, "page", String(page - 1))}
                  variant="secondary"
                  size="sm"
                >
                  ← Previous
                </ButtonLink>
              ) : (
                <span />
              )}

              <span className="text-sm text-slate-600">
                Page {results.page} of {results.total_pages}
              </span>

              {results.has_next ? (
                <ButtonLink
                  href={urlWith(searchParams, "page", String(page + 1))}
                  variant="secondary"
                  size="sm"
                >
                  Next →
                </ButtonLink>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
