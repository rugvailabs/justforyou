import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";

export default function ChatListLoading(): JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-6 h-7 w-36" />
      <SkeletonRegion label="Loading your conversations">
        <div className="mt-6 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex justify-between gap-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="mt-2 h-3 w-3/4" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
          ))}
        </div>
      </SkeletonRegion>
    </div>
  );
}
