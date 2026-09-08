import type { VerificationStatus } from "@/lib/types";

/**
 * KYC status, shown next to the moderation status rather than merged with it.
 *
 * They are two decisions and an owner has to be able to tell which one is
 * holding their listing back - "Live" beside "Verification pending" is the
 * honest picture, and one combined badge would hide half of it.
 *
 * `null` means nothing has been submitted, which is a different state from
 * pending and gets different words.
 */
const STYLES: Record<
  VerificationStatus | "none",
  { label: string; className: string; hint: string }
> = {
  none: {
    label: "Not verified",
    className: "bg-slate-100 text-slate-700 ring-slate-300",
    hint: "Send your details to appear in search",
  },
  pending: {
    label: "Verification pending",
    className: "bg-amber-50 text-amber-800 ring-amber-200",
    hint: "We are checking your documents",
  },
  verified: {
    label: "Verified",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    hint: "Identity checked",
  },
  rejected: {
    label: "Verification rejected",
    className: "bg-red-50 text-red-700 ring-red-200",
    hint: "See the reason and resubmit",
  },
};

export default function VerificationBadge({
  status,
  showHint = false,
}: {
  status: VerificationStatus | null;
  showHint?: boolean;
}): JSX.Element {
  const style = STYLES[status ?? "none"];
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.className}`}
      >
        {style.label}
      </span>
      {showHint ? (
        <span className="text-xs text-slate-500">{style.hint}</span>
      ) : null}
    </span>
  );
}
