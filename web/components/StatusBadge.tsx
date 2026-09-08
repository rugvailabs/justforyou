import Badge from "@/components/ui/Badge";
import type { BusinessStatus } from "@/lib/types";

/**
 * Moderation status, colour-coded so a pending listing is obviously not live.
 *
 * Colour alone never carries the meaning - the label is always present - so
 * this stays readable to colour-blind users and in monochrome.
 */
const STYLES: Record<
  BusinessStatus,
  { label: string; className: string; hint: string }
> = {
  pending: {
    label: "Pending review",
    className: "bg-amber-50 text-amber-800 ring-amber-200",
    hint: "Not visible in search until approved",
  },
  approved: {
    label: "Live",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    hint: "Visible in public search",
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-50 text-red-700 ring-red-200",
    hint: "Not visible in search",
  },
  suspended: {
    label: "Suspended",
    className: "bg-slate-200 text-slate-700 ring-slate-300",
    hint: "Removed from search by a moderator",
  },
};

export default function StatusBadge({
  status,
  showHint = false,
}: {
  status: BusinessStatus;
  showHint?: boolean;
}): JSX.Element {
  const style = STYLES[status];
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

export { Badge };
