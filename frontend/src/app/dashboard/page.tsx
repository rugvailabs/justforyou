"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import ProtectedRoute from "@/components/ProtectedRoute";
import SubmissionResult from "@/components/SubmissionResult";
import { ApiError, apiGet, type SubmissionResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type ListState =
  | { kind: "loading" }
  | { kind: "ready"; rows: SubmissionResponse[] }
  | { kind: "missing" }
  | { kind: "error"; message: string };

/**
 * Submission list.
 *
 * BACKEND GAP: there is no `GET /api/v1/submissions` list endpoint. The backend
 * exposes only `GET /api/v1/submissions/{id}` for a single row. This component
 * calls the list endpoint anyway and reports the gap honestly rather than
 * rendering invented data.
 *
 * TODO(backend, small): add `GET /submissions` returning the current user's
 * submissions ordered by created_at desc.
 */
function SubmissionList() {
  const [state, setState] = useState<ListState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await apiGet<SubmissionResponse[]>("/submissions");
        if (!cancelled) setState({ kind: "ready", rows });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
          setState({ kind: "missing" });
        } else {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return <p className="text-sm text-gray-500">Loading submissions&hellip;</p>;
  }

  if (state.kind === "missing") {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Submission list not available yet</p>
        <p className="mt-1">
          The backend has no <code className="font-mono">GET /api/v1/submissions</code>{" "}
          endpoint &mdash; only the single-submission route. This is a small backend
          addition, not a frontend bug. No placeholder data is shown here on purpose.
        </p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
        Could not load submissions: {state.message}
      </p>
    );
  }

  if (state.rows.length === 0) {
    return <p className="text-sm text-gray-600">No submissions yet.</p>;
  }

  return (
    <ul className="divide-y divide-gray-200 rounded border border-gray-300 bg-white">
      {state.rows.map((s) => (
        <li key={s.id} className="p-3 text-sm">
          <Link href={`/submissions/${s.id}`} className="font-medium underline">
            Submission #{s.id}
          </Link>
          <span className="ml-2 text-gray-600">{s.status}</span>
          <span className="ml-2 text-gray-500">
            {new Date(s.created_at).toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DashboardInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const justSubmitted = searchParams.get("submitted") === "1";
  // Set by the record page so the dashboard can poll the request that was
  // just created rather than guessing which one is newest.
  const latestRaw = searchParams.get("latest");
  const latestId = latestRaw && /^\d+$/.test(latestRaw) ? Number(latestRaw) : null;

  return (
    <div className="space-y-6">
      {justSubmitted && (
        <p
          role="status"
          className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800"
        >
          Request received. Your match will appear below in a moment.
        </p>
      )}

      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">Signed in as {user?.email}</p>
      </div>

      {latestId !== null && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-800">
            Your latest request
          </h2>
          <SubmissionResult submissionId={latestId} />
        </section>
      )}

      <Link
        href="/record"
        className="inline-block rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Make a new request
      </Link>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-800">Your submissions</h2>
        <SubmissionList />
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<p className="text-sm text-gray-500">Loading&hellip;</p>}>
        <DashboardInner />
      </Suspense>
    </ProtectedRoute>
  );
}
