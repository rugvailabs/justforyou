/**
 * Home: hero, search bar and the category grid.
 *
 * A Server Component, so the categories fetch happens on the server. That is
 * not a preference - the backend ships no CORS middleware, so the browser
 * cannot call it directly.
 */

import Link from "next/link";

import BusinessCard from "@/components/BusinessCard";
import SearchBar from "@/components/SearchBar";
import LogoutButton from "@/components/LogoutButton";
import Card from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { ApiError, getCategories, searchBusinesses } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import type { BusinessListItem, Category } from "@/lib/types";

// Reads cookies and live data.
export const dynamic = "force-dynamic";

export default async function HomePage(): Promise<JSX.Element> {
  const user = await getCurrentUser();

  // One failing panel should not blank the whole page, so each is settled
  // independently and rendered with its own fallback.
  const [categoriesResult, featuredResult] = await Promise.allSettled([
    getCategories(),
    searchBusinesses({ sort: "rating", page_size: 3, min_rating: 4.5 }),
  ]);

  const categories: Category[] =
    categoriesResult.status === "fulfilled" ? categoriesResult.value : [];
  const featured: BusinessListItem[] =
    featuredResult.status === "fulfilled" ? featuredResult.value.items : [];

  const categoriesError =
    categoriesResult.status === "rejected"
      ? describe(categoriesResult.reason)
      : null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold">
          JustDial CA
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {user === null ? (
            <ButtonLink href="/login" size="sm">
              Sign in
            </ButtonLink>
          ) : (
            <>
              <span className="text-slate-600">{user.name}</span>
              <ButtonLink href="/dashboard" variant="secondary" size="sm">
                Dashboard
              </ButtonLink>
              {user.is_admin ? (
                <ButtonLink href="/admin" variant="secondary" size="sm">
                  Admin
                </ButtonLink>
              ) : null}
              <LogoutButton />
            </>
          )}
        </nav>
      </header>

      <section className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Find local businesses across the GTA
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Search plumbers, dentists, restaurants and more. Filter by city and
          rating, or use your location to find what is closest.
        </p>
        <SearchBar className="mt-6" />
      </section>

      <section className="mb-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold text-slate-900">
            Browse by category
          </h2>
          <Link href="/search" className="text-sm underline">
            See all listings
          </Link>
        </div>

        {categoriesError !== null ? (
          <Card className="border-amber-200 bg-amber-50">
            <p className="text-sm text-amber-800">
              Categories are unavailable right now. {categoriesError}
            </p>
          </Card>
        ) : categories.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-600">
              No categories yet. Seed the backend with{" "}
              <code className="rounded bg-slate-100 px-1">
                python -m scripts.seed
              </code>
              .
            </p>
          </Card>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/search?category=${encodeURIComponent(category.slug)}`}
                  className="block h-full rounded-lg border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:border-slate-300 hover:shadow-md"
                >
                  <span aria-hidden="true" className="block text-2xl">
                    {category.icon ?? "•"}
                  </span>
                  <span className="mt-2 block text-sm font-medium text-slate-900">
                    {category.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {category.business_count}{" "}
                    {category.business_count === 1 ? "listing" : "listings"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {featured.length > 0 ? (
        <section>
          <h2 className="mb-4 text-xl font-semibold text-slate-900">
            Top rated right now
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((business) => (
              <BusinessCard key={business.id} business={business} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** A short, user-facing reason for a failed panel. */
function describe(reason: unknown): string {
  if (reason instanceof ApiError) {
    return reason.isNetworkError ? "The API is not reachable." : reason.message;
  }
  return "Please try again shortly.";
}
