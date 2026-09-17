"use client";

/**
 * Step 1: who you are, what the business is, where it is.
 *
 * Two modes. New: creates the account, so it asks for email and password too.
 * Edit: the account exists (the owner came back from a later step, or signed
 * in to resume), so the saved details are filled in and only they change.
 *
 * While nothing has been submitted, what has been typed is kept in this
 * browser (never the password), so closing the tab does not lose it. After the
 * first submit, everything lives server-side and follows the owner to any
 * device they sign in on.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ds/feedback";
import { HINT } from "@/components/ds/form";
import { Button, Card, Input, Label, Select } from "@/components/ds/primitives";
import { PROVINCES } from "@/lib/format";
import { hasGoogleMaps } from "@/lib/maps";
import type { Category, RegistrationDetails } from "@/lib/types";

type LocationPickerProps = {
  latitude: number | null;
  longitude: number | null;
  onPick: (lat: number, lng: number) => void;
  addressQuery?: string;
};

const LocationPicker = dynamic<LocationPickerProps>(
  () =>
    hasGoogleMaps
      ? import("@/components/maps/GoogleLocationPicker")
      : import("@/components/LocationPicker"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 w-full items-center justify-center rounded-card border border-line bg-surface-muted text-body text-ink-muted">
        Loading map…
      </div>
    ),
  },
);

const DRAFT_KEY = "jfy.registration.draft";

interface Draft {
  name: string;
  email: string;
  phone: string;
  businessName: string;
  categoryId: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
}

function readDraft(): Partial<Draft> | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Partial<Draft>) : null;
  } catch {
    return null;
  }
}

function writeDraft(draft: Draft): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private mode or storage full: the form still works, it just won't be
    // remembered.
  }
}

/** The defaults alone (Vancouver, BC) are not worth restoring. */
function hasTyped(draft: Partial<Draft>): boolean {
  return Boolean(
    draft.name || draft.email || draft.phone || draft.businessName || draft.address || draft.postalCode,
  );
}

function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to clear */
  }
}

