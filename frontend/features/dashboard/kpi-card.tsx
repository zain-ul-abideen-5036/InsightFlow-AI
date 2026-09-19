"use client";

import * as React from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, formatChange, formatValue, isFavourable } from "@/lib/utils";
import type { Metric } from "@/types/api";

/**
 * A headline KPI.
 *
 * Three deliberate choices:
 *
 * 1. The change is shown with an arrow *and* a sign, so direction survives
 *    without colour (WCAG 1.4.1).
 * 2. Green/red reflect whether the movement is *good*, not whether it is up —
 *    falling cost is good news and is coloured accordingly.
 * 3. Every card exposes how the figure was calculated. A number a business
 *    owner cannot interrogate is a number they cannot act on.
 */
export function KpiCard({
  metric,
  currency = "USD",
  comparisonLabel,
  onClick,
}: {
  metric: Metric;
  currency?: string;
  comparisonLabel?: string;
  onClick?: () => void;
}) {
  const favourable = isFavourable(metric.key, metric.change_pct);
  const hasChange = metric.change_pct !== null && metric.change_pct !== undefined;

  const ChangeIcon =
    !hasChange || Math.abs(metric.change_pct ?? 0) < 0.5
      ? ArrowRight
      : (metric.change_pct ?? 0) > 0
        ? ArrowUpRight
        : ArrowDownRight;

  const changeTone =
    favourable === null
      ? "text-muted-foreground"
      : favourable
        ? "text-success"
        : "text-danger";

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "group flex w-full flex-col gap-1.5 rounded-lg border border-border bg-card p-4 text-left",
        "shadow-xs transition-shadow",
        onClick &&
          "cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {metric.label}
        </span>
        {metric.provenance?.calculation ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex cursor-help text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                  tabIndex={0}
                  role="button"
                  aria-label={`How ${metric.label} is calculated`}
                >
                  <Info className="size-3" aria-hidden="true" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
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

      <div className="tabular text-2xl font-semibold leading-none tracking-tight">
        {formatValue(metric.value, metric.unit, currency, { compact: true })}
      </div>

      {hasChange ? (
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", changeTone)}>
            <ChangeIcon className="size-3" aria-hidden="true" />
            <span className="tabular">{formatChange(metric.change_pct)}</span>
          </span>
          {comparisonLabel ? (
            <span className="text-2xs text-muted-foreground">vs {comparisonLabel}</span>
          ) : null}
        </div>
      ) : (
        <p className="text-2xs text-muted-foreground">No comparison period available</p>
      )}
    </Wrapper>
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-4">
      <div className="shimmer h-3 w-20 rounded" />
      <div className="shimmer h-7 w-28 rounded" />
      <div className="shimmer h-3 w-24 rounded" />
    </div>
  );
}
