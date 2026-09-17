"use client";

/**
 * The filter rail.
 *
 * Every control writes to the URL and nothing else - the page is a Server
 * Component that reads searchParams, so the URL is the state. That is what
 * makes a filtered search shareable and the back button behave, and it is why
 * this component holds almost no state of its own.
 *
 * Two rules the API enforces, mirrored here so a filter never produces a 422:
 *   - sort=distance requires a point, so it is only offered when the URL has
 *     one.
 *   - changing any filter invalidates the page number, so `page` is dropped on
 *     every change rather than left pointing at a page that may not exist.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { LocateFixed, SlidersHorizontal, X } from "lucide-react";

import { Button, Label, Select } from "@/components/ds/primitives";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { INTL_LOCALE, tFor, type Locale } from "@/lib/i18n";
import type { Category } from "@/lib/types";

const RATINGS = [
  { value: "", label: "Any rating" },
  { value: "3", label: "3.0 and up" },
  { value: "4", label: "4.0 and up" },
  { value: "4.5", label: "4.5 and up" },
];

const SORTS = [
  { value: "relevance", label: "Most relevant" },
  { value: "rating", label: "Highest rated" },
  { value: "reviews", label: "Most reviewed" },
  { value: "name", label: "Name (A–Z)" },
  { value: "newest", label: "Newest" },
];

export default function SearchFilterRail({
  categories,
  locale = "en",
}: {
  categories: Category[];
  locale?: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const intl = INTL_LOCALE[locale];
  const router = useRouter();
  const params = useSearchParams();

  // Collapsed on small screens: a rail above the results would push them off
  // the first screen entirely.
  const [open, setOpen] = useState(false);

  const hasPoint = params.get("lat") !== null && params.get("lng") !== null;
  const activeCategory = params.get("category") ?? "";
  const activeRating = params.get("min_rating") ?? "";
  const activeSort = params.get("sort") ?? (hasPoint ? "distance" : "relevance");
  const activeCity = params.get("city") ?? "";

  const activeCount = ["q", "category", "city", "min_rating", "sort", "lat"].filter(
    (key) => params.get(key) !== null,
  ).length;

  function apply(changes: Record<string, string | undefined>): void {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, value);
    }
    // A changed filter invalidates the current page number.
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/search?${qs}` : "/search");
  }

  const sortOptions = hasPoint
    ? [{ value: "distance", label: "Nearest first" }, ...SORTS]
    : SORTS;

  return (
    <div>
      <Button
        variant="secondary"
        className="mb-3 w-full lg:hidden"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="filter-rail"
      >
        <SlidersHorizontal aria-hidden="true" />
        Filters
        {activeCount > 0 ? (
          <span className="rounded-pill bg-brand-100 px-1.5 text-micro text-brand-800">
            {activeCount}
          </span>
        ) : null}
      </Button>

      <div
        id="filter-rail"
        className={cn(
          "space-y-5 rounded-card border border-line bg-surface p-4 shadow-raised",
          open ? "block" : "hidden lg:block",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-card-title text-ink">Filters</h2>
          {activeCount > 0 ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => router.push("/search")}
            >
              {t("empty.clearFilters")}
            </Button>
          ) : null}
        </div>

        {/* Category as a list rather than a select: it is the filter people
            reach for most, and the counts are worth showing. */}
        <div>
          <h3 className="mb-2 text-micro uppercase text-ink-subtle">Category</h3>
          <ul className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
            <li>
              <button
                type="button"
                onClick={() => apply({ category: undefined })}
                aria-current={activeCategory === "" ? "true" : undefined}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-input px-2 py-1.5 text-left text-body",
                  activeCategory === ""
                    ? "bg-brand-50 font-medium text-brand-800"
                    : "text-ink-muted hover:bg-surface-muted",
                )}
              >
                All categories
              </button>
            </li>
            {categories.map((category) => {
              const selected = category.slug === activeCategory;
              return (
                <li key={category.id}>
                  <button
                    type="button"
                    onClick={() =>
                      apply({ category: selected ? undefined : category.slug })
                    }
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-input px-2 py-1.5 text-left text-body",
                      selected
                        ? "bg-brand-50 font-medium text-brand-800"
                        : "text-ink-muted hover:bg-surface-muted",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {category.icon ? (
                        <span aria-hidden="true">{category.icon}</span>
                      ) : null}
                      <span className="truncate">{category.name}</span>
                    </span>
                    <span className="shrink-0 text-meta tabular text-ink-subtle">
                      {formatCount(category.business_count, intl)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <Label htmlFor="filter-city">City</Label>
          <input
            id="filter-city"
            defaultValue={activeCity}
            placeholder="Vancouver"
            // Commit on blur or Enter, not per keystroke: a request per letter
            // over a slow connection is worse than a beat of delay.
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value !== activeCity) apply({ city: value || undefined });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const value = event.currentTarget.value.trim();
                apply({ city: value || undefined });
              }
            }}
            className="h-10 w-full rounded-input border border-line-strong bg-surface px-3 text-body text-ink placeholder:text-ink-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>

        <div>
          <Label htmlFor="filter-rating">Minimum rating</Label>
          <Select
            id="filter-rating"
            value={activeRating}
            onChange={(event) => apply({ min_rating: event.target.value })}
          >
            {RATINGS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="filter-sort">Sort by</Label>
          <Select
            id="filter-sort"
            value={activeSort}
            onChange={(event) => apply({ sort: event.target.value })}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        {!hasPoint ? (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => apply({ near: "me" })}
          >
            <LocateFixed aria-hidden="true" />
            {t("common.nearMe")}
          </Button>
        ) : null}

        {hasPoint ? (
          <div className="rounded-input bg-brand-50 p-3">
            <p className="text-meta text-brand-800">
              Searching within {params.get("radius_km") ?? "25"} km of your
              location.
            </p>
            <Button
              variant="link"
              size="sm"
              className="mt-1 h-auto p-0"
              onClick={() =>
                apply({
                  near: undefined,
                  lat: undefined,
                  lng: undefined,
                  radius_km: undefined,
                  sort: undefined,
                })
              }
            >
              <X aria-hidden="true" />
              Clear location
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
