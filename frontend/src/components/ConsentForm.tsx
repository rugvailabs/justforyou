"use client";

import Link from "next/link";
import { useState } from "react";

import { ApiError, apiPost, type ConsentResponse } from "@/lib/api";
import {
  CONSENT_TYPES,
  POLICY_VERSION,
  PRIVACY_POLICY_URL,
  type ConsentType,
} from "@/lib/config";

/**
 * Normalise navigator.language to what the backend accepts: two letters, with
 * an optional two-letter region ("en", "fr-CA"). Anything else is dropped
 * rather than sent and rejected with a 422.
 */
function browserLanguage(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  const tag = navigator.language ?? "";
  return /^[A-Za-z]{2}(-[A-Za-z]{2})?$/.test(tag) ? tag : tag.slice(0, 2) || undefined;
}

interface Props {
  /** Consent types the user already holds; those checkboxes are pre-satisfied. */
  alreadyGranted?: ConsentType[];
  onSuccess?: (granted: ConsentType[]) => void;
}

export default function ConsentForm({ alreadyGranted = [], onSuccess }: Props) {
  // Deliberately empty: no box is ever checked by default (CASL/PIPEDA).
  const [checked, setChecked] = useState<Set<ConsentType>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (type: ConsentType) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const selected = [...checked];
    if (selected.length === 0) {
      setError("Select at least one item to continue, or go back.");
      return;
    }

    setSubmitting(true);
    const language = browserLanguage();
    try {
      // One POST per consent type. The backend stores one row per type, and
      // bundling several into a single call would defeat the point.
      for (const type of selected) {
        await apiPost<ConsentResponse>("/consents", {
          consent_type: type,
          policy_version: POLICY_VERSION,
          method: "checkbox",
          language,
        });
      }
      onSuccess?.(selected);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        {CONSENT_TYPES.map((option) => {
          const held = alreadyGranted.includes(option.type);
          return (
            <label
              key={option.type}
              className="flex gap-3 rounded border border-gray-300 p-4 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0"
                checked={held || checked.has(option.type)}
                disabled={held || submitting}
                onChange={() => toggle(option.type)}
              />
              <span className="text-sm">
                <span className="block font-medium text-gray-900">
                  {option.label}
                  {option.requiredForRecording && (
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      (required to submit a problem)
                    </span>
                  )}
                  {held && (
                    <span className="ml-2 text-xs font-normal text-green-700">
                      already granted
                    </span>
                  )}
                </span>
                {/* TODO: legal review - placeholder copy, needs FR translation (Law 25). */}
                <span className="mt-1 block text-gray-600">{option.description}</span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="rounded border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-medium">Why we ask this</p>
        <p className="mt-1">
          Canadian law (PIPEDA and CASL) requires your clear, separate permission before
          we record you or contact you. Nothing is pre-selected, each item is optional,
          and you can withdraw any of them later from your profile.
        </p>
        <p className="mt-2">
          <Link href={PRIVACY_POLICY_URL} className="underline">
            Read our privacy policy
          </Link>
          <span className="ml-2 text-blue-700">Policy version {POLICY_VERSION}</span>
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Agree and continue"}
      </button>
    </form>
  );
}
