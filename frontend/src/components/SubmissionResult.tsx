"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError, apiGet, type SubmissionDetail } from "@/lib/api";

const POLL_INTERVAL_MS = 2500;
/** Roughly two minutes; a stalled pipeline must not poll forever. */
const MAX_POLLS = 48;

/** Statuses that mean the pipeline is still moving, so keep polling. */
const IN_FLIGHT = new Set([
  "SUBMITTED",
  "UPLOADED",
  "TRANSCRIBED",
  "EXTRACTED",
  "MATCHED",
]);

/** Statuses that mean it has stopped, for good or ill. */
const TERMINAL = new Set(["SENT", "NEEDS_REVIEW"]);

const STAGE_LABEL: Record<string, string> = {
  SUBMITTED: "Reading your request…",
  UPLOADED: "Received your recording…",
  TRANSCRIBED: "Transcribed — working out what you need…",
  EXTRACTED: "Understood — finding you a match…",
  MATCHED: "Match found — sending your confirmation…",
};

export default function SubmissionResult({ submissionId }: { submissionId: number }) {
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const pollsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const next = await apiGet<SubmissionDetail>(`/submissions/${submissionId}`);
        if (cancelled) return;
        setDetail(next);

        // Stop as soon as the pipeline has finished, or once we have a vetted
        // provider to show - at that point the email is just paperwork.
        const done =
          TERMINAL.has(next.status) ||
          next.match?.match_type === "provider" ||
          !IN_FLIGHT.has(next.status);

        if (done) return;

        pollsRef.current += 1;
        if (pollsRef.current >= MAX_POLLS) {
          setGaveUp(true);
          return;
        }
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Could not load this request.",
        );
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [submissionId]);

  if (error) {
    return (
      <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!detail) {
    return <p className="text-sm text-gray-500">Loading your request&hellip;</p>;
  }

  const match = detail.match;

  /* --- an exact provider match: show it, this is the whole point --------- */
  if (match?.match_type === "provider" && match.provider) {
    const p = match.provider;
    return (
      <div className="rounded border border-green-300 bg-green-50 p-4">
        <p className="text-sm font-medium text-green-900">We found a match</p>
        <p className="mt-2 text-base font-semibold text-gray-900">{p.name}</p>
        <p className="text-sm text-gray-700">
          {p.category} &middot; {p.region}
          {p.verified && (
            <span className="ml-2 rounded bg-green-200 px-1.5 py-0.5 text-xs text-green-900">
              verified
            </span>
          )}
        </p>
        <dl className="mt-3 space-y-1 text-sm">
          {p.contact_phone && (
            <div className="flex gap-2">
              <dt className="w-16 text-gray-500">Phone</dt>
              <dd>
                <a href={`tel:${p.contact_phone}`} className="underline">
                  {p.contact_phone}
                </a>
              </dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="w-16 text-gray-500">Email</dt>
            <dd>
              <a href={`mailto:${p.contact_email}`} className="underline">
                {p.contact_email}
              </a>
            </dd>
          </div>
        </dl>
        <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
          {match.solution_text}
        </p>
        <p className="mt-3 text-xs text-gray-500">
          {detail.status === "SENT"
            ? "We have also emailed you these details."
            : "We are sending you these details as well."}
        </p>
      </div>
    );
  }

  /* --- no vetted provider, or parked for review: no spinner ------------- */
  const stillWorking =
    match?.match_type === "ai_generated" ||
    detail.status === "NEEDS_REVIEW" ||
    gaveUp;

  if (stillWorking) {
    return (
      <div className="rounded border border-blue-300 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-medium">We&apos;re finding the best match</p>
        <p className="mt-1">
          We don&apos;t have a verified provider for this one yet, so a member of our
          team is looking into it. You&apos;ll receive an update by email or SMS
          shortly &mdash; you don&apos;t need to keep this page open.
        </p>
        {match?.solution_text && (
          <p className="mt-3 whitespace-pre-wrap text-blue-800">
            {match.solution_text}
          </p>
        )}
      </div>
    );
  }

  /* --- still in flight --------------------------------------------------- */
  return (
    <div className="rounded border border-gray-300 bg-white p-4">
      <p className="flex items-center gap-2 text-sm text-gray-700">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-600" />
        {STAGE_LABEL[detail.status] ?? "Working on it…"}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        This usually takes a few seconds.
      </p>
    </div>
  );
}
