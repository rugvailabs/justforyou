"use client";

import { useCallback, useEffect, useState } from "react";

import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ApiError,
  apiGet,
  apiPost,
  type ReviewDetail,
  type ReviewListItem,
  type ReviewStats,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type Tab = "open" | "resolved";

function ageLabel(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

/** Anything older than this has been waiting too long to ignore. */
function ageTone(hours: number): string {
  if (hours >= 24) return "text-red-700 font-semibold";
  if (hours >= 4) return "text-amber-700";
  return "text-gray-500";
}

function StatsBar({ stats }: { stats: ReviewStats | null }) {
  if (!stats) return null;
  const tiles = [
    { label: "Open", value: String(stats.open_count) },
    { label: "Claimed", value: String(stats.claimed_count) },
    { label: "Longest wait", value: ageLabel(stats.oldest_age_hours) },
    { label: "Resolved today", value: String(stats.resolved_today) },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-gray-300 bg-gray-300 sm:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="bg-white px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-gray-500">{t.label}</div>
          <div className="text-lg font-semibold tabular-nums">{t.value}</div>
        </div>
      ))}
    </div>
  );
}

function QueueList({
  rows,
  selectedId,
  onSelect,
}: {
  rows: ReviewListItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded border border-gray-300 bg-white p-4 text-sm text-gray-600">
        Nothing here. Every ticket has been dealt with.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-gray-200 overflow-hidden rounded border border-gray-300 bg-white">
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onSelect(r.id)}
            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
              selectedId === r.id ? "bg-blue-50" : ""
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-xs text-gray-500">#{r.submission_id}</span>
              <span className={`text-xs tabular-nums ${ageTone(r.age_hours)}`}>
                {ageLabel(r.age_hours)}
              </span>
            </div>
            <div className="mt-0.5 line-clamp-2 text-gray-800">
              {r.preview || <span className="text-gray-400">(no text)</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-700">
                {r.reason_code}
              </span>
              {r.claimed_by && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">
                  claimed
                </span>
              )}
              {r.decision && (
                <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] text-green-900">
                  {r.decision}
                </span>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function TicketPane({
  detail,
  busy,
  error,
  draft,
  onDraftChange,
  onAction,
}: {
  detail: ReviewDetail;
  busy: string | null;
  error: string | null;
  draft: string;
  onDraftChange: (v: string) => void;
  onAction: (
    action: "claim" | "release" | "approve" | "reject" | "request-info",
  ) => void;
}) {
  const resolved = detail.resolved_at !== null;
  const edited = draft.trim() !== (detail.solution_text ?? "").trim();
  const reasons = detail.gate_json?.reasons ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Submission #{detail.submission_id}
        </h2>
        <span className="font-mono text-xs text-gray-500">
          {detail.submission_status} · {detail.input_type} · waiting{" "}
          {ageLabel(detail.age_hours)}
        </span>
      </div>

      {/* why it was held - the reviewer's first question */}
      <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="font-medium text-amber-900">Held because</span>
          {detail.confidence !== null && (
            <span className="font-mono text-xs text-amber-800">
              confidence {detail.confidence.toFixed(2)}
            </span>
          )}
        </div>
        <ul className="mt-1 list-inside list-disc text-amber-900">
          {reasons.length > 0 ? (
            reasons.map((r) => <li key={r}>{r}</li>)
          ) : (
            <li>{detail.reason}</li>
          )}
        </ul>
      </div>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          What the customer asked
        </h3>
        <p className="mt-1 whitespace-pre-wrap rounded border border-gray-300 bg-white p-3 text-sm">
          {detail.transcript || <span className="text-gray-400">(nothing captured)</span>}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {detail.customer_name} &lt;{detail.customer_email}&gt;
          {detail.category && ` · understood as ${detail.category}`}
          {detail.urgency && ` · ${detail.urgency} urgency`}
          {detail.location && ` · ${detail.location}`}
        </p>
      </section>

      {detail.provider_name && (
        <section className="rounded border border-gray-300 bg-white p-3 text-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Provider referenced
          </h3>
          <p className="mt-1">
            {detail.provider_name}
            {detail.provider_contact && (
              <span className="text-gray-600"> · {detail.provider_contact}</span>
            )}
          </p>
        </section>
      )}

      {detail.original_solution_text && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Original AI answer (kept for the record)
          </h3>
          <p className="mt-1 whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
            {detail.original_solution_text}
          </p>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Answer to send
          </h3>
          {edited && !resolved && (
            <span className="text-xs text-amber-700">edited — original will be kept</span>
          )}
        </div>
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          disabled={resolved}
          rows={12}
          className="mt-1 w-full rounded border border-gray-300 p-3 font-sans text-sm disabled:bg-gray-50 disabled:text-gray-600"
        />
      </section>

      {error && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {resolved ? (
        <div className="rounded border border-gray-300 bg-gray-50 p-3 text-sm">
          <p className="font-medium">
            {detail.decision} by {detail.decided_by}
          </p>
          {detail.reviewer_note && (
            <p className="mt-1 text-gray-600">{detail.reviewer_note}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {detail.claimed_by ? (
            <button
              type="button"
              onClick={() => onAction("release")}
              disabled={busy !== null}
              className="rounded border border-gray-400 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Release
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onAction("claim")}
              disabled={busy !== null}
              className="rounded border border-gray-400 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Claim
            </button>
          )}
          <button
            type="button"
            onClick={() => onAction("approve")}
            disabled={busy !== null}
            className="rounded bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {busy === "approve"
              ? "Sending…"
              : edited
                ? "Approve edited answer & send"
                : "Approve & send"}
          </button>
          <button
            type="button"
            onClick={() => onAction("request-info")}
            disabled={busy !== null}
            className="rounded border border-gray-400 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Need more info
          </button>
          <button
            type="button"
            onClick={() => onAction("reject")}
            disabled={busy !== null}
            className="rounded border border-red-400 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
      <p className="text-xs text-gray-500">
        Approving is the only way this reaches the customer. Rejecting closes the
        ticket and sends nothing.
      </p>
    </div>
  );
}

function ReviewConsole() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("open");
  const [rows, setRows] = useState<ReviewListItem[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // Fetchers own no state, so effects can await them and set state afterwards
  // rather than synchronously in the effect body.
  const fetchQueue = useCallback(async (which: Tab) => {
    const [items, s] = await Promise.all([
      apiGet<ReviewListItem[]>(
        `/review?limit=100${which === "resolved" ? "&resolved=true" : ""}`,
      ),
      apiGet<ReviewStats>("/review/stats"),
    ]);
    return { items, stats: s };
  }, []);

  const refreshQueue = useCallback(
    async (which: Tab) => {
      try {
        const { items, stats: s } = await fetchQueue(which);
        setRows(items);
        setStats(s);
        setListError(null);
      } catch (err) {
        setListError(
          err instanceof ApiError ? err.message : "Could not load the queue.",
        );
      }
    },
    [fetchQueue],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { items, stats: s } = await fetchQueue(tab);
        if (cancelled) return;
        setRows(items);
        setStats(s);
        setListError(null);
      } catch (err) {
        if (cancelled) return;
        setListError(
          err instanceof ApiError ? err.message : "Could not load the queue.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, fetchQueue]);

  useEffect(() => {
    if (selectedId === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const d = await apiGet<ReviewDetail>(`/review/${selectedId}`);
        if (cancelled) return;
        setDetail(d);
        setDraft(d.solution_text ?? "");
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Could not load this ticket.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const act = async (
    action: "claim" | "release" | "approve" | "reject" | "request-info",
  ) => {
    if (!detail) return;
    setError(null);

    let body: Record<string, unknown> = {};
    if (action === "approve") {
      const changed = draft.trim() !== (detail.solution_text ?? "").trim();
      body = changed ? { solution_text: draft.trim() } : {};
    } else if (action === "reject") {
      const reason = window.prompt("Why can this not be sent?");
      if (!reason) return;
      body = { reason };
    } else if (action === "request-info") {
      const question = window.prompt("What do we need from the customer?");
      if (!question) return;
      body = { question };
    }

    setBusy(action);
    try {
      const updated = await apiPost<ReviewDetail>(
        `/review/${detail.id}/${action}`,
        body,
      );
      setDetail(updated);
      setDraft(updated.solution_text ?? "");
      await refreshQueue(tab);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  };

  if (!user?.is_admin) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Reviewers only</p>
        <p className="mt-1">
          This queue is limited to accounts with the admin flag set.
        </p>
      </div>
    );
  }

  return (
    // The root layout caps content at max-w-3xl, which is too narrow for a
    // two-pane console. Break out of it without touching the customer pages.
    <div className="relative left-1/2 w-screen max-w-[88rem] -translate-x-1/2 space-y-4 px-4">
      <div>
        <h1 className="text-xl font-semibold">Review queue</h1>
        <p className="mt-1 text-sm text-gray-600">
          Answers the confidence gate would not send on its own. Nothing here has
          reached a customer.
        </p>
      </div>

      <StatsBar stats={stats} />

      <div className="flex gap-2 border-b border-gray-200">
        {(["open", "resolved"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setSelectedId(null);
              setDetail(null);
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "open" ? "Open" : "Resolved"}
          </button>
        ))}
      </div>

      {listError && (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {listError}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <QueueList rows={rows} selectedId={selectedId} onSelect={setSelectedId} />
        <div>
          {detail ? (
            <TicketPane
              detail={detail}
              busy={busy}
              error={error}
              draft={draft}
              onDraftChange={setDraft}
              onAction={act}
            />
          ) : (
            <p className="rounded border border-dashed border-gray-300 p-6 text-sm text-gray-500">
              Pick a ticket to review it.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <ProtectedRoute>
      <ReviewConsole />
    </ProtectedRoute>
  );
}
