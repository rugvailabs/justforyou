/**
 * Reviews management for one listing.
 *
 * Server Component. Ownership follows the same pattern as the edit and leads
 * pages: the backend 403s a listing owned by someone else, and that becomes a
 * redirect to /dashboard rather than a crash.
 *
 * Owners can reply but not delete - removing a review is an admin action in
 * the backend, and a business deleting its own bad reviews would make the
 * whole rating meaningless.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import OwnerReviewList from "@/components/OwnerReviewList";
import Card from "@/components/ui/Card";
import RatingStars from "@/components/ui/RatingStars";
import { ButtonLink } from "@/components/ui/Button";
import { ApiError, getMyBusiness, getReviewSummary, getReviews } from "@/lib/api";
import { requireBusinessOwner } from "@/lib/auth";
import type {
  BusinessDetail,
  BusinessReview,
  BusinessReviewSummary,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardReviewsPage({
  params,
}: {
  params: { businessId: string };
}): Promise<JSX.Element> {
  await requireBusinessOwner(`/dashboard/${params.businessId}/reviews`);

  const businessId = Number(params.businessId);
  if (!Number.isInteger(businessId) || businessId < 1) notFound();

  let listing: BusinessDetail;
  let reviews: BusinessReview[] = [];
  let summary: BusinessReviewSummary | null = null;

  try {
    // Ownership first: no point fetching reviews for a listing the caller
    // cannot see.
    listing = await getMyBusiness(businessId);
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      redirect("/dashboard?error=forbidden");
    }
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // A listing awaiting approval is not publicly readable, so the public
  // review endpoints 404 for it. That is not an error worth showing - it just
  // means there is nothing to manage yet.
  try {
    [reviews, summary] = await Promise.all([
      getReviews(businessId, { limit: 100 }),
      getReviewSummary(businessId),
    ]);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }

  const unanswered = reviews.filter((r) => r.owner_reply === null).length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <Link href="/dashboard" className="text-sm underline">
          ← Back to your listings
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          Reviews for {listing.name}
        </h1>
        {summary !== null && summary.review_count > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <RatingStars
              rating={summary.average_rating}
              reviewCount={summary.review_count}
            />
            {unanswered > 0 ? (
              <span className="text-sm text-amber-700">
                {unanswered} awaiting a reply
              </span>
            ) : (
              <span className="text-sm text-emerald-700">All replied to</span>
            )}
          </div>
        ) : null}
      </header>

      {reviews.length === 0 ? (
        <Card>
          <h2 className="font-semibold text-slate-900">No reviews yet</h2>
          <p className="mt-1 text-sm text-slate-600">
            {listing.status === "approved"
              ? "When customers review this listing, they will appear here and you can reply to each one."
              : "This listing is not publicly visible yet, so customers cannot review it."}
          </p>
          <div className="mt-4">
            <ButtonLink href="/dashboard" variant="secondary" size="sm">
              Back to listings
            </ButtonLink>
          </div>
        </Card>
      ) : (
        <OwnerReviewList businessId={businessId} reviews={reviews} />
      )}
    </div>
  );
}
