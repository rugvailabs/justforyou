/**
 * Map provider configuration, shared by every map in the app.
 *
 * Google Maps is the provider whenever a browser key is configured. Without
 * one the app falls back to the OpenStreetMap/Leaflet maps rather than
 * rendering a broken Google canvas, so a fresh checkout still has working
 * maps before anyone has created a Cloud project.
 *
 * NEXT_PUBLIC_ values are inlined when the dev server or build starts, so
 * adding or changing the key needs a restart of `npm run dev`.
 */

export const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/**
 * Advanced markers only render on a map with a Map ID. DEMO_MAP_ID is the one
 * Google provides for development; set a real one for production styling.
 */
export const GOOGLE_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";

export const hasGoogleMaps = GOOGLE_MAPS_API_KEY.trim() !== "";

/** Downtown Vancouver - where the directory's data actually is. */
export const VANCOUVER = { lat: 49.2827, lng: -123.1207 };

/**
 * The brand token's literal value. Pins are handed to the Maps API rather than
 * to Tailwind, so a class name would never be compiled.
 */
export const PIN_COLOUR = "#0f756d";
export const PIN_BORDER = "#0b5953";

/**
 * Deep links into Google Maps. These are the public Maps URLs, not the
 * JavaScript API, so they need no key and cost nothing.
 */
export function googleDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat}%2C${lng}`;
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`;
}
