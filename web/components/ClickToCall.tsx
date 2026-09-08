"use client";

/**
 * Hidden-until-clicked phone number, the way directory sites do it.
 *
 * Revealing on click is what creates the trackable moment: the click is the
 * lead, not the page view.
 *
 * The reveal fires a `call_click` enquiry so the owner sees it in their leads
 * inbox. It is fire-and-forget on purpose: revealing the number is the user's
 * intent and must never wait on, or be blocked by, lead tracking.
 */

import { useState } from "react";

import Button from "@/components/ui/Button";

/**
 * Record the reveal as a lead.
 *
 * Goes through our own route handler rather than :8000 directly: the API has
 * no CORS, and the handler is what attaches the JWT for a signed-in customer
 * so the lead is attributed rather than anonymous.
 *
 * Failures are swallowed. A lost analytics event must never surface as an
 * error over a phone number the user asked to see.
 */
async function trackCallClick(businessId: number): Promise<void> {
  try {
    await fetch("/api/enquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_id: businessId, enquiry_type: "call_click" }),
      // Survives the navigation if the user taps the tel: link immediately.
      keepalive: true,
    });
  } catch {
    // Deliberately ignored.
  }
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
