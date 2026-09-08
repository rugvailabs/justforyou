import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";

export default function BusinessLoading(): JSX.Element {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <SkeletonRegion label="Loading this listing">
        <Skeleton className="h-8 w-2/3 max-w-sm" />
        <Skeleton className="mt-2 h-4 w-1/2 max-w-xs" />
        <Skeleton className="mt-3 h-4 w-40" />
        <div className="mt-6 flex flex-wrap gap-2">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="mt-2 h-4 w-full" />
            <Skeleton className="mt-1.5 h-4 w-4/5" />
            {/* The map is a fixed 16rem block; reserve it so the page does
                not lurch when Leaflet mounts. */}
            <Skeleton className="mt-6 h-64 w-full rounded-lg" />
          </div>
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </SkeletonRegion>
    </div>
  );
}
