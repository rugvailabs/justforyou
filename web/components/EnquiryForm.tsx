"use client";

/**
 * Callback / quote request on a public listing page.
 *
 * Works signed in or not, matching the backend's optional-auth endpoint. When
 * the visitor is signed in the server fills in their name/phone/email from
 * their account, so those fields are only genuinely required for anonymous
 * visitors - but they are offered either way, because the number to call back
 * on is often not the one on the account.
 */

import { useState } from "react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import type { EnquiryType } from "@/lib/types";

const INPUT =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm " +
  "focus:border-slate-900 focus:outline-none";

const KINDS: { value: Extract<EnquiryType, "callback" | "quote">; label: string }[] =
  [
    { value: "callback", label: "Request a callback" },
    { value: "quote", label: "Request a quote" },
  ];

export default function EnquiryForm({
  businessId,
  businessName,
}: {
  businessId: number;
  businessName: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"callback" | "quote">("callback");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: businessId,
          enquiry_type: kind,
          message: message.trim() || null,
          contact_name: name.trim() || null,
          contact_phone: phone.trim() || null,
          contact_email: email.trim() || null,
        }),
      });
      const body: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          body && typeof body === "object" && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : `Could not send that (HTTP ${res.status}).`,
        );
        return;
      }
      setSent(true);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <Card className="border-emerald-200 bg-emerald-50">
        <h2 className="font-semibold text-emerald-800">Enquiry sent</h2>
        <p className="mt-1 text-sm text-emerald-700">
          {businessName} has your request and can see your contact details.
        </p>
      </Card>
    );
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        ✉️ Request a callback or quote
      </Button>
    );
  }

  return (
    <Card>
      <h2 className="mb-3 font-semibold text-slate-900">Contact {businessName}</h2>
      <form onSubmit={onSubmit} className="space-y-3">
        <fieldset>
          <legend className="sr-only">What do you need?</legend>
          <div className="flex gap-2">
            {KINDS.map((k) => (
              <label
                key={k.value}
                className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${
                  kind === k.value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={k.value}
                  checked={kind === k.value}
                  onChange={() => setKind(k.value)}
                  className="sr-only"
                />
                {k.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Message
          </span>
          <textarea
            rows={3}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe what you need…"
            className={INPUT}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Your name
            </span>
            <input
              maxLength={255}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Phone
            </span>
            <input
              type="tel"
              maxLength={32}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </span>
            <input
              type="email"
              maxLength={320}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT}
            />
          </label>
        </div>

        <p className="text-xs text-slate-500">
          If you are signed in, your account details are used when you leave a
          field blank.
        </p>

        {error !== null ? (
          <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Send"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
