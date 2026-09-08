"use client";

import { useEffect, useState } from "react";

import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ApiError,
  apiGet,
  apiPatch,
  apiPost,
  type ConsentResponse,
  type UserResponse,
} from "@/lib/api";

function ProfileInner() {
  const [profile, setProfile] = useState<UserResponse | null>(null);
  const [consents, setConsents] = useState<ConsentResponse[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [me, rows] = await Promise.all([
          apiGet<UserResponse>("/profile"),
          apiGet<ConsentResponse[]>("/consents"),
        ]);
        if (!cancelled) {
          setProfile(me);
          setConsents(rows);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load your profile.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const updated = await apiPatch<UserResponse>("/profile", {
        name: profile.name,
        phone: profile.phone,
        preferred_contact_method: profile.preferred_contact_method,
      });
      setProfile(updated);
      setStatus("Profile saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id: number) => {
    setError(null);
    setStatus(null);
    try {
      const updated = await apiPost<ConsentResponse>(`/consents/${id}/revoke`);
      setConsents((rows) =>
        rows ? rows.map((c) => (c.id === updated.id ? updated : c)) : rows,
      );
      setStatus("Permission withdrawn.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not withdraw that.");
    }
  };

  if (error && !profile) {
    return (
      <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
        {error}
      </p>
    );
  }
  if (!profile) return <p className="text-sm text-gray-500">Loading&hellip;</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Your profile</h1>
        <p className="mt-1 text-sm text-gray-600">
          {profile.email}{" "}
          <span className="text-gray-400">
            (email changes need re-verification, so they are not editable here)
          </span>
        </p>
      </div>

      <form onSubmit={save} className="max-w-sm space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Name</span>
          <input
            type="text"
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-gray-700">Phone</span>
          <input
            type="tel"
            value={profile.phone ?? ""}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value || null })}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-gray-700">Preferred contact method</span>
          <select
            value={profile.preferred_contact_method}
            onChange={(e) =>
              setProfile({
                ...profile,
                preferred_contact_method: e.target
                  .value as UserResponse["preferred_contact_method"],
              })
            }
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="phone">Phone</option>
          </select>
        </label>

        {status && <p className="text-sm text-green-700">{status}</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <section>
        <h2 className="text-sm font-semibold text-gray-800">Your permissions</h2>
        {consents === null ? (
          <p className="mt-2 text-sm text-gray-500">Loading&hellip;</p>
        ) : consents.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">You have not granted any yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-200 rounded border border-gray-300 bg-white text-sm">
            {consents.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 p-3">
                <span>
                  <span className="font-mono">{c.consent_type}</span>
                  <span className="ml-2 text-gray-500">
                    {c.revoked_at
                      ? `withdrawn ${new Date(c.revoked_at).toLocaleDateString()}`
                      : `granted ${new Date(c.granted_at).toLocaleDateString()}`}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">
                    policy {c.policy_version}
                  </span>
                </span>
                {c.revoked_at === null && (
                  <button
                    type="button"
                    onClick={() => revoke(c.id)}
                    className="shrink-0 rounded border border-gray-400 px-3 py-1 text-xs hover:bg-gray-50"
                  >
                    Withdraw
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfileInner />
    </ProtectedRoute>
  );
}
