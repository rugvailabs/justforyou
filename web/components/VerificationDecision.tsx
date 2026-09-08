"use client";

/**
 * Approve or reject one KYC submission.
 *
 * Approve is one click: it is the common case, it is reversible by rejecting
 * afterwards, and adding a confirmation to the action a reviewer takes forty
 * times an hour just trains them to click through confirmations.
 *
 * Reject is not, because it requires a reason the owner will read and act on.
 * The reason field IS the confirmation - there is no separate "are you sure",
 * because writing a sentence is already a deliberate act.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { FIELD, LABEL } from "@/components/ui/field";
import type { VerificationStatus } from "@/lib/types";

interface Props {
  verificationId: number;
  businessName: string;
  status: VerificationStatus;
  /** Where to go after a decision. Omit to stay put and just refresh. */
  redirectTo?: string;
}

export default function VerificationDecision({
  verificationId,
  businessName,
  status,
  redirectTo,
}: Props): JSX.Element {
  const router = useRouter();

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  async function decide(
    action: "approve" | "reject",
    body: Record<string, unknown> = {},
  ): Promise<void> {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/verifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verification_id: verificationId,
          action,
          ...body,
        }),
      });

      if (!res.ok) {
        const payload: unknown = await res.json().catch(() => null);
        setError(
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : `Could not ${action} (HTTP ${res.status}).`,
        );
        return;
      }

      setDone(action === "approve" ? "approved" : "rejected");
      setRejecting(false);
      // The queue is a Server Component, so this is what drops the row out of
      // it. When this is the detail page, the panel above repaints instead.
      router.refresh();
      if (redirectTo !== undefined) router.push(redirectTo);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (done !== null) {
    return (
      <Alert tone={done === "approved" ? "success" : "info"}>
        {done === "approved"
          ? `${businessName} is verified. It appears in search as soon as its listing is approved too.`
          : `${businessName} was rejected. The owner can read the reason and resubmit.`}
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {error !== null ? <Alert tone="error">{error}</Alert> : null}

      {status !== "pending" ? (
        <p className="text-sm text-slate-600">
          This submission is already {status}. Deciding again overwrites that.
        </p>
      ) : null}

      {rejecting ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <label htmlFor={`reason-${verificationId}`} className={LABEL}>
            Why can this not be verified?
          </label>
          <textarea
            id={`reason-${verificationId}`}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={FIELD}
            placeholder="The licence scan is cut off - we cannot read the expiry date."
            autoFocus
          />
          <p className="mt-1 text-xs text-slate-500">
            The owner sees this exactly as written, and it is all they have to
            go on. Name what is wrong and what would fix it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={busy !== null || reason.trim().length < 3}
              onClick={() => void decide("reject", { reason })}
            >
              {busy === "reject" ? "Rejecting…" : "Reject submission"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setRejecting(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy !== null}
            onClick={() => void decide("approve")}
          >
            {busy === "approve" ? "Approving…" : "Approve"}
          </Button>
          <Button variant="secondary" onClick={() => setRejecting(true)}>
            Reject…
          </Button>
        </div>
      )}
    </div>
  );
}
