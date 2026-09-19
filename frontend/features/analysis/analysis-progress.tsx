"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Check, Circle, Loader2 } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { api, queryKeys } from "@/lib/api-client";
import { cn, formatDuration } from "@/lib/utils";
import type { Analysis } from "@/types/api";

/**
 * Live analysis progress.
 *
 * The stages shown are the stages the backend actually runs, and each one is
 * marked done only once the server has committed that it finished. There is no
 * simulated progress bar: a fake percentage that races ahead of the work is the
 * fastest way to make a product feel untrustworthy the first time it stalls.
 */
export function AnalysisProgress({
  workspaceId,
  analysisId,
  onComplete,
  initialData,
}: {
  workspaceId: string;
  analysisId: string;
  onComplete?: (analysis: Analysis) => void;
  initialData?: Analysis;
}) {
  const { data: analysis, error } = useQuery({
    queryKey: queryKeys.analysis(workspaceId, analysisId),
    queryFn: () => api.analysis(workspaceId, analysisId),
    initialData,
    // Poll while running; stop the moment it settles.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 1500 : false;
    },
  });

  const completedRef = React.useRef(false);
  React.useEffect(() => {
    if (analysis?.status === "completed" && !completedRef.current) {
      completedRef.current = true;
      onComplete?.(analysis);
    }
  }, [analysis, onComplete]);

  if (error) {
    return (
      <div
        role="alert"
        className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3"
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
        <p className="text-sm">We lost track of this analysis. Refresh the page to check on it.</p>
      </div>
    );
  }

  if (!analysis) {
    return <ProgressSkeleton />;
  }

  if (analysis.status === "failed") {
    return (
      <div
        role="alert"
        className="space-y-3 rounded-lg border border-danger/30 bg-danger-subtle px-5 py-4"
      >
        <div className="flex items-start gap-2.5">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {analysis.error_message ?? "The analysis could not be completed."}
            </p>
            {analysis.error_hint ? (
              <p className="text-xs text-muted-foreground">{analysis.error_hint}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const running = analysis.status === "queued" || analysis.status === "running";

  return (
    <div
      className="space-y-4 rounded-lg border border-border bg-card p-5"
      aria-busy={running}
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {running ? "Analysing your dataset" : "Analysis complete"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {analysis.status === "completed"
              ? `Finished in ${formatDuration(analysis.duration_ms)}`
              : "This usually takes a few seconds."}
          </p>
        </div>
        <span className="tabular text-sm font-medium">{analysis.progress}%</span>
      </div>

      <Progress
        value={analysis.progress}
        aria-label="Analysis progress"
        indicatorClassName={analysis.status === "completed" ? "bg-success" : undefined}
      />

      <ol className="space-y-2">
        {analysis.stages.map((stage) => {
          const Icon =
            stage.status === "done" ? Check : stage.status === "running" ? Loader2 : Circle;

          return (
            <li key={stage.key} className="flex items-center gap-2.5 text-sm">
              <Icon
                className={cn(
                  "size-3.5 shrink-0",
                  stage.status === "done" && "text-success",
                  stage.status === "running" && "animate-spin text-primary",
                  stage.status === "pending" && "text-muted-foreground/40",
                )}
                aria-hidden="true"
              />
              <span
                className={cn(
                  stage.status === "pending" ? "text-muted-foreground" : "text-foreground",
                  stage.status === "running" && "font-medium",
                )}
              >
                {stage.label}
              </span>
              <span className="sr-only">
                {stage.status === "done"
                  ? "completed"
                  : stage.status === "running"
                    ? "in progress"
                    : "not started"}
              </span>
            </li>
          );
        })}
      </ol>

      {analysis.status === "completed" && analysis.summary.headline ? (
        <p className="border-t border-border pt-3 text-sm text-muted-foreground">
          {analysis.summary.headline}
        </p>
      ) : null}
    </div>
  );
}

function ProgressSkeleton() {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-5" aria-busy="true">
      <div className="shimmer h-4 w-44 rounded" />
      <div className="shimmer h-1.5 w-full rounded-full" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="shimmer h-3.5 w-40 rounded" />
        ))}
      </div>
    </div>
  );
}
