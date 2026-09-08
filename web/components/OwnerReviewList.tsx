"use client";

/**
 * The owner's view of their reviews, with an inline reply box under each one
 * that has no reply yet.
 *
 * A Client Component only because of the optimistic update: the reply has to
 * appear the moment it is posted, before router.refresh() re-runs the page.
 * The list is seeded from the server render, so there is no client fetch on
 * first paint.
 */

import { useState } from "react";

import OwnerReplyForm from "@/components/OwnerReplyForm";
import Card from "@/components/ui/Card";
import RatingStars from "@/components/ui/RatingStars";
import type { BusinessReview } from "@/lib/types";

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

export default function OwnerReviewList({
  businessId,
  reviews: initialReviews,
}: {
  businessId: number;
  reviews: BusinessReview[];
}): JSX.Element {
  const [reviews, setReviews] = useState(initialReviews);

  /** Patch one review in place so its reply shows without a round trip. */
  function applyReply(reviewId: number, reply: string): void {
    setReviews((current) =>
      current.map((review) =>
        review.id === reviewId
          ? {
              ...review,
              owner_reply: reply,
              owner_replied_at: new Date().toISOString(),
            }
          : review,
      ),
    );
  }

  return (
    <ul className="space-y-4">
      {reviews.map((review) => (
        <li key={review.id}>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <RatingStars rating={review.rating} showCount={false} />
                {review.title !== null ? (
                  <h2 className="mt-1 font-semibold text-slate-900">
                    {review.title}
                  </h2>
                ) : null}
              </div>
              <div className="text-right text-sm text-slate-500">
                <div>{review.author_name}</div>
                <div>{formatWhen(review.created_at)}</div>
              </div>
            </div>

            {review.body !== null ? (
              <p className="mt-2 text-sm text-slate-700">{review.body}</p>
            ) : null}

            {review.owner_reply !== null ? (
              <div className="mt-3 rounded-md border-l-2 border-slate-300 bg-slate-50 px-3 py-2">
                <p className="text-xs font-medium text-slate-500">
                  Your reply
                  {review.owner_replied_at !== null
                    ? ` · ${formatWhen(review.owner_replied_at)}`
                    : ""}
                </p>
                <p className="mt-1 text-sm text-slate-700">{review.owner_reply}</p>
              </div>
            ) : (
              <OwnerReplyForm
                businessId={businessId}
                reviewId={review.id}
                onReplied={(reply) => applyReply(review.id, reply)}
              />
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
