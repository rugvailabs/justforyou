"use client";

/**
 * Loads the results map with SSR disabled.
 *
 * next/dynamic with ssr:false is only allowed inside a Client Component, so
 * this shim exists to keep the search page itself a Server Component. It also
 * picks the provider: Google Maps when a key is configured, Leaflet otherwise.
 */

import dynamic from "next/dynamic";

import { hasGoogleMaps } from "@/lib/maps";
import type { BusinessListItem } from "@/lib/types";

type Props = {
  businesses: BusinessListItem[];
  /** The searcher's position on a near-me search. */
  origin?: { lat: number; lng: number };
  className?: string;
};

const ResultsMapView = dynamic<Props>(
  () =>
    hasGoogleMaps
      ? import("@/components/maps/GoogleResultsMap")
      : import("@/components/ds/ResultsMapView"),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex h-full w-full items-center justify-center bg-surface-muted text-meta text-ink-muted"
        role="status"
      >
        Loading map…
      </div>
    ),
  },
);

export default function ResultsMap(props: Props): JSX.Element {
  return <ResultsMapView {...props} />;
}
