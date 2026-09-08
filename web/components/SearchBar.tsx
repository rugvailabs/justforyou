"use client";

/**
 * Text + city search, with an optional "use my location" shortcut.
 *
 * Submitting navigates to /search with the filters in the query string, which
 * is the single source of truth: the results page is a Server Component that
 * reads searchParams and does the fetch. Nothing here calls the API directly -
 * the backend has no CORS, so the browser cannot reach it.
 *
 * Geolocation is only ever used after an explicit click. The browser still
 * shows its own permission prompt; if the user declines we say so and leave
 * the city box as the way through.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import Button from "@/components/ui/Button";

/** Matches the seed data's centre of gravity. */
const DEFAULT_CITY_PLACEHOLDER = "Toronto";

/** Radius applied to a "near me" search, in km. */
const NEAR_ME_RADIUS_KM = 25;

export default function SearchBar({
  initialQuery = "",
  initialCity = "",
  className = "",
}: {
  initialQuery?: string;
  initialCity?: string;
  className?: string;
}): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(initialQuery);
  const [city, setCity] = useState(initialCity);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  /** Build /search?… preserving filters we do not own (category, sort, rating). */
  function buildUrl(extra: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    for (const key of ["category", "min_rating", "sort"]) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    if (q.trim()) params.set("q", q.trim());
    if (city.trim()) params.set("city", city.trim());
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined) params.delete(key);
      else params.set(key, value);
    }
    // A changed filter invalidates the current page number.
    params.delete("page");
    const qs = params.toString();
    return qs ? `/search?${qs}` : "/search";
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setGeoError(null);
    // A typed search overrides a previous "near me": the coordinates would
    // otherwise keep silently constraining results the user cannot see.
    router.push(buildUrl({ lat: undefined, lng: undefined, radius_km: undefined }));
  }

  function useMyLocation(): void {
    setGeoError(null);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("This browser does not support location sharing.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const { latitude, longitude } = position.coords;
        router.push(
          buildUrl({
            lat: latitude.toFixed(6),
            lng: longitude.toFixed(6),
            radius_km: String(NEAR_ME_RADIUS_KM),
            sort: "distance",
          }),
        );
      },
      (error) => {
        setLocating(false);
        setGeoError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission denied. Enter a city instead."
            : "Could not get your location. Enter a city instead.",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <div className={className}>
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-2 sm:flex-row"
        role="search"
      >
        <label className="flex-1">
          <span className="sr-only">What are you looking for?</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Plumbers, dentists, restaurants…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </label>

        <label className="sm:w-56">
          <span className="sr-only">City</span>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={DEFAULT_CITY_PLACEHOLDER}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </label>

        <div className="flex gap-2">
          <Button type="submit">Search</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={useMyLocation}
            disabled={locating}
            title={`Search within ${NEAR_ME_RADIUS_KM} km of you`}
          >
            {locating ? "Locating…" : "📍 Near me"}
          </Button>
        </div>
      </form>

      {geoError !== null ? (
        <p role="status" className="mt-2 text-sm text-amber-700">
          {geoError}
        </p>
      ) : null}
    </div>
  );
}
