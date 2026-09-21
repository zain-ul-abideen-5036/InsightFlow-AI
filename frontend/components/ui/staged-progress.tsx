"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export interface Stage {
  /** Present tense, describing work: "Calculating metrics". */
  label: string;
  /** One line on what this step actually does, shown while it is active. */
  detail?: string;
}

/**
 * Staged progress for work that takes real time.
 *
 * Answering a question is a planning call, a deterministic analysis, and a
 * writing call. Against a local model on a CPU that is minutes. The previous
 * treatment — one spinner and the line "Analysing your data" — gave a user
 * nothing to hold on to for three hundred seconds, which is the point at which
 * people conclude a product is broken and reload.
 *
 * ---
 *
 * **What this does and does not claim.**
 *
 * Stages advance on a timer, because the server does not stream its progress.
 * That makes the *timing* an estimate, and the component is built so the
 * estimate can never become a lie:
 *
 * - It never reaches the final stage on its own. The last step stays pending
 *   until the caller passes `complete`, because only the caller knows the work
 *   finished.
 * - It shows no percentage. A percentage implies measurement, and nothing here
 *   is measured.
 * - The stage names are the real steps, in the real order the server performs
 *   them. A user who reads them learns something true about the product.
 *
 * `elapsedFrom` surfaces a running clock after the first few seconds, which is
 * the honest answer to "is this stuck?" — the user can see that it is not.
 */
export function StagedProgress({
  stages,
  complete = false,
  /** Milliseconds each stage is shown before advancing. */
  interval = 2600,
  elapsedFrom,
  className,
  label = "Working",
}: {
  stages: readonly Stage[];
  complete?: boolean;
  interval?: number;
  /** `Date.now()` at the moment the request went out. */
  elapsedFrom?: number;
  className?: string;
  /** The accessible name for the whole region. */
  label?: string;
}) {
  const [active, setActive] = React.useState(0);
  const [elapsed, setElapsed] = React.useState(0);

  const lastIndex = stages.length - 1;

  React.useEffect(() => {
    if (complete) return;
    const timer = window.setInterval(() => {
      // Stop one short of the end. The final stage belongs to the caller.
      setActive((current) => Math.min(current + 1, lastIndex));
    }, interval);
    return () => window.clearInterval(timer);
  }, [complete, interval, lastIndex]);

  React.useEffect(() => {
    if (!elapsedFrom || complete) return;
    const tick = () => setElapsed(Math.floor((Date.now() - elapsedFrom) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [elapsedFrom, complete]);

  const current = complete ? stages.length : active;

  return (
    <div
      className={cn("panel overflow-hidden", className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {/* An indeterminate track: movement without a claimed proportion. */}
      <div className="h-0.5 w-full overflow-hidden bg-muted" aria-hidden="true">
        {complete ? (
          <div className="h-full w-full bg-success" />
        ) : (
          <div className="h-full w-1/4 animate-progress-indeterminate bg-primary" />
        )}
      </div>

      <ol className="space-y-0.5 p-4">
        {stages.map((stage, index) => {
          const done = index < current;
          const isActive = index === current && !complete;

          return (
            <li
              key={stage.label}
              className={cn(
                "flex items-start gap-3 rounded-lg px-2 py-1.5 transition-colors duration-base",
                isActive && "bg-primary-subtle/60",
              )}
            >
              <span
                className={cn(
                  "mt-px flex size-5 shrink-0 items-center justify-center rounded-full",
                  "border transition-colors duration-base",
                  done && "border-success/30 bg-success/12 text-success",
                  isActive && "border-primary/35 bg-card text-primary",
                  !done && !isActive && "border-border bg-muted/60 text-subtle-foreground",
                )}
                aria-hidden="true"
              >
                {done ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : isActive ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <span className="size-1.5 rounded-full bg-current opacity-45" />
                )}
              </span>

              <span className="min-w-0 flex-1 pb-0.5">
                <span
                  className={cn(
                    "block text-sm transition-colors duration-base",
                    isActive && "font-medium text-foreground",
                    done && "text-muted-foreground",
                    !done && !isActive && "text-subtle-foreground",
                  )}
                >
                  {stage.label}
                  <span className="sr-only">
                    {done ? " — done" : isActive ? " — in progress" : " — waiting"}
                  </span>
                </span>
                {isActive && stage.detail ? (
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {stage.detail}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      {elapsedFrom && !complete && elapsed >= 4 ? (
        <p className="border-t border-border px-6 py-2 text-2xs text-subtle-foreground">
          <span className="tabular">{formatElapsed(elapsed)}</span> elapsed. A model running
          locally on a CPU takes longer than a hosted one — the figures are identical either
          way.
        </p>
      ) : null}
    </div>
  );
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/**
 * The stages of answering a question.
 *
 * These are the real steps in `backend/app/analytics/planner.py` and
 * `executor.py`, in the order they run.
 */
export const ASK_STAGES: readonly Stage[] = [
  {
    label: "Understanding your question",
    detail: "Turning it into a typed analysis plan — a metric, a dimension, a period.",
  },
  {
    label: "Finding the relevant data",
    detail: "Selecting the columns and rows the plan needs from your dataset.",
  },
  {
    label: "Calculating the metrics",
    detail: "Computed in the analytics engine, not by the model.",
  },
  {
    label: "Writing the explanation",
    detail: "The model receives the computed findings and phrases them.",
  },
  {
    label: "Checking every figure against the evidence",
    detail: "Anything not supported by the analysis is discarded rather than shown.",
  },
] as const;

/** The stages of generating a performance report. */
export const REPORT_STAGES: readonly Stage[] = [
  { label: "Collecting the period's figures", detail: "Metrics, trends, segments, anomalies." },
  { label: "Ranking what mattered", detail: "By how much of the change each finding accounts for." },
  { label: "Writing the executive summary", detail: "From the computed findings only." },
  { label: "Fixing the figures to this report", detail: "So they never move under you later." },
] as const;
