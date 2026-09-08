"use client";

/**
 * Hidden-until-clicked phone number.
 *
 * The behaviour is Step 3's ClickToCall, unchanged: revealing the number is
 * what creates the trackable lead, the enquiry is fire-and-forget so the
 * number appears whether or not tracking succeeds, and the request goes
 * through our own route handler because the API has no CORS and the JWT is in
 * an httpOnly cookie the browser cannot read.
 *
 * What is new is only the styling, and that once revealed the number is a real
 * tel: link in E.164 - on a phone that dials, and on a desktop it is still the
 * number, formatted the way Canadians read it.
 */

import { useState } from "react";
import { Phone } from "lucide-react";

import { Button } from "@/components/ds/primitives";
import { formatPhone, telHref } from "@/lib/format";
import { tFor, type Locale } from "@/lib/i18n";

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
    // Deliberately ignored: a lost analytics event must never surface as an
    // error over a phone number the user asked to see.
  }
}

export default function ShowNumber({
  businessId,
  phone,
  locale = "en",
  size = "sm",
  variant = "secondary",
  className,
}: {
  businessId: number;
  phone: string;
  locale?: Locale;
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
  className?: string;
}): JSX.Element {
  const t = tFor(locale);
  const [revealed, setRevealed] = useState(false);

  const display = formatPhone(phone) ?? phone;
  const href = telHref(phone);

  if (revealed && href !== null) {
    return (
      <Button asChild variant={variant} size={size} className={className}>
        <a href={href} className="tabular">
          <Phone aria-hidden="true" />
          {display}
        </a>
      </Button>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={() => {
        setRevealed(true);
        // Not awaited: the number appears immediately regardless.
        void trackCallClick(businessId);
      }}
    >
      <Phone aria-hidden="true" />
      {t("listing.showNumber")}
    </Button>
  );
}
