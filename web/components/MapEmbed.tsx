"use client";

/**
 * Client-side wrapper that loads MapView with SSR disabled.
 *
 * `next/dynamic` with `ssr: false` is only allowed inside a Client Component,
 * so this thin shim exists to keep the detail page itself a Server Component.
 */

import dynamic from "next/dynamic";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-64 w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-sm text-slate-500"
      role="status"
    >
      Loading map…
    </div>
  ),
});

export default function MapEmbed(props: {
  latitude: number;
  longitude: number;
  name: string;
  zoom?: number;
  className?: string;
}): JSX.Element {
  return <MapView {...props} />;
}
