/**
 * Report that a search result was chosen. Browser only.
 *
 * sendBeacon because the click usually navigates away at once, and an
 * ordinary fetch is cancelled with the page; the beacon is handed to the
 * browser and delivered anyway. Falls back to a keepalive fetch. Never throws.
 */

import type { ClickAction } from "@/lib/types";

export function trackSearchClick(
  searchId: string | null | undefined,
  businessId: number,
  action: ClickAction,
): void {
  if (!searchId || typeof window === "undefined") return;
  const body = JSON.stringify({ search_id: searchId, business_id: businessId, action });
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/search/clicks", blob)) return;
    void fetch("/api/search/clicks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Analytics must never get in the way of the click itself.
  }
}
