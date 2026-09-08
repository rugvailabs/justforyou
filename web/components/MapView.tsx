"use client";

/**
 * Leaflet map with a single pin.
 *
 * Isolated as its own Client Component because Leaflet touches `window` at
 * import time, so it can never be server-rendered. Consumers must pull it in
 * with next/dynamic and `ssr: false` (see MapEmbed).
 *
 * Props are deliberately just lat/lng/name so the search results page can
 * reuse this later without knowing anything about a Business.
 */

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

/**
 * A divIcon rather than Leaflet's default marker.
 *
 * The stock icon resolves marker-icon.png by URL relative to the CSS, which
 * bundlers rewrite and Leaflet then 404s on - the classic "markers are
 * invisible" bug. Inline SVG has no asset to lose.
 */
const pinIcon = L.divIcon({
  className: "",
  html: `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26c0-7.73-6.27-14-14-14z" fill="#0f172a"/>
    <circle cx="14" cy="14" r="5.5" fill="#ffffff"/>
  </svg>`,
  iconSize: [28, 40],
  // Anchor at the tip of the pin, not its centre, or it points slightly north.
  iconAnchor: [14, 40],
  popupAnchor: [0, -36],
});

export default function MapView({
  latitude,
  longitude,
  name,
  zoom = 15,
  className = "h-64 w-full rounded-lg",
}: {
  latitude: number;
  longitude: number;
  name: string;
  zoom?: number;
  className?: string;
}): JSX.Element {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={zoom}
      scrollWheelZoom={false}
      className={className}
      // Leaflet panes stack above sticky headers otherwise.
      style={{ zIndex: 0 }}
    >
      <TileLayer
        // OpenStreetMap's tile usage policy requires attribution.
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Marker position={[latitude, longitude]} icon={pinIcon}>
        <Popup>{name}</Popup>
      </Marker>
    </MapContainer>
  );
}
