import { CardSkeleton, Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";

export default function DashboardLoading(): JSX.Element {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-6 h-7 w-48" />
      <SkeletonRegion label="Loading your listings">
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </SkeletonRegion>
    </div>
  );
}
