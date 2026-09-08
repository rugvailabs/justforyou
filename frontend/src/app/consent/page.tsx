"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import ConsentForm from "@/components/ConsentForm";
import ProtectedRoute from "@/components/ProtectedRoute";
import { apiGet, type ConsentResponse } from "@/lib/api";
import type { ConsentType } from "@/lib/config";

function ConsentPageInner() {
  const router = useRouter();
  const [granted, setGranted] = useState<ConsentType[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const rows = await apiGet<ConsentResponse[]>("/consents");
        if (cancelled) return;
        const active = rows
          .filter((c) => c.revoked_at === null)
          .map((c) => c.consent_type as ConsentType);
        // Already permitted to record: skip the form entirely.
        if (active.includes("record_audio")) {
          router.replace("/record");
          return;
        }
        setGranted(active);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load your consents.");
          setGranted([]);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (granted === null) {
    return <p className="text-sm text-gray-500">Checking your permissions&hellip;</p>;
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Before we start</h1>
      <p className="mt-2 text-sm text-gray-600">
        Please tell us what you agree to. Each item is separate and optional, and you can
        change your mind later.
      </p>

      {error && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {error}
        </p>
      )}

      <div className="mt-6">
        <ConsentForm
          alreadyGranted={granted}
          onSuccess={(selected) => {
            if (selected.includes("record_audio") || granted.includes("record_audio")) {
              router.push("/record");
            } else {
              router.push("/dashboard");
            }
          }}
        />
      </div>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <ProtectedRoute>
      <ConsentPageInner />
    </ProtectedRoute>
  );
}
