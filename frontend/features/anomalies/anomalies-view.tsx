"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck, Upload } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented, type SegmentOption } from "@/components/ui/segmented";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AnomalyRow } from "@/features/anomalies/anomaly-row";
import { api, queryKeys } from "@/lib/api-client";
import { cn, severityRank } from "@/lib/utils";
import type { Anomaly, Page } from "@/types/api";

export function AnomaliesView({
  workspaceId,
  initialData,
  currency,
}: {
  workspaceId: string;
  initialData: Page<Anomaly>;
  currency: string;
}) {
  const [severity, setSeverity] = React.useState<string>("all");
  const [direction, setDirection] = React.useState<string>("all");

  const { data } = useQuery({
    queryKey: queryKeys.anomalies(workspaceId),
    queryFn: () => api.anomalies(workspaceId, { limit: "100" }),
    initialData,
  });

  // Memoised because `?? []` produces a fresh array on every render, which
  // would invalidate every downstream useMemo that depends on it.
  const all = React.useMemo(() => data?.items ?? [], [data]);

  const visible = React.useMemo(
    () =>
      all
        .filter((item) => severity === "all" || item.severity === severity)
        .filter((item) => direction === "all" || item.direction === direction)
        .sort(
          (a, b) => severityRank(a.severity) - severityRank(b.severity) || b.score - a.score,
        ),
    [all, severity, direction],
  );

  const drops = all.filter((item) => item.direction === "down").length;
  const spikes = all.filter((item) => item.direction === "up").length;

  const counts = React.useMemo(() => {
    const result: Record<string, number> = {};
    for (const item of all) result[item.severity] = (result[item.severity] ?? 0) + 1;
    return result;
  }, [all]);

  /**
   * Chips, so the shape of the results is visible before filtering.
   *
   * A select hides the range of what is available behind a click, which on
   * a filter means you cannot see how your results are distributed until
   * after you have narrowed them. The counts are the point.
   */
  const severityOptions: SegmentOption<string>[] = React.useMemo(() => {
    const options: SegmentOption<string>[] = [
      { value: "all", label: "All", count: all.length },
    ];
    for (const level of ["critical", "high", "medium", "low"] as const) {
      if (counts[level]) {
        options.push({
          value: level,
          label: `${level[0]!.toUpperCase()}${level.slice(1)}`,
          count: counts[level],
        });
      }
    }
    return options;
  }, [all.length, counts]);

  // Deviation bars scale against the worst on the page, so comparing two
  // rows by eye means something.
  const worstDeviation = React.useMemo(
    () => Math.max(1, ...visible.map((item) => Math.abs(item.deviation_pct))),
    [visible],
  );

  return (
    <div className="space-y-7">
      <PageHeader
        title="Anomalies"
        description="Periods that fall outside what the rest of your data would predict. These are separate from the movements on Insights: an anomaly is a period behaving unlike its neighbours, not a segment that grew or shrank."
        meta={
          all.length ? (
            <span aria-live="polite">
              Showing {visible.length} of {all.length}
            </span>
          ) : null
        }
      />

      {all.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No anomalies detected"
          description="An anomaly is a period that deviates materially from what the surrounding data predicts. Finding none means your figures have been behaving consistently — or that there is not yet enough history to establish what normal looks like."
          action={
            <Button variant="outline" asChild>
              <Link href="/datasets">
                <Upload aria-hidden="true" />
                Upload more data
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total detected", value: all.length, tone: "" },
              { label: "Below expected", value: drops, tone: "text-danger" },
              { label: "Above expected", value: spikes, tone: "text-info" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-border bg-card p-4 shadow-e1"
              >
                <p className="eyebrow">{stat.label}</p>
                <p
                  className={cn(
                    "tabular mt-1.5 text-metric-sm font-semibold",
                    stat.tone,
                  )}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Filter by severity"
              options={severityOptions}
              value={severity}
              onChange={setSeverity}
            />

            <div className="flex items-center gap-2">
              <label htmlFor="anomaly-direction" className="sr-only">
                Filter by direction
              </label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger id="anomaly-direction" className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Both directions</SelectItem>
                  <SelectItem value="down">Below expected</SelectItem>
                  <SelectItem value="up">Above expected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {severity !== "all" || direction !== "all" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSeverity("all");
                  setDirection("all");
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              compact
              align="start"
              icon={AlertTriangle}
              title="Nothing matches those filters"
              description="Widen the severity or direction filter to see the rest."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSeverity("all");
                    setDirection("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <Card elevation="flat">
              <ul className="divide-y divide-border">
                {visible.map((anomaly) => (
                  <li key={anomaly.id}>
                    <AnomalyRow
                      anomaly={anomaly}
                      currency={currency}
                      maxDeviation={worstDeviation}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
