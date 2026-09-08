"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import ProtectedRoute from "@/components/ProtectedRoute";
import { apiGet, type SubmissionResponse } from "@/lib/api";

function SubmissionInner() {
  const params = useParams<{ id: string }>();
  const [submission, setSubmission] = useState<SubmissionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const row = await apiGet<SubmissionResponse>(`/submissions/${params.id}`);
        if (!cancelled) setSubmission(row);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load this submission.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (error) {
    return (
      <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
        {error}
      </p>
    );
  }
  if (!submission) return <p className="text-sm text-gray-500">Loading&hellip;</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Submission #{submission.id}</h1>
      <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
        <dt className="font-medium text-gray-700">Status</dt>
        <dd>{submission.status}</dd>
        <dt className="font-medium text-gray-700">Submitted</dt>
        <dd>{new Date(submission.created_at).toLocaleString()}</dd>
        <dt className="font-medium text-gray-700">Language</dt>
        <dd>{submission.language_detected ?? "—"}</dd>
      </dl>
      <div>
        <h2 className="text-sm font-semibold text-gray-800">Transcript</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
          {submission.transcript ?? "Not transcribed yet."}
        </p>
      </div>
    </div>
  );
}

export default function SubmissionPage() {
  return (
    <ProtectedRoute>
      <SubmissionInner />
    </ProtectedRoute>
  );
}
