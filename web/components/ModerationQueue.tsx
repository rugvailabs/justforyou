"use client";

/**
 * The moderator's working list.
 *
 * A Client Component because a decision has to remove the row from the current
 * filter immediately - waiting a round trip to find out whether your click
 * landed is what makes people double-approve things.
 *
 * Reject and suspend take a reason the owner will read, so they open a small
 * inline prompt rather than firing on the first click. Approve does not: an
 * owner does not need to be told why they were let through.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import StatusBadge from "@/components/StatusBadge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import type { ModerationAction, ModerationQueueItem } from "@/lib/types";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

/** Whole days a listing has been waiting, for the queue-age hint. */
function daysWaiting(iso: string): number {
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
}

export default function ModerationQueue({
  items: initialItems,
}: {
  items: ModerationQueueItem[];
}): JSX.Element {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [promptFor, setPromptFor] = useState<{
    id: number;
    action: Exclude<ModerationAction, "approve">;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function decide(
    businessId: number,
    action: ModerationAction,
    why?: string,
  ): Promise<void> {
    setError(null);
    setPendingId(businessId);
    try {
      const res = await fetch("/api/admin/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: businessId, action, reason: why }),
      });
      const body: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          body && typeof body === "object" && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : `Could not apply that decision (HTTP ${res.status}).`,
        );
        return;
      }

      // The row no longer belongs in this filter, so drop it and let
      // router.refresh() reconcile the counts from the server.
      setItems((current) => current.filter((item) => item.id !== businessId));
      setPromptFor(null);
      setReason("");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <Card>
        <h2 className="font-semibold text-slate-900">Nothing to review</h2>
        <p className="mt-1 text-sm text-slate-600">
          No listings in this state right now.
        </p>
      </Card>
    );
  }

  return (
    <>
      {error !== null ? (
        <p role="alert" className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {items.map((item) => {
          const busy = pendingId === item.id;
          const waiting = daysWaiting(item.created_at);
          return (
            <li key={item.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-slate-900">{item.name}</h2>
                    <p className="text-sm text-slate-500">
                      {item.category_name} · {item.city}, {item.province}
                      {item.address !== null ? ` · ${item.address}` : ""}
                    </p>
                    <p className="text-sm text-slate-500">
                      Submitted {formatWhen(item.created_at)}
                      {waiting > 0 ? ` · waiting ${waiting}d` : ""}
                      {item.owner_email !== null ? ` · ${item.owner_email}` : " · no owner"}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>

                {item.description !== null ? (
                  <p className="text-sm text-slate-700">{item.description}</p>
                ) : null}

                <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                  {item.phone !== null ? <span>{item.phone}</span> : null}
                  {item.website !== null ? (
                    <a
                      href={item.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {item.website}
                    </a>
                  ) : null}
                </div>

                {item.moderation_note !== null ? (
                  <div className="rounded-md border-l-2 border-slate-300 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-medium text-slate-500">
                      Previous decision note
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {item.moderation_note}
                    </p>
                  </div>
                ) : null}

                {promptFor?.id === item.id ? (
                  <div className="rounded-md border border-slate-200 p-3">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        Reason for {promptFor.action === "reject" ? "rejecting" : "suspending"}
                      </span>
                      <textarea
                        rows={2}
                        maxLength={1000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="The owner will see this…"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                      />
                    </label>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy || reason.trim().length < 3}
                        onClick={() => decide(item.id, promptFor.action, reason.trim())}
                      >
                        {busy ? "Applying…" : `Confirm ${promptFor.action}`}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setPromptFor(null);
                          setReason("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {item.status !== "approved" ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => decide(item.id, "approve")}
                      >
                        {busy ? "Applying…" : "Approve"}
                      </Button>
                    ) : null}
                    {item.status !== "rejected" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setPromptFor({ id: item.id, action: "reject" });
                          setReason("");
                        }}
                      >
                        Reject
                      </Button>
                    ) : null}
                    {item.status === "approved" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setPromptFor({ id: item.id, action: "suspend" });
                          setReason("");
                        }}
                      >
                        Suspend
                      </Button>
                    ) : null}
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
