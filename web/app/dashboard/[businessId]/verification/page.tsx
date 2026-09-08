/**
 * Verification (KYC) for one listing.
 *
 * The panel above the form is the point of this page as much as the form is:
 * an owner whose listing is approved but invisible needs to see *which* of the
 * two gates is holding it, and a rejected owner needs the reviewer's words.
 *
 * Server Component - it reads the listing and its verification with the
 * owner's cookie, and the form below is the only client part.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";
import VerificationBadge from "@/components/VerificationBadge";
import VerificationForm from "@/components/VerificationForm";
import Alert from "@/components/ui/Alert";
import Card from "@/components/ui/Card";
import { ApiError, getMyBusiness, getVerification } from "@/lib/api";
import { requireBusinessOwner } from "@/lib/auth";
import type { BusinessDetail, BusinessVerification } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

export default async function VerificationPage({
  params,
}: {
  params: { businessId: string };
}): Promise<JSX.Element> {
  await requireBusinessOwner(`/dashboard/${params.businessId}/verification`);

  const businessId = Number(params.businessId);
  if (!Number.isInteger(businessId) || businessId < 1) notFound();

  let listing: BusinessDetail;
  try {
    listing = await getMyBusiness(businessId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    // 403 means somebody else's listing. Back to the dashboard, which explains
    // it - rather than a bare error page.
    if (error instanceof ApiError && error.isForbidden) {
      redirect("/dashboard?error=forbidden");
    }
    throw error;
  }

  let verification: BusinessVerification | null = null;
  let loadError: string | null = null;
  try {
    verification = await getVerification(businessId);
  } catch (cause) {
    loadError =
      cause instanceof ApiError
        ? cause.isNetworkError
          ? "The API is not reachable. Is the backend running on port 8000?"
          : cause.message
        : "Could not load the verification status.";
  }

  const moderationDone = listing.status === "approved";
  const kycDone = verification?.status === "verified";
  const live = moderationDone && kycDone;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Header />

      <Link href="/dashboard" className="text-sm underline">
        &larr; Your listings
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
        Verify {listing.name}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        We check that the business behind a listing is real before it appears in
        search. This is separate from the review of the listing&apos;s content.
      </p>

      {loadError !== null ? (
        <div className="mt-5">
          <Alert tone="error" title="Could not load the verification status">
            {loadError}
          </Alert>
        </div>
      ) : null}

      {/* Both gates, side by side, because "why is my listing not showing up"
          has two possible answers and the owner cannot act on the wrong one. */}
      <Card className="mt-5">
        <h2 className="font-semibold text-slate-900">
          {live
            ? "This listing is live"
            : "What this listing still needs"}
        </h2>

        <dl className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-sm text-slate-700">Listing review</dt>
            <dd>
              <StatusBadge status={listing.status} showHint />
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-sm text-slate-700">Business verification</dt>
            <dd>
              <VerificationBadge
                status={verification?.status ?? null}
                showHint
              />
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-sm text-slate-600">
          {live ? (
            <>
              Both checks have passed, so {listing.name} appears in public
              search.
            </>
          ) : (
            <>
              A listing appears in search only once both are done. Right now it
              is {moderationDone ? "approved" : "waiting on a moderator"} and{" "}
              {kycDone
                ? "verified"
                : verification === null
                  ? "not verified yet"
                  : verification.status === "pending"
                    ? "waiting on verification"
                    : "rejected on verification"}
              .
            </>
          )}
        </p>
      </Card>

      {verification?.status === "rejected" &&
      verification.rejection_reason !== null ? (
        <div className="mt-4">
          <Alert tone="error" title="A reviewer could not verify this">
            <p>{verification.rejection_reason}</p>
            <p className="mt-1 text-xs">
              Reviewed {verification.reviewed_at !== null
                ? `on ${formatWhen(verification.reviewed_at)}`
                : "recently"}
              . Fix what is described above and send it again.
            </p>
          </Alert>
        </div>
      ) : null}

      {verification?.status === "pending" ? (
        <div className="mt-4">
          <Alert tone="info" title="With a reviewer">
            Submitted {formatWhen(verification.submitted_at)}. You can send
            corrected details below at any time; the latest submission is the
            one that gets reviewed.
          </Alert>
        </div>
      ) : null}

      <Card className="mt-4">
        <h2 className="mb-4 font-semibold text-slate-900">
          {verification === null ? "Your details" : "Update your details"}
        </h2>
        <VerificationForm
          businessId={businessId}
          businessName={listing.name}
          existing={verification}
        />
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        Documents are stored separately from your public listing and are only
        read by a reviewer. Your licence and GST numbers never appear on your
        public page.
      </p>
    </div>
  );
}
