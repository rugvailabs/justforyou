import Link from "next/link";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import RatingStars from "@/components/ui/RatingStars";
import type { BusinessListItem } from "@/lib/types";

/** One search result. */
export default function BusinessCard({
  business,
}: {
  business: BusinessListItem;
}): JSX.Element {
  const location = [business.address, business.city, business.province]
    .filter(Boolean)
    .join(", ");

  return (
    <Card interactive className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-900">
            <Link href={`/business/${business.slug}`} className="hover:underline">
              {business.name}
            </Link>
          </h3>
          <p className="text-sm text-slate-500">{business.category_name}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {business.verified ? <Badge tone="success">✓ Verified</Badge> : null}
          {/* distance_km is only populated when the search supplied a point. */}
          {business.distance_km !== null ? (
            <Badge tone="info">{business.distance_km.toFixed(1)} km</Badge>
          ) : null}
        </div>
      </div>

      <RatingStars rating={business.rating} reviewCount={business.review_count} />

      {business.description !== null ? (
        <p className="line-clamp-2 text-sm text-slate-600">{business.description}</p>
      ) : null}

      {location ? <p className="text-sm text-slate-500">{location}</p> : null}

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {business.phone !== null ? (
          <a href={`tel:${business.phone}`} className="text-slate-900 underline">
            {business.phone}
          </a>
        ) : null}
        {business.website !== null ? (
          <a
            href={business.website}
            target="_blank"
            // noreferrer alongside noopener: this is an outbound link to a
            // listing we do not control.
            rel="noopener noreferrer"
            className="text-slate-900 underline"
          >
            Website
          </a>
        ) : null}
      </div>
    </Card>
  );
}
