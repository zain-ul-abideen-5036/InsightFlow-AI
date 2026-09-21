"use client";

import * as React from "react";
import { Info } from "lucide-react";

import { Delta } from "@/components/ui/delta";
import { Sparkline } from "@/components/ui/sparkline";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, formatValue, isFavourable } from "@/lib/utils";
import type { Metric } from "@/types/api";

/**
 * A headline KPI.
 *
 * Four things are deliberate.
 *
 * 1. **The figure is the largest thing on the card by a wide margin.** It was
 *    previously 24px with an 11px label above it and 12px change below — three
 *    sizes close enough that the card read as a paragraph rather than as a
 *    number.
 * 2. **A sparkline gives the number a shape.** A value and a percentage say
 *    how far something moved; they do not say whether it was a step, a drift
 *    or a spike, and those call for different reactions.
 * 3. **Colour follows good news, not direction.** Falling cost is green.
 *    `Delta` owns that rule so every change in the product obeys it.
 * 4. **Every card exposes how the figure was calculated.** A number a business
 *    owner cannot interrogate is a number they cannot act on.
 */
export function KpiCard({
  metric,
  currency = "USD",
  comparisonLabel,
  history,
  onClick,
  emphasis = "default",
}: {
  metric: Metric;
  currency?: string;
  comparisonLabel?: string;
  /** Recent values for this metric, oldest first. Drives the sparkline. */
  history?: readonly number[];
  onClick?: () => void;
  /** `quiet` is for the secondary strip below the four primary metrics. */
  emphasis?: "default" | "quiet";
}) {
  const favourable = isFavourable(metric.key, metric.change_pct);
  const quiet = emphasis === "quiet";

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-xl border border-border",
        "bg-card text-left shadow-e1",
        quiet ? "gap-1 p-3.5" : "gap-2 p-4",
        onClick &&
          "cursor-pointer transition-[box-shadow,border-color,transform] duration-base ease-out " +
            "hover:-translate-y-px hover:border-border-strong hover:shadow-e2 " +
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="eyebrow truncate">{metric.label}</span>
        {metric.provenance?.calculation ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                {/*
                  A real <button>. This was a <span role="button" tabIndex={0}>
                  with no key handler: focusable, announced as a button, and
                  impossible to operate from the keyboard.
                */}
                <button
                  type="button"
                  className={cn(
                    "-m-1 inline-flex shrink-0 rounded-md p-1 text-subtle-foreground/70",
                    "transition-colors hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                  aria-label={`How ${metric.label} is calculated`}
                >
                  <Info className="size-3" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-medium">How this is calculated</p>
                <p className="mt-0.5 text-muted-foreground">{metric.provenance.calculation}</p>
                {metric.provenance.rows_used ? (
                  <p className="mt-1 text-muted-foreground">
                    Based on {metric.provenance.rows_used.toLocaleString()} rows.
                  </p>
                ) : null}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div
          className={cn(
            "tabular font-semibold leading-none",
            quiet ? "text-metric-sm" : "text-metric",
          )}
        >
          {formatValue(metric.value, metric.unit, currency, { compact: true })}
        </div>

        {history && history.length > 2 ? (
          <Sparkline
            values={history}
            tone={favourable === null ? "neutral" : favourable ? "positive" : "negative"}
            width={quiet ? 56 : 76}
            height={quiet ? 20 : 26}
            className="mb-0.5 shrink-0"
          />
        ) : null}
      </div>

      <Delta
        value={metric.change_pct}
        metricKey={metric.key}
        comparisonLabel={comparisonLabel}
        size={quiet ? "sm" : "default"}
      />
    </Wrapper>
  );
}

export function KpiCardSkeleton({ quiet = false }: { quiet?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border border-border bg-card",
        quiet ? "p-3.5" : "p-4",
      )}
    >
      <div className="shimmer h-3 w-20" />
      <div className="shimmer h-7 w-28" />
      <div className="shimmer h-3 w-24" />
    </div>
  );
}
