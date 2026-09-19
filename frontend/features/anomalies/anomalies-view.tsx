"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck, Upload } from "lucide-react";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AnomalyRow } from "@/features/anomalies/anomaly-row";
import { api, queryKeys } from "@/lib/api-client";
import { severityRank } from "@/lib/utils";
import type { Anomaly, Page } from "@/types/api";

const SEVERITIES = ["all", "critical", "high", "medium", "low"] as const;

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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Anomalies</h1>
        <p className="text-md text-muted-foreground">
          Periods that fall outside what the rest of your data would predict.
        </p>
      </header>

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
              { label: "Total detected", value: all.length },
              { label: "Below expected", value: drops },
              { label: "Above expected", value: spikes },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
                <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </p>
                <p className="tabular mt-1 text-xl font-semibold">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="anomaly-severity" className="text-xs text-muted-foreground">
                Severity
              </label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger id="anomaly-severity" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "all" ? "All severities" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="anomaly-direction" className="text-xs text-muted-foreground">
                Direction
              </label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger id="anomaly-direction" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Both directions</SelectItem>
                  <SelectItem value="down">Below expected</SelectItem>
                  <SelectItem value="up">Above expected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
              Showing {visible.length} of {all.length}
            </p>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              compact
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
            <Card>
              <CardContent className="pt-2">
                <ul className="divide-y divide-border">
                  {visible.map((anomaly) => (
                    <li key={anomaly.id}>
                      <AnomalyRow anomaly={anomaly} currency={currency} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
