import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading state.
 *
 * Mirrors the shape of the redesigned dashboard — greeting, four primary
 * KPIs, the secondary strip, the full-width trend band, then the findings —
 * so the page fills in rather than jumping when real content arrives. A
 * skeleton that does not match the layout it precedes is a spinner with extra
 * steps, and the layout it matched is no longer the layout we render.
 *
 * One `aria-busy` region rather than announcing each shimmering block.
 */
export default function Loading() {
  return (
    <div className="space-y-9" role="status" aria-busy="true" aria-label="Loading">
      {/* Headline */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-8 w-[22rem] max-w-full" />
          <Skeleton className="h-5 w-[26rem] max-w-full" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      </div>

      {/* Primary KPIs */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="space-y-2.5 rounded-xl border border-border bg-card p-4"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          ))}
        </div>
        <div className="h-[4.75rem] rounded-xl border border-border bg-card" />
      </div>

      {/* The main trend band */}
      <Skeleton className="h-[25rem] rounded-xl" />

      {/* What changed */}
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-36 rounded-xl" />
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
