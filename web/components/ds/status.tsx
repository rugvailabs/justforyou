/**
 * The two decisions that gate a listing, as badges.
 *
 * They are deliberately separate components rather than one merged "state",
 * because they are two independent decisions and an owner has to be able to
 * tell which one is holding their listing back. "Live" beside "Verification
 * pending" is the honest picture; a single combined badge would hide half of
 * it, and the half it hides is the half the owner can act on.
 *
 * Colour never carries the meaning on its own - the label is always present -
 * so both stay readable in monochrome and to a colour-blind reader. The hint
 * is the sentence that turns a status into something actionable, and is opt-in
 * because a list of ten listings does not want ten hints.
 */

import { Badge, type BadgeProps } from "@/components/ds/primitives";
import { cn } from "@/lib/cn";
import type { BusinessStatus, VerificationStatus } from "@/lib/types";

type Tone = NonNullable<BadgeProps["tone"]>;

const LISTING: Record<
  BusinessStatus,
  { label: string; tone: Tone; hint: string }
> = {
  pending: {
    label: "Pending review",
    tone: "warning",
    hint: "Not in search until approved",
  },
  approved: {
    label: "Live",
    tone: "success",
    hint: "Visible in public search",
  },
  rejected: {
    label: "Rejected",
    tone: "danger",
    hint: "Not visible in search",
  },
  suspended: {
    label: "Suspended",
    tone: "neutral",
    hint: "Removed from search by a moderator",
  },
};

/** `null` is "nothing submitted", which is not the same as pending. */
const KYC: Record<
  VerificationStatus | "none",
  { label: string; tone: Tone; hint: string }
> = {
  none: {
    label: "Not verified",
    tone: "neutral",
    hint: "Send your details to appear in search",
  },
  pending: {
    label: "Verification pending",
    tone: "warning",
    hint: "We are checking your documents",
  },
  verified: {
    label: "Verified",
    tone: "verified",
    hint: "Identity checked",
  },
  rejected: {
    label: "Verification rejected",
    tone: "danger",
    hint: "See the reason and resubmit",
  },
};

function StatusPair({
  label,
  tone,
  hint,
  showHint,
  className,
}: {
  label: string;
  tone: Tone;
  hint: string;
  showHint: boolean;
  className?: string;
}): JSX.Element {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <Badge tone={tone}>{label}</Badge>
      {showHint ? <span className="text-meta text-ink-subtle">{hint}</span> : null}
    </span>
  );
}

/** Moderation status: has a human approved the listing's content? */
export function ListingStatusBadge({
  status,
  showHint = false,
  className,
}: {
  status: BusinessStatus;
  showHint?: boolean;
  className?: string;
}): JSX.Element {
  const style = LISTING[status];
  return <StatusPair {...style} showHint={showHint} className={className} />;
}

/** KYC status: has the business behind the listing been proven real? */
export function KycBadge({
  status,
  showHint = false,
  className,
}: {
  status: VerificationStatus | null;
  showHint?: boolean;
  className?: string;
}): JSX.Element {
  const style = KYC[status ?? "none"];
  return <StatusPair {...style} showHint={showHint} className={className} />;
}

/**
 * Why a listing is not in public search, in one sentence, or null when it is.
 *
 * Both gates have to pass and the owner's question is always "which one is
 * stopping me" - so this reads the pair together rather than making the page
 * re-derive it. Returning null for the live case lets a caller render nothing
 * without repeating the condition.
 */
export function visibilityBlocker(
  status: BusinessStatus,
  kyc: VerificationStatus | null,
): string | null {
  if (status === "approved" && kyc === "verified") return null;

  if (status !== "approved") {
    return LISTING[status].hint;
  }
  // Approved but invisible is the confusing case the owner most often hits.
  if (kyc === "pending") {
    return "Approved, and waiting on business verification. It appears in search once that is done.";
  }
  if (kyc === "rejected") {
    return "Approved, but verification was rejected - so it is not in search yet.";
  }
  return "Approved, but not verified yet - so it is not in search yet.";
}
