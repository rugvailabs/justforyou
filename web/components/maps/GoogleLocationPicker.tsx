"use client";

/**
 * Pin picker for the listing form, on Google Maps.
 *
 * The Google counterpart of LocationPicker. Three ways to set the point, in
 * the order an owner is likely to reach for them: look up the address they
 * already typed, click the map, or drag the pin to the exact door.
 *
 * Address lookup uses the Geocoding service, which must be enabled on the
 * same Cloud project as the Maps JavaScript API. If it is not, the error says
 * so and the map still works by clicking.
 */

import {
  AdvancedMarker,
  APIProvider,
  ControlPosition,
  Map,
  MapControl,
  Pin,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { useState } from "react";

import { Button } from "@/components/ds/primitives";
import { GOOGLE_MAP_ID, GOOGLE_MAPS_API_KEY, PIN_BORDER, PIN_COLOUR, VANCOUVER } from "@/lib/maps";

type Props = {
  latitude: number | null;
  longitude: number | null;
  onPick: (lat: number, lng: number) => void;
  /** Street, city, province and postal code as typed, for the lookup. */
  addressQuery?: string;
};

/** Must live inside <Map> to reach the map instance and geocoding library. */
function AddressLookup({
  addressQuery,
  onPick,
}: {
  addressQuery: string;
  onPick: (lat: number, lng: number) => void;
}): JSX.Element {
  const map = useMap();
  const geocoding = useMapsLibrary("geocoding");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function lookUp(): Promise<void> {
    if (!geocoding || !map) return;
    setBusy(true);
    setMessage(null);
    try {
      const { results } = await new geocoding.Geocoder().geocode({
        address: addressQuery,
        region: "ca",
      });
      const best = results[0];
      if (!best) {
        setMessage("Google could not find that address. Click the map instead.");
        return;
      }
      const point = best.geometry.location.toJSON();
      onPick(point.lat, point.lng);
      map.panTo(point);
      map.setZoom(17);
      setMessage(`Found: ${best.formatted_address}. Drag the pin if it is not exact.`);
    } catch {
      setMessage(
        "Address lookup failed - the Geocoding API may not be enabled for this key. Click the map instead.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <MapControl position={ControlPosition.TOP_LEFT}>
      <div className="m-2 flex max-w-[18rem] flex-col items-start gap-1">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || !geocoding || addressQuery.trim() === ""}
          onClick={lookUp}
          className="shadow-raised"
        >
          {busy ? "Finding…" : "Find address on map"}
        </Button>
        {message !== null ? (
          <span className="rounded-input bg-surface px-2 py-1 text-meta text-ink-muted shadow-raised">
            {message}
          </span>
        ) : null}
      </div>
    </MapControl>
  );
}

export default function GoogleLocationPicker({
  latitude,
  longitude,
  onPick,
  addressQuery = "",
}: Props): JSX.Element {
  const hasPoint = latitude !== null && longitude !== null;
  const point = hasPoint ? { lat: latitude as number, lng: longitude as number } : null;

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <div className="h-72 w-full overflow-hidden rounded-card border border-line">
        <Map
          mapId={GOOGLE_MAP_ID}
          defaultCenter={point ?? VANCOUVER}
          defaultZoom={point ? 16 : 12}
          gestureHandling="cooperative"
          streetViewControl={false}
          mapTypeControl={false}
          clickableIcons={false}
          style={{ height: "100%", width: "100%" }}
          onClick={(event) => {
            const latLng = event.detail.latLng;
            if (latLng) onPick(latLng.lat, latLng.lng);
          }}
        >
          <AddressLookup addressQuery={addressQuery} onPick={onPick} />
          {point ? (
            <AdvancedMarker
              position={point}
              draggable
              title="Business location"
              onDragEnd={(event) => {
                const latLng = event.latLng;
                if (latLng) onPick(latLng.lat(), latLng.lng());
              }}
            >
              <Pin background={PIN_COLOUR} borderColor={PIN_BORDER} glyphColor="#ffffff" />
            </AdvancedMarker>
          ) : null}
        </Map>
      </div>
      <p className="mt-1 text-meta text-ink-muted">
        {point
          ? `Pin at ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)} - drag it or click the map to move it.`
          : "Find the address above, or click the map to drop a pin for this business."}
      </p>
    </APIProvider>
  );
}
