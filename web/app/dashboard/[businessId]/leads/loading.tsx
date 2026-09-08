import { RowSkeleton, Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";

export default function LeadsLoading(): JSX.Element {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-3 h-7 w-64" />
      <Skeleton className="mt-2 h-4 w-40" />
      <SkeletonRegion label="Loading leads">
        <div className="mt-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      </SkeletonRegion>
    </div>
  );
}
