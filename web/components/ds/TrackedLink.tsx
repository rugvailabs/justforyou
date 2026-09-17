"use client";

/**
 * A Next.js Link that reports the click to search analytics first.
 *
 * Only reports when it sits in a list of search results (a searchId is
 * present); anywhere else it is just a link.
 */

import Link from "next/link";
import type { ComponentProps } from "react";

import { trackSearchClick } from "@/lib/track-search-click";
import type { ClickAction } from "@/lib/types";

export default function TrackedLink({
  searchId,
  businessId,
  action,
  onClick,
  ...props
}: ComponentProps<typeof Link> & {
  searchId?: string | null;
  businessId: number;
  action: ClickAction;
}): JSX.Element {
  return (
    <Link
      {...props}
      onClick={(event) => {
        trackSearchClick(searchId, businessId, action);
        onClick?.(event);
      }}
    />
  );
}
