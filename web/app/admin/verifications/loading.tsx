import { RowSkeleton, Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";

export default function VerificationsLoading(): JSX.Element {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="mt-2 h-4 w-96" />
      <SkeletonRegion label="Loading the verification queue">
        <div className="mt-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      </SkeletonRegion>
    </div>
  );
}
