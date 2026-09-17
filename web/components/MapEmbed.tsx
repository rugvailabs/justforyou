"use client";

/**
 * Client-side wrapper that loads the single-pin map with SSR disabled.
 *
 * `next/dynamic` with `ssr: false` is only allowed inside a Client Component,
 * so this thin shim exists to keep the detail page itself a Server Component.
 *
 * It is also where the provider is chosen: Google Maps when a key is
 * configured, the Leaflet/OpenStreetMap MapView otherwise (see lib/maps).
 */

import dynamic from "next/dynamic";

import { hasGoogleMaps } from "@/lib/maps";

type Props = {
  latitude: number;
  longitude: number;
  name: string;
  zoom?: number;
  className?: string;
};

const MapView = dynamic<Props>(
  () =>
    hasGoogleMaps
      ? import("@/components/maps/GooglePinMap")
      : import("@/components/MapView"),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex h-64 w-full items-center justify-center rounded-card border border-line bg-surface-muted text-meta text-ink-muted"
        role="status"
      >
        Loading map…
      </div>
    ),
  },
);

export default function MapEmbed(props: Props): JSX.Element {
  return <MapView {...props} />;
}
