/**
 * Admin: directory listing moderation.
 *
 * Replaces the Step 1 stub that only proved the role gate worked.
 *
 * Middleware checks the cached role cookie; requireAdmin() re-checks against
 * /me, which is the check that actually holds. The status filter lives in the
 * URL so a particular queue view is linkable.
 */

import Link from "next/link";

import LogoutButton from "@/components/LogoutButton";
import ModerationQueue from "@/components/ModerationQueue";
import Card from "@/components/ui/Card";
import { ApiError, getModerationQueue, getModerationStats } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import type {
  BusinessStatus,
  ModerationQueueItem,
  ModerationStats,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const TABS: { status: BusinessStatus; label: string }[] = [
  { status: "pending", label: "Pending" },
  { status: "approved", label: "Live" },
  { status: "rejected", label: "Rejected" },
  { status: "suspended", label: "Suspended" },
];

function isStatus(value: string | undefined): value is BusinessStatus {
  return (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "suspended"
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { status?: string };
}): Promise<JSX.Element> {
  const user = await requireAdmin("/admin");

  // Unknown values fall back to the queue rather than erroring.
  const active: BusinessStatus = isStatus(searchParams.status)
    ? searchParams.status
    : "pending";

  let items: ModerationQueueItem[] = [];
  let stats: ModerationStats | null = null;
  let error: string | null = null;

  try {
    [items, stats] = await Promise.all([
      getModerationQueue(active, { limit: 100 }),
      getModerationStats(),
    ]);
  } catch (cause) {
    error =
      cause instanceof ApiError
        ? cause.isNetworkError
          ? "The API is not reachable. Is the backend running on port 8000?"
          : cause.message
        : "Could not load the moderation queue.";
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold">
          JustDial CA
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">{user.name} · admin</span>
          <LogoutButton />
        </nav>
      </header>

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Listing moderation
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Approve a listing to make it visible in public search. Rejecting or
        suspending takes a reason, which the owner sees on their dashboard.
      </p>

      <nav className="mt-5 flex flex-wrap gap-2" aria-label="Filter by status">
        {TABS.map((tab) => {
          const count = stats?.[tab.status] ?? 0;
          const selected = tab.status === active;
          return (
            <Link
              key={tab.status}
              href={`/admin?status=${tab.status}`}
              aria-current={selected ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                selected
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {tab.label} ({count})
            </Link>
          );
        })}
      </nav>

      <div className="mt-6">
        {error !== null ? (
          <Card className="border-red-200 bg-red-50">
            <h2 className="font-semibold text-red-800">
              Could not load the queue
            </h2>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </Card>
        ) : (
          // Keyed on the filter so switching tabs rebuilds the list rather than
          // reusing the previous tab's optimistic state.
          <ModerationQueue key={active} items={items} />
        )}
      </div>
    </div>
  );
}
