"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatValue } from "@/lib/utils";
import type { Anomaly, Severity } from "@/types/api";

const SEVERITY_VARIANT: Record<Severity, "danger" | "warning" | "info" | "neutral"> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "neutral",
  info: "neutral",
};

/** Severities quiet enough that a badge would be louder than the finding. */
const BADGE_HIDDEN = new Set<Severity>(["low", "info"]);

/**
 * One anomalous period.
 *
 * Deliberately shows observed *and* expected. "Revenue was $4,200" means
 * nothing on its own; "$4,200 against an expected $7,300" is the finding.
 *
 * The deviation bar is the addition. A list of rows each reporting a
 * percentage gives no sense of which one is furthest out — the reader has to
 * compare numbers across rows by eye. The bar does it for them, scaled against
 * the largest deviation on the page so the comparison is real rather than
 * against an arbitrary ceiling.
 */
export function AnomalyRow({
  anomaly,
  currency = "USD",
  showAction = true,
  /** The largest deviation in this list, so bars are comparable across rows. */
  maxDeviation,
}: {
  anomaly: Anomaly;
  currency?: string;
  showAction?: boolean;
  maxDeviation?: number;
}) {
  const unit =
    anomaly.metric_key === "revenue" ||
    anomaly.metric_key === "profit" ||
    anomaly.metric_key === "cost" ||
    anomaly.metric_key === "avg_order_value"
      ? "currency"
      : "count";

  const up = anomaly.direction === "up";
  const DirectionIcon = up ? ArrowUpRight : ArrowDownRight;
  const alsoAffected = anomaly.context?.also_affected ?? [];

  const deviation = Math.abs(anomaly.deviation_pct);
  const ceiling = Math.max(maxDeviation ?? deviation, 1);
  const barWidth = Math.max(4, Math.min(100, (deviation / ceiling) * 100));

  return (
    <div className="flex flex-wrap items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-sunken/60">
      <div
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
          up
            ? "bg-info-subtle text-info ring-info-border/50"
            : "bg-danger-subtle text-danger ring-danger-border/50",
        )}
      >
        <DirectionIcon className="size-4" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold">{anomaly.metric_label}</p>
          <span className="text-xs text-subtle-foreground">
            {formatDate(anomaly.occurred_at)}
          </span>
          {/* `sentence` capitalises the API's lowercase vocabulary, so the
              same word cannot read as "critical" here and "Critical" on the
              insights list one click away. */}
          {BADGE_HIDDEN.has(anomaly.severity) ? null : (
            <Badge variant={SEVERITY_VARIANT[anomaly.severity]} sentence>
              {anomaly.severity}
            </Badge>
          )}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="tabular font-semibold text-foreground">
            {formatValue(anomaly.observed_value, unit, currency, { compact: true })}
          </span>{" "}
          against an expected{" "}
          <span className="tabular">
            {formatValue(anomaly.expected_value, unit, currency, { compact: true })}
          </span>{" "}
          —{" "}
          <span className={cn("tabular font-semibold", up ? "text-info" : "text-danger")}>
            {deviation.toFixed(1)}% {up ? "above" : "below"}
          </span>{" "}
          the expected range.
        </p>

        {/* How far out, relative to everything else on this page. */}
        <div
          className="h-1 w-full max-w-[18rem] overflow-hidden rounded-full bg-muted"
          aria-hidden="true"
        >
          <div
            className={cn("h-full rounded-full", up ? "bg-info" : "bg-danger")}
            style={{ width: `${barWidth}%` }}
          />
        </div>

        {alsoAffected.length ? (
          <p className="text-2xs text-subtle-foreground">
            {alsoAffected.map((item) => item.metric_label).join(", ")} moved at the same time.
          </p>
        ) : null}
      </div>

      {showAction ? (
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <Link href={`/anomalies/${anomaly.id}`}>
            <Search aria-hidden="true" />
            Investigate
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
