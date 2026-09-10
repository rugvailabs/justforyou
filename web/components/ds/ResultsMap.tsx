"use client";

/**
 * Loads the results map with SSR disabled.
 *
 * next/dynamic with ssr:false is only allowed inside a Client Component, so
 * this shim exists to keep the search page itself a Server Component.
 */

import dynamic from "next/dynamic";

import type { BusinessListItem } from "@/lib/types";

const ResultsMapView = dynamic(() => import("@/components/ds/ResultsMapView"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full w-full items-center justify-center bg-surface-muted text-meta text-ink-muted"
      role="status"
    >
      Loading map…
    </div>
  ),
});

export default function ResultsMap({
  businesses,
  className,
}: {
  businesses: BusinessListItem[];
  className?: string;
}): JSX.Element {
  return <ResultsMapView businesses={businesses} className={className} />;
}
