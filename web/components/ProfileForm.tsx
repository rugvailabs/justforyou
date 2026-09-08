"use client";

/**
 * Edit the signed-in user's own details.
 *
 * Only the three fields PATCH /profile accepts are editable. Email and role
 * are shown on the page but not here: email is the login identity, and a role
 * you can set yourself is not a role.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import Button from "@/components/ui/Button";
import type { PreferredContactMethod, UserResponse } from "@/lib/types";

const INPUT =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm " +
  "focus:border-slate-900 focus:outline-none";

const CONTACT_METHODS: { value: PreferredContactMethod; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "sms", label: "Text message" },
  { value: "phone", label: "Phone call" },
];

export default function ProfileForm({ user }: { user: UserResponse }): JSX.Element {
  const router = useRouter();

  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [contact, setContact] = useState<PreferredContactMethod>(
    user.preferred_contact_method,
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name.trim() !== user.name ||
    phone.trim() !== (user.phone ?? "") ||
    contact !== user.preferred_contact_method;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!name.trim()) {
      setError("Your name cannot be empty.");
      return;
    }

    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          // Empty clears the number rather than storing "".
          phone: phone.trim() || null,
          preferred_contact_method: contact,
        }),
      });
      const body: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          body && typeof body === "object" && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : `Could not save (HTTP ${res.status}).`,
        );
        return;
      }

      setSaved(true);
      // Re-run the Server Components so the header picks up a changed name.
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
        <input
          required
          maxLength={255}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          className={INPUT}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">
          Phone <span className="font-normal text-slate-500">(optional)</span>
        </span>
        <input
          type="tel"
          maxLength={32}
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setSaved(false);
          }}
          className={INPUT}
        />
      </label>

      <label className="block sm:w-56">
        <span className="mb-1 block text-sm font-medium text-slate-700">
          Preferred contact
        </span>
        <select
          value={contact}
          onChange={(e) => {
            setContact(e.target.value as PreferredContactMethod);
            setSaved(false);
          }}
          className={INPUT}
        >
          {CONTACT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {error !== null ? (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {saved ? (
        <p role="status" className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Saved.
        </p>
      ) : null}

      <Button type="submit" disabled={saving || !dirty}>
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
