"use client";

/**
 * Hidden-until-clicked phone number, the way directory sites do it.
 *
 * Revealing on click is what creates the trackable moment: the click is the
 * lead, not the page view.
 *
 * LEAD TRACKING IS NOT WIRED. The step this came from specifies firing
 * `POST /businesses/{id}/enquiries` with `type: "CALL_CLICK"` on reveal, but
 * that endpoint does not exist on the backend (there is no `enquiries` table
 * and no route). Rather than fire-and-forget into a 404 - which looks like it
 * works, silently records nothing, and litters the console - the call is
 * isolated in `trackCallClick` below and left inert. Wiring it up is a
 * one-function change once the endpoint lands.
 */

import { useState } from "react";

import Button from "@/components/ui/Button";

/**
 * Where the tracked enquiry POST goes once the backend has it.
 *
 * Deliberately not called yet. When implemented it must stay fire-and-forget:
 * revealing the number is the user's intent and must never wait on, or be
 * blocked by, analytics.
 */
async function trackCallClick(_businessId: number): Promise<void> {
  // TODO(backend): POST /businesses/{id}/enquiries { type: "CALL_CLICK" }
  // via a same-origin route handler - the API has no CORS, so the browser
  // cannot post to :8000 directly.
  return;
}

/** Show a number as digits only for the tel: href. */
function toTelHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export default function ClickToCall({
  businessId,
  phone,
  className = "",
}: {
  businessId: number;
  phone: string;
  className?: string;
}): JSX.Element {
  const [revealed, setRevealed] = useState(false);

  function reveal(): void {
    setRevealed(true);
    // Not awaited: the number appears immediately regardless.
    void trackCallClick(businessId);
  }

  if (!revealed) {
    return (
      <Button onClick={reveal} className={className}>
        📞 Show number
      </Button>
    );
  }

  return (
    <a
      href={toTelHref(phone)}
      className={`inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 ${className}`.trim()}
    >
      📞 {phone}
    </a>
  );
}
