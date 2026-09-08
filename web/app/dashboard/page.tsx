/**
 * Owner dashboard: the listings this account owns.
 *
 * Server Component. Middleware gates /dashboard on the cached role cookie,
 * but requireBusinessOwner() re-checks against /me, which is the check that
 * actually holds - the cookie is only a hint to avoid a round trip.
 */

import Link from "next/link";

import LogoutButton from "@/components/LogoutButton";
import StatusBadge from "@/components/StatusBadge";
import Card from "@/components/ui/Card";
import RatingStars from "@/components/ui/RatingStars";
import { ButtonLink } from "@/components/ui/Button";
import { ApiError, getMyBusinesses } from "@/lib/api";
import { requireBusinessOwner } from "@/lib/auth";
import type { BusinessOwnerItem } from "@/lib/types";

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

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold">
          JustDial CA
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">{user.name}</span>
          <ButtonLink href="/chat" variant="secondary" size="sm">
            Messages
          </ButtonLink>
          <LogoutButton />
        </nav>
      </header>

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
            New listings are reviewed before they appear publicly.
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
                  <StatusBadge status={listing.status} showHint />
                </div>

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
                  {listing.status === "approved" ? (
                    <ButtonLink
                      href={`/business/${listing.slug}`}
                      variant="ghost"
                      size="sm"
                    >
                      View public page
                    </ButtonLink>
                  ) : (
                    <span className="self-center text-xs text-slate-500">
                      No public page until approved
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
