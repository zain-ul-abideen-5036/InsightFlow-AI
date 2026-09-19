import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading state.
 *
 * Mirrors the shape of the dashboard so the page does not jump when real
 * content arrives. One `aria-busy` region, rather than announcing each block.
 */
export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="space-y-2.5 rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Skeleton className="h-80 rounded-lg xl:col-span-3" />
        <div className="space-y-2.5 xl:col-span-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
