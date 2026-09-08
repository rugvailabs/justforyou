/**
 * Owner dashboard: the listings this account owns.
 *
 * Server Component. Middleware gates /dashboard on the cached role cookie,
 * but requireBusinessOwner() re-checks against /me, which is the check that
 * actually holds - the cookie is only a hint to avoid a round trip.
 */

import Link from "next/link";

import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";
import VerificationBadge from "@/components/VerificationBadge";
import Card from "@/components/ui/Card";
import RatingStars from "@/components/ui/RatingStars";
import { ButtonLink } from "@/components/ui/Button";
import { ApiError, getMyBusinesses, getVerification } from "@/lib/api";
import { requireBusinessOwner } from "@/lib/auth";
import type { BusinessOwnerItem, VerificationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { error?: string };
}): Promise<JSX.Element> {
  const user = await requireBusinessOwner("/dashboard");
  // Set when an ownership check bounced the owner off another listing.
  const forbidden = searchParams.error === "forbidden";

  let listings: BusinessOwnerItem[] = [];
  let error: string | null = null;
  try {
    listings = await getMyBusinesses();
  } catch (cause) {
    error =
      cause instanceof ApiError
        ? cause.isNetworkError
          ? "The API is not reachable. Is the backend running on port 8000?"
          : cause.message
        : "Could not load your listings.";
  }

  // One request per listing. There is no bulk endpoint, and an owner has a
  // handful of listings rather than hundreds - but they go out together, and a
  // failure leaves that one badge unknown rather than taking down the page.
  const verifications = new Map<number, VerificationStatus | null>();
  const results = await Promise.allSettled(
    listings.map(async (listing) => ({
      id: listing.id,
      status: (await getVerification(listing.id))?.status ?? null,
    })),
  );
  for (const result of results) {
    if (result.status === "fulfilled") {
      verifications.set(result.value.id, result.value.status);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Header />

      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Your listings
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage the businesses you have listed.
          </p>
        </div>
        {listings.length > 0 ? (
          <ButtonLink href="/dashboard/new-listing">Add a listing</ButtonLink>
        ) : null}
      </div>

      {forbidden ? (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            That listing belongs to another account, so it cannot be opened
            here.
          </p>
        </Card>
      ) : null}

      {error !== null ? (
        <Card className="border-red-200 bg-red-50">
          <h2 className="font-semibold text-red-800">Could not load listings</h2>
          <p className="mt-1 text-sm text-red-700">{error}</p>
        </Card>
      ) : listings.length === 0 ? (
        <Card>
          <h2 className="font-semibold text-slate-900">
            You haven&apos;t listed a business yet
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Add your business so customers searching the directory can find it.
            A new listing is reviewed, and the business behind it verified,
            before it appears publicly.
          </p>
          <div className="mt-4">
            <ButtonLink href="/dashboard/new-listing">
              List your business
            </ButtonLink>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {listings.map((listing) => (
            <li key={listing.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-slate-900">
                      {listing.name}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {[listing.address, listing.city, listing.province]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    <div className="mt-1">
                      <RatingStars
                        rating={listing.rating}
                        reviewCount={listing.review_count}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={listing.status} showHint />
                    <VerificationBadge
                      status={verifications.get(listing.id) ?? null}
                    />
                  </div>
                </div>

                {/* Approved but unverified is the confusing case: the badge
                    says Live and the listing is not in search. Name the
                    missing step and link straight to it. */}
                {listing.status === "approved" &&
                verifications.get(listing.id) !== "verified" ? (
                  <div className="rounded-md border-l-2 border-amber-400 bg-amber-50 px-3 py-2">
                    <p className="text-sm text-amber-900">
                      {verifications.get(listing.id) === "pending"
                        ? "Approved, and waiting on business verification. It appears in search once that is done."
                        : verifications.get(listing.id) === "rejected"
                          ? "Approved, but verification was rejected - so it is not in search yet."
                          : "Approved, but not verified yet - so it is not in search yet."}{" "}
                      <Link
                        href={`/dashboard/${listing.id}/verification`}
                        className="font-medium underline"
                      >
                        {verifications.get(listing.id) === null
                          ? "Verify this business"
                          : "Open verification"}
                      </Link>
                    </p>
                  </div>
                ) : null}

                {/* A rejection or suspension the owner cannot read is a dead
                    end, so the moderator's reason is surfaced here. */}
                {listing.moderation_note !== null &&
                (listing.status === "rejected" || listing.status === "suspended") ? (
                  <div className="rounded-md border-l-2 border-amber-400 bg-amber-50 px-3 py-2">
                    <p className="text-xs font-medium text-amber-800">
                      Moderator note
                    </p>
                    <p className="mt-1 text-sm text-amber-900">
                      {listing.moderation_note}
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <ButtonLink
                    href={`/dashboard/${listing.id}/edit`}
                    variant="secondary"
                    size="sm"
                  >
                    Edit
                  </ButtonLink>
                  <ButtonLink
                    href={`/dashboard/${listing.id}/leads`}
                    variant="secondary"
                    size="sm"
                  >
                    Leads
                  </ButtonLink>
                  <ButtonLink
                    href={`/dashboard/${listing.id}/reviews`}
                    variant="secondary"
                    size="sm"
                  >
                    Reviews
                  </ButtonLink>
                  <ButtonLink
                    href={`/dashboard/${listing.id}/verification`}
                    variant="secondary"
                    size="sm"
                  >
                    Verification
                  </ButtonLink>
                  {listing.status === "approved" &&
                  verifications.get(listing.id) === "verified" ? (
                    <ButtonLink
                      href={`/business/${listing.slug}`}
                      variant="ghost"
                      size="sm"
                    >
                      View public page
                    </ButtonLink>
                  ) : (
                    <span className="self-center text-xs text-slate-500">
                      No public page until approved and verified
                    </span>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
