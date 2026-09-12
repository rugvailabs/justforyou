/**
 * Category glyphs, ported from the reference block's ICONS map.
 *
 * Inline stroke paths rather than images: twelve categories would otherwise be
 * twelve image requests for artwork that is 200 bytes of path data. Only the
 * glyphs our real taxonomy uses are kept - the source shipped 33 for a sample
 * catalogue we do not have.
 */

export type IconKey =
  | "auto"
  | "beauty"
  | "build"
  | "food"
  | "health"
  | "home"
  | "gear"
  | "server"
  | "bulb"
  | "box"
  | "shield"
  | "trophy";

export const CATEGORY_ICONS: Record<IconKey, string> = {
  auto: "M4 16v-3l2-5h12l2 5v3M4 16h16M7 16v2M17 16v2M7 12h10",
  beauty: "M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9Z",
  build: "M4 21V7l8-4v18M12 21h8V11h-8M7 10h2M7 14h2M15 15h2",
  food: "M7 3v7a2 2 0 0 0 4 0V3M9 10v11M15 21V3c2 1 3 3 3 6s-1 4-3 4",
  health: "M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z",
  home: "M3 11 12 4l9 7M5 10v10h14V10M10 20v-5h4v5",
  gear: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2",
  server: "M3 4h18v6H3zM3 14h18v6H3zM7 7h.01M7 17h.01",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 0 0-4-10Z",
  box: "m12 3 9 5v8l-9 5-9-5V8l9-5ZM3 8l9 5 9-5M12 13v10",
  shield: "M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6l-8-3ZM9 12l2 2 4-4",
  trophy: "M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M10 14v3h4v-3M8 21h8",
};

/**
 * Which glyph each real category slug wears.
 *
 * Keyed by slug rather than display name: a name can be edited in the admin,
 * a slug is the identity the rest of the app routes on. An unmapped slug falls
 * back rather than crashing - see CategoryIcon.
 */
export const ICON_FOR_SLUG: Record<string, IconKey> = {
  plumbers: "build",
  electricians: "bulb",
  restaurants: "food",
  dentists: "health",
  "auto-repair": "gear",
  gyms: "trophy",
  salons: "beauty",
  movers: "box",
  "it-support": "server",
  legal: "shield",
  hotels: "home",
  "car-rentals": "auto",
};
