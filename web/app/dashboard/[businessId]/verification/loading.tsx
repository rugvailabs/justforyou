import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";

export default function VerificationLoading(): JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 h-7 w-72" />
      <Skeleton className="mt-2 h-4 w-96" />
      <SkeletonRegion label="Loading verification status">
        <div className="mt-6 space-y-3 rounded-md border border-slate-200 bg-white p-4">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="mt-4 space-y-4 rounded-md border border-slate-200 bg-white p-4">
          <Skeleton className="h-5 w-40" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </SkeletonRegion>
    </div>
  );
}
