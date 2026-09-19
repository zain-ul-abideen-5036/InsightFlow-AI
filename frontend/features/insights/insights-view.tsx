"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, Upload } from "lucide-react";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { InsightCard } from "@/features/insights/insight-card";
import { api, ClientApiError, queryKeys } from "@/lib/api-client";
import { severityRank } from "@/lib/utils";
import type { Insight, Page } from "@/types/api";

const SEVERITIES = ["all", "critical", "high", "medium", "low", "info"] as const;
const KINDS = [
  "all",
  "trend",
  "risk",
  "opportunity",
  "anomaly",
  "product",
  "geography",
  "customer",
  "concentration",
  "data_quality",
] as const;

export function InsightsView({
  workspaceId,
  initialData,
  currency,
}: {
  workspaceId: string;
  initialData: Page<Insight>;
  currency: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [severity, setSeverity] = React.useState<string>("all");
  const [kind, setKind] = React.useState<string>("all");

  const { data } = useQuery({
    queryKey: queryKeys.insights(workspaceId),
    queryFn: () => api.insights(workspaceId, { limit: "100" }),
    initialData,
  });

  const dismiss = useMutation({
    mutationFn: (insightId: string) => api.dismissInsight(workspaceId, insightId),
    onSuccess: () => {
      toast({ title: "Insight dismissed", tone: "success" });
      queryClient.invalidateQueries({ queryKey: queryKeys.insights(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.overview(workspaceId) });
    },
    onError: (error: ClientApiError) => {
      toast({ title: "Could not dismiss", description: error.message, tone: "error" });
    },
  });

  // Memoised because `?? []` produces a fresh array on every render, which
  // would invalidate every downstream useMemo that depends on it.
  const all = React.useMemo(() => data?.items ?? [], [data]);

  const visible = React.useMemo(
    () =>
      all
        .filter((insight) => severity === "all" || insight.severity === severity)
        .filter((insight) => kind === "all" || insight.kind === kind)
        // Most urgent first; ties broken by the engine's own score.
        .sort(
          (a, b) =>
            severityRank(a.severity) - severityRank(b.severity) || b.score - a.score,
        ),
    [all, severity, kind],
  );

  const counts = React.useMemo(() => {
    const result: Record<string, number> = {};
    for (const insight of all) {
      result[insight.severity] = (result[insight.severity] ?? 0) + 1;
    }
    return result;
  }, [all]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <p className="text-md text-muted-foreground">
          What changed in your business, ranked by how much it matters.
        </p>
      </header>

      {all.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No insights yet"
          description="Insights appear after your first analysis. Each one describes something that moved materially, with the figures behind it — so a very short or very stable dataset may not produce any."
          action={
            <Button asChild>
              <Link href="/datasets/new">
                <Upload aria-hidden="true" />
                Upload data
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="severity-filter" className="text-xs text-muted-foreground">
                Severity
              </label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger id="severity-filter" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "all"
                        ? `All (${all.length})`
                        : `${option[0]!.toUpperCase()}${option.slice(1)}${
                            counts[option] ? ` (${counts[option]})` : ""
                          }`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="kind-filter" className="text-xs text-muted-foreground">
                Type
              </label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger id="kind-filter" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "all" ? "All types" : option.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
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
              icon={Lightbulb}
              title="Nothing matches those filters"
              description="Try widening the severity or type filter to see the rest of the insights from this analysis."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSeverity("all");
                    setKind("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {visible.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  currency={currency}
                  onDismiss={(id) => dismiss.mutate(id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
