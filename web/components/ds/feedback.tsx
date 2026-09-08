/**
 * Breadcrumbs, empty states, and the listing skeleton.
 *
 * The skeleton matches ListingCard's real geometry - same monogram square,
 * same three text rows, same button strip. A skeleton that does not match what
 * replaces it produces a visible jump on load, which is worse than no skeleton
 * at all.
 */

import Link from "next/link";
import { ChevronRight, SearchX } from "lucide-react";

import { Button, Card } from "@/components/ds/primitives";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------ Breadcrumbs */

export interface Crumb {
  label: string;
  /** Omit on the last crumb: the page you are on is not a link to itself. */
  href?: string;
}

export function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}): JSX.Element {
  return (
    <nav aria-label="Breadcrumb" className={cn("text-meta", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-ink-subtle">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {item.href !== undefined && !last ? (
                <Link
                  href={item.href}
                  className="rounded-sm hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="text-ink-muted">
                  {item.label}
                </span>
              )}
              {!last ? (
                <ChevronRight className="size-3.5 text-ink-faint" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ------------------------------------------------------------- EmptyState */

export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: string;
  body?: string;
  action?: { label: string; href: string };
  icon?: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <Card className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <span className="flex size-10 items-center justify-center rounded-pill bg-surface-muted text-ink-faint">
        {icon ?? <SearchX className="size-5" aria-hidden="true" />}
      </span>
      <h2 className="text-section-heading text-ink">{title}</h2>
      {body !== undefined ? (
        <p className="max-w-prose text-body text-ink-muted">{body}</p>
      ) : null}
      {action !== undefined ? (
        <Button asChild variant="secondary" size="sm" className="mt-1">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------- ListingCardSkeleton */

function Bar({ className }: { className?: string }): JSX.Element {
  return (
    <span
      className={cn(
        "relative block overflow-hidden rounded-sm bg-surface-muted",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer",
        "after:bg-gradient-to-r after:from-transparent after:via-line/60 after:to-transparent",
        "motion-reduce:after:hidden",
        className,
      )}
    />
  );
}

export function ListingCardSkeleton(): JSX.Element {
  return (
    <Card className="flex gap-4 p-4" aria-hidden="true">
      <Bar className="hidden size-16 shrink-0 rounded-card sm:block" />
      <div className="flex-1 space-y-2">
        <Bar className="h-4 w-2/5" />
        <Bar className="h-3 w-1/3" />
        <Bar className="h-3 w-24" />
        <Bar className="h-3 w-full" />
        <div className="flex gap-2 pt-2">
          <Bar className="h-9 w-32 rounded-input" />
          <Bar className="h-9 w-24 rounded-input" />
        </div>
      </div>
    </Card>
  );
}

/** A list of skeletons, announced once rather than per row. */
export function ListingListSkeleton({
  count = 4,
  label = "Loading listings",
}: {
  count?: number;
  label?: string;
}): JSX.Element {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }).map((_, index) => (
        <ListingCardSkeleton key={index} />
      ))}
    </div>
  );
}