export default function DetailsStep({
  categories,
  existing,
}: {
  categories: Category[];
  /** The saved account and details when editing; null to create an account. */
  existing: {
    account: { name: string; email: string; phone: string | null };
    details: RegistrationDetails | null;
  } | null;
}): JSX.Element {
  const router = useRouter();
  const editing = existing !== null;
  const saved = existing?.details ?? null;

  const [name, setName] = useState(existing?.account.name ?? "");
  const [email, setEmail] = useState(existing?.account.email ?? "");
  const [phone, setPhone] = useState(existing?.account.phone ?? "");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState(saved?.business_name ?? "");
  const [categoryId, setCategoryId] = useState(saved ? String(saved.category_id) : "");
  const [address, setAddress] = useState(saved?.address ?? "");
  const [city, setCity] = useState(saved?.city ?? "Vancouver");
  const [province, setProvince] = useState(saved?.province ?? "BC");
  const [postalCode, setPostalCode] = useState(saved?.postal_code ?? "");
  const [latitude, setLatitude] = useState<number | null>(saved?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(saved?.longitude ?? null);
  const [showMap, setShowMap] = useState(saved?.latitude != null);

  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [restored, setRestored] = useState(false);
  const loaded = useRef(false);

  // Restore an unsent draft once, on the client.
  useEffect(() => {
    if (editing || loaded.current) return;
    loaded.current = true;
    const draft = readDraft();
    if (draft === null || !hasTyped(draft)) return;
    if (draft.name) setName(draft.name);
    if (draft.email) setEmail(draft.email);
    if (draft.phone) setPhone(draft.phone);
    if (draft.businessName) setBusinessName(draft.businessName);
    if (draft.categoryId) setCategoryId(draft.categoryId);
    if (draft.address) setAddress(draft.address);
    if (draft.city) setCity(draft.city);
    if (draft.province) setProvince(draft.province);
    if (draft.postalCode) setPostalCode(draft.postalCode);
    if (draft.latitude != null && draft.longitude != null) {
      setLatitude(draft.latitude);
      setLongitude(draft.longitude);
      setShowMap(true);
    }
    setRestored(true);
  }, [editing]);

  // Keep the draft current as they type. The password is never written.
  useEffect(() => {
    if (editing || !loaded.current) return;
    const draft = {
      name, email, phone, businessName, categoryId, address, city, province, postalCode, latitude, longitude,
    };
    if (hasTyped(draft)) writeDraft(draft);
  }, [editing, name, email, phone, businessName, categoryId, address, city, province, postalCode, latitude, longitude]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setNeedsSignIn(false);

    if (!categoryId) {
      setError("Choose a category.");
      return;
    }

    setSubmitting(true);
    const details: RegistrationDetails = {
      business_name: businessName,
      category_id: Number(categoryId),
      address: address.trim() || null,
      city,
      province,
      postal_code: postalCode.trim() || null,
      latitude,
      longitude,
    };

    try {
      const res = await fetch("/api/register", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing ? { ...details, name, phone } : { ...details, name, email, phone, password },
        ),
      });
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const detail =
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : `Could not save your details (HTTP ${res.status}).`;
        setError(detail);
        setNeedsSignIn(res.status === 409 && detail.includes("Sign in"));
        return;
      }

      clearDraft();
      router.push("/register?step=2");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {restored ? (
        <Alert tone="info">
          We kept what you typed last time. Your password is never saved - enter it again.
        </Alert>
      ) : null}

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-card-title text-ink">Your account</h2>
          {editing ? (
            <p className="mt-0.5 text-meta text-ink-muted">
              You sign in as {existing?.account.email}.
            </p>
          ) : (
            <p className="mt-0.5 text-meta text-ink-muted">
              You will sign in with this email and password.{" "}
              <Link href="/login?next=%2Fregister" className="text-brand-700 underline underline-offset-4">
                Already started? Sign in to continue.
              </Link>
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="reg-name">Your name</Label>
            <Input id="reg-name" required maxLength={255} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {editing ? null : (
            <div>
              <Label htmlFor="reg-email">Email</Label>
              <Input id="reg-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
          <div className={editing ? "sm:col-span-2" : undefined}>
            <Label htmlFor="reg-phone">Mobile number</Label>
            <Input
              id="reg-phone"
              type="tel"
              required
              maxLength={32}
              autoComplete="tel"
              placeholder="(604) 555-0142"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          {editing ? null : (
            <div className="sm:col-span-2">
              <Label htmlFor="reg-password">Password</Label>
              <Input
                id="reg-password"
                type="password"
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className={HINT}>At least 8 characters.</p>
            </div>
          )}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-card-title text-ink">Your business</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="reg-business">Business name</Label>
            <Input id="reg-business" required maxLength={255} autoComplete="organization" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="reg-category">Category</Label>
            <Select id="reg-category" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Choose a category…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-card-title text-ink">Location</h2>
          <p className="mt-0.5 text-meta text-ink-muted">
            Your province also sets the sales tax (GST/HST) on paid plans.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="reg-address">Street address</Label>
            <Input id="reg-address" maxLength={255} autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="reg-city">City</Label>
            <Input id="reg-city" required maxLength={128} autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="reg-province">Province or territory</Label>
            <Select id="reg-province" required value={province} onChange={(e) => setProvince(e.target.value)}>
              {PROVINCES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.en}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="reg-postal">Postal code</Label>
            <Input id="reg-postal" maxLength={16} autoComplete="postal-code" placeholder="V6B 1A1" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
          </div>
        </div>

        {showMap ? (
          <LocationPicker
            latitude={latitude}
            longitude={longitude}
            onPick={(lat, lng) => {
              setLatitude(lat);
              setLongitude(lng);
            }}
            addressQuery={[address, city, province, postalCode].map((part) => part.trim()).filter(Boolean).join(", ")}
          />
        ) : (
          <div>
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowMap(true)}>
              Pin your location on the map
            </Button>
            <p className={HINT}>
              Optional. Pinned listings show a distance in &ldquo;near me&rdquo; searches.
            </p>
          </div>
        )}
      </Card>

      {error !== null ? (
        <Alert tone="error">
          {error}
          {needsSignIn ? (
            <>
              {" "}
              <Link href="/login?next=%2Fregister" className="font-medium underline underline-offset-4">
                Sign in
              </Link>
            </>
          ) : null}
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? "Saving…" : "Save and continue"}
        </Button>
      </div>
    </form>
  );
}
