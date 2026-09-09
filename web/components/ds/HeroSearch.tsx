"use client";

/**
 * The homepage search: What / Where, plus a real "near me".
 *
 * Larger sibling of HeaderSearch, and the same contract - it builds a real
 * /search URL with the parameters the backend already understands. The
 * geolocation path is Step 2's SearchBar logic unchanged: browser position,
 * a 25 km radius, sort by distance, and an error message that tells the
 * person what to do instead rather than just reporting failure.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LocateFixed, MapPin, Search } from "lucide-react";

import { Button } from "@/components/ds/primitives";
import { tFor, type Locale } from "@/lib/i18n";

/** Radius applied to a "near me" search, in km. Matches Step 2 and the app. */
const NEAR_ME_RADIUS_KM = 25;

export default function HeroSearch({
  locale = "en",
  /** Shown under the field as a hint - the seed's centre of gravity. */
  cityPlaceholder = "Vancouver",
}: {
  locale?: Locale;
  cityPlaceholder?: string;
}): JSX.Element {
  const t = tFor(locale);
  const router = useRouter();

  const [what, setWhat] = useState("");
  const [where, setWhere] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  function buildUrl(extra: Record<string, string> = {}): string {
    const params = new URLSearchParams();
    if (what.trim()) params.set("q", what.trim());
    if (where.trim()) params.set("city", where.trim());
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
    const qs = params.toString();
    return qs ? `/search?${qs}` : "/search";
  }

  function onSubmit(event: React.FormEvent): void {
    event.preventDefault();
    setGeoError(null);
    router.push(buildUrl());
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
        router.push(
          buildUrl({
            lat: position.coords.latitude.toFixed(6),
            lng: position.coords.longitude.toFixed(6),
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
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div>
      <form
        onSubmit={onSubmit}
        role="search"
        className="flex flex-col gap-2 rounded-card border border-line-strong bg-surface p-2 shadow-raised sm:flex-row sm:items-center"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
          <Search className="size-5 shrink-0 text-ink-subtle" aria-hidden="true" />
          <input
            value={what}
            onChange={(event) => setWhat(event.target.value)}
            placeholder={t("common.searchPlaceholderWhat")}
            aria-label={t("common.searchPlaceholderWhat")}
            className="h-11 w-full min-w-0 bg-transparent text-[0.9375rem] text-ink placeholder:text-ink-subtle focus:outline-none"
          />
        </div>

        <div className="h-px w-full bg-line sm:h-8 sm:w-px" aria-hidden="true" />

        <div className="flex min-w-0 flex-1 items-center gap-2 px-2 sm:max-w-[16rem]">
          <MapPin className="size-5 shrink-0 text-ink-subtle" aria-hidden="true" />
          <input
            value={where}
            onChange={(event) => setWhere(event.target.value)}
            placeholder={cityPlaceholder}
            aria-label={t("common.searchPlaceholderWhere")}
            className="h-11 w-full min-w-0 bg-transparent text-[0.9375rem] text-ink placeholder:text-ink-subtle focus:outline-none"
          />
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={useMyLocation}
            disabled={locating}
            className="flex-1 sm:flex-none"
          >
            <LocateFixed aria-hidden="true" />
            {locating ? t("common.loading") : t("common.nearMe")}
          </Button>
          <Button type="submit" size="lg" className="flex-1 sm:flex-none">
            {t("common.search")}
          </Button>
        </div>
      </form>

      {geoError !== null ? (
        <p
          role="status"
          className="mt-2 rounded-input bg-warning-bg px-3 py-2 text-meta text-warning"
        >
          {geoError}
        </p>
      ) : null}
    </div>
  );
}
