"use client";

/**
 * Category / city / minimum-rating / sort controls.
 *
 * Every control writes straight to the URL query string rather than to local
 * state, so the URL is the single source of truth: results are shareable,
 * the back button works, and the Server Component on /search re-fetches from
 * searchParams alone.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import Button from "@/components/ui/Button";
import type { Category } from "@/lib/types";

const MIN_RATINGS = [
  { value: "", label: "Any rating" },
  { value: "3", label: "3.0+" },
  { value: "3.5", label: "3.5+" },
  { value: "4", label: "4.0+" },
  { value: "4.5", label: "4.5+" },
];

const SORTS = [
  { value: "relevance", label: "Most relevant" },
  { value: "rating", label: "Highest rated" },
  { value: "reviews", label: "Most reviewed" },
  { value: "name", label: "Name (A-Z)" },
  { value: "newest", label: "Newest" },
];

const SELECT_CLASS =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm " +
  "focus:border-slate-900 focus:outline-none";

export default function SearchFilters({
  categories,
}: {
  categories: Category[];
}): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Only offered when the URL carries a point, since the API 422s on
  // sort=distance without lat/lng.
  const hasPoint = searchParams.get("lat") !== null && searchParams.get("lng") !== null;

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      // Any filter change invalidates the current page.
      params.delete("page");
      const qs = params.toString();
      router.push(qs ? `/search?${qs}` : "/search");
    },
    [router, searchParams],
  );

  const sortOptions = hasPoint
    ? [{ value: "distance", label: "Nearest first" }, ...SORTS]
    : SORTS;

  // "Clear all" is only useful once something is actually set.
  const activeCount = ["q", "city", "category", "min_rating", "sort", "lat"].filter(
    (k) => searchParams.get(k),
  ).length;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Category</span>
        <select
          value={searchParams.get("category") ?? ""}
          onChange={(e) => setParam("category", e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name} ({c.business_count})
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">City</span>
        <input
          type="text"
          defaultValue={searchParams.get("city") ?? ""}
          placeholder="Toronto"
          // Commit on blur/Enter rather than per keystroke, so typing a city
          // does not push a history entry per character.
          onBlur={(e) => setParam("city", e.target.value.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setParam("city", e.currentTarget.value.trim());
            }
          }}
          className={SELECT_CLASS}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">
          Minimum rating
        </span>
        <select
          value={searchParams.get("min_rating") ?? ""}
          onChange={(e) => setParam("min_rating", e.target.value)}
          className={SELECT_CLASS}
        >
          {MIN_RATINGS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Sort by</span>
        <select
          value={searchParams.get("sort") ?? (hasPoint ? "distance" : "relevance")}
          onChange={(e) => setParam("sort", e.target.value)}
          className={SELECT_CLASS}
        >
          {sortOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      {activeCount > 0 ? (
        <div className="sm:col-span-2 lg:col-span-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/search")}
            type="button"
          >
            Clear all filters
          </Button>
          {hasPoint ? (
            <span className="ml-2 text-sm text-slate-500">
              Showing results near you.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
