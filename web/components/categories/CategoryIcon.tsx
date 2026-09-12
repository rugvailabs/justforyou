/**
 * One stroke glyph per category.
 *
 * Server component - it has no state and no handlers, so there is no reason to
 * ship it to the browser.
 */

import { CATEGORY_ICONS, ICON_FOR_SLUG, type IconKey } from "@/components/categories/category-icons";
import { cn } from "@/lib/cn";

/** A category with no mapped glyph gets the generic one rather than a blank. */
const FALLBACK: IconKey = "shield";

export default function CategoryIcon({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}): JSX.Element {
  const key = ICON_FOR_SLUG[slug] ?? FALLBACK;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-8", className)}
      aria-hidden="true"
    >
      <path d={CATEGORY_ICONS[key]} />
    </svg>
  );
}
