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
  low: "info",
  info: "neutral",
};

/**
 * One anomalous period.
 *
 * Deliberately shows observed *and* expected. "Revenue was $4,200" means
 * nothing on its own; "$4,200 against an expected $7,300" is the finding.
 */
export function AnomalyRow({
  anomaly,
  currency = "USD",
  showAction = true,
}: {
  anomaly: Anomaly;
  currency?: string;
  showAction?: boolean;
}) {
  const unit =
    anomaly.metric_key === "revenue" ||
    anomaly.metric_key === "profit" ||
    anomaly.metric_key === "cost" ||
    anomaly.metric_key === "avg_order_value"
      ? "currency"
      : "count";

  const DirectionIcon = anomaly.direction === "up" ? ArrowUpRight : ArrowDownRight;
  const alsoAffected = anomaly.context?.also_affected ?? [];

  return (
    <div className="flex flex-wrap items-start gap-3 py-3">
      <div
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
          anomaly.direction === "up"
            ? "bg-info-subtle text-info"
            : "bg-danger-subtle text-danger",
        )}
      >
        <DirectionIcon className="size-4" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">
            {anomaly.metric_label} on {formatDate(anomaly.occurred_at)}
          </p>
          <Badge variant={SEVERITY_VARIANT[anomaly.severity]}>{anomaly.severity}</Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          <span className="tabular font-medium text-foreground">
            {formatValue(anomaly.observed_value, unit, currency, { compact: true })}
          </span>{" "}
          against an expected{" "}
          <span className="tabular">
            {formatValue(anomaly.expected_value, unit, currency, { compact: true })}
          </span>{" "}
          —{" "}
          <span
            className={cn(
              "tabular font-medium",
              anomaly.direction === "up" ? "text-info" : "text-danger",
            )}
          >
            {Math.abs(anomaly.deviation_pct).toFixed(1)}%{" "}
            {anomaly.direction === "up" ? "above" : "below"}
          </span>{" "}
          the expected range.
        </p>

        {alsoAffected.length ? (
          <p className="text-2xs text-muted-foreground">
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
