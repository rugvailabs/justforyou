import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";

export default function ReviewsLoading(): JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-3 h-7 w-72" />
      <Skeleton className="mt-2 h-4 w-48" />
      <SkeletonRegion label="Loading reviews">
        <div className="mt-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-2 h-4 w-1/2" />
              <Skeleton className="mt-2 h-3 w-full" />
              <Skeleton className="mt-1.5 h-3 w-3/4" />
            </div>
          ))}
        </div>
      </SkeletonRegion>
    </div>
  );
}
