import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export interface UploadStep {
  key: string;
  label: string;
  /** What this step is for, shown while it is the current one. */
  detail: string;
}

export const UPLOAD_STEPS: readonly UploadStep[] = [
  {
    key: "upload",
    label: "Upload",
    detail: "A CSV, TSV or Excel export with one row per order or transaction.",
  },
  {
    key: "preview",
    label: "Inspect",
    detail: "See what we read from the file — rows, columns, dates, and anything odd.",
  },
  {
    key: "review",
    label: "Confirm fields",
    detail: "Tell us what each column means. Every figure downstream depends on this.",
  },
  {
    key: "analysing",
    label: "Analyse",
    detail: "Metrics, trends, segments and anomalies, computed from your rows.",
  },
] as const;

/**
 * The guided flow, made visible.
 *
 * The previous stepper was four 24px numbered circles joined by 1px lines,
 * sitting 16px tall in a 900px container — the staging existed in the logic
 * and was invisible in the design.
 *
 * This states where you are, what that step is for, and how far there is to
 * go. On a phone it collapses to "Step 2 of 4" plus the current label, because
 * four steps side by side at 390px is four truncated words.
 */
export function UploadStepper({
  steps = UPLOAD_STEPS,
  activeIndex,
  className,
}: {
  steps?: readonly UploadStep[];
  activeIndex: number;
  className?: string;
}) {
  const current = steps[activeIndex];

  return (
    <div className={cn("space-y-3", className)}>
      {/* --------------------------------------------------------- Compact */}
      <div className="sm:hidden">
        <p className="eyebrow">
          Step {activeIndex + 1} of {steps.length}
        </p>
        <p className="mt-1 text-base font-semibold">{current?.label}</p>
        <div className="mt-2.5 flex gap-1" aria-hidden="true">
          {steps.map((step, index) => (
            <span
              key={step.key}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-base",
                index < activeIndex && "bg-success",
                index === activeIndex && "bg-primary",
                index > activeIndex && "bg-muted",
              )}
            />
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------ Full */}
      <ol className="hidden items-stretch gap-2 sm:flex" aria-label="Upload progress">
        {steps.map((step, index) => {
          const state =
            index < activeIndex ? "done" : index === activeIndex ? "current" : "todo";
          return (
            <li
              key={step.key}
              className={cn(
                "flex min-w-0 flex-1 items-start gap-2.5 rounded-xl border px-3 py-2.5",
                "transition-colors duration-base",
                state === "current" && "border-primary/30 bg-primary-subtle",
                state === "done" && "border-border bg-card",
                state === "todo" && "border-border/70 bg-transparent",
              )}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span
                className={cn(
                  "mt-px flex size-5 shrink-0 items-center justify-center rounded-full",
                  "text-[10px] font-semibold",
                  state === "done" && "bg-success text-success-foreground",
                  state === "current" && "bg-primary text-primary-foreground",
                  state === "todo" && "bg-muted text-subtle-foreground",
                )}
                aria-hidden="true"
              >
                {state === "done" ? <Check className="size-3" strokeWidth={3} /> : index + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate text-sm",
                    state === "current" ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                  <span className="sr-only">
                    {state === "done"
                      ? " — done"
                      : state === "current"
                        ? " — current step"
                        : " — not started"}
                  </span>
                </span>
                {state === "current" ? (
                  <span className="mt-0.5 block text-2xs leading-snug text-muted-foreground">
                    {step.detail}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
