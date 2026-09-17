"use client";

/**
 * Google Maps with a single pin - the profile page and the admin listing view.
 *
 * The Google counterpart of MapView; MapEmbed picks between them. Same props,
 * so a page never needs to know which provider it got.
 */

import { AdvancedMarker, APIProvider, InfoWindow, Map, Pin } from "@vis.gl/react-google-maps";
import { useState } from "react";

import { GOOGLE_MAP_ID, GOOGLE_MAPS_API_KEY, PIN_BORDER, PIN_COLOUR } from "@/lib/maps";

export default function GooglePinMap({
  latitude,
  longitude,
  name,
  zoom = 15,
  className = "h-64 w-full rounded-card",
}: {
  latitude: number;
  longitude: number;
  name: string;
  zoom?: number;
  className?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const position = { lat: latitude, lng: longitude };

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <div className={`overflow-hidden ${className}`}>
        <Map
          mapId={GOOGLE_MAP_ID}
          defaultCenter={position}
          defaultZoom={zoom}
          // A map inside a scrolling page must not hijack the scroll wheel;
          // "cooperative" asks for ctrl+scroll or two fingers instead.
          gestureHandling="cooperative"
          streetViewControl={false}
          mapTypeControl={false}
          style={{ height: "100%", width: "100%" }}
        >
          <AdvancedMarker position={position} title={name} onClick={() => setOpen(true)}>
            <Pin background={PIN_COLOUR} borderColor={PIN_BORDER} glyphColor="#ffffff" />
          </AdvancedMarker>
          {open ? (
            <InfoWindow position={position} pixelOffset={[0, -38]} onCloseClick={() => setOpen(false)}>
              <span className="text-[0.8125rem] font-semibold text-slate-900">{name}</span>
            </InfoWindow>
          ) : null}
        </Map>
      </div>
    </APIProvider>
  );
}
