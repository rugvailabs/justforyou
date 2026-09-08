import { CardSkeleton, Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";

/** Mirrors the search page's two-column result grid so nothing shifts. */
export default function SearchLoading(): JSX.Element {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-6 h-10 w-full" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <SkeletonRegion label="Loading search results">
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </SkeletonRegion>
    </div>
  );
}
