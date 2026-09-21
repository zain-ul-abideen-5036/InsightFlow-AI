"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, Upload } from "lucide-react";

import { PageHeader, SectionHeading } from "@/components/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { Segmented, type SegmentOption } from "@/components/ui/segmented";
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
import type { Insight, Page, Severity } from "@/types/api";

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

/**
 * Severity bands, with the heading each gets when it has members.
 *
 * The page previously rendered fourteen identical cards in a two-column grid
 * and claimed in its own subtitle that they were "ranked by how much it
 * matters". Nothing in the design expressed that ranking: a Critical card and
 * an Info card differed by a badge and a 3px rail.
 */
const BANDS: { key: Severity[]; title: string; hint: string }[] = [
  {
    key: ["critical", "high"],
    title: "Act on these",
    hint: "The largest movements, and the ones accounting for most of the overall change.",
  },
  {
    key: ["medium"],
    title: "Worth knowing",
    hint: "Real movements, smaller in impact.",
  },
  {
    key: ["low", "info"],
    title: "Context",
    hint: "Background findings about the shape of your data rather than about a change in it.",
  },
];

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
          (a, b) => severityRank(a.severity) - severityRank(b.severity) || b.score - a.score,
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

  /**
   * Filter chips, not a dropdown.
   *
   * A `<select>` hides the range of what is available behind a click, which
   * on a filter means you cannot see the shape of your own results until
   * after you have narrowed them. The counts are the point.
   */
  const severityOptions: SegmentOption<string>[] = React.useMemo(() => {
    const options: SegmentOption<string>[] = [
      { value: "all", label: "All", count: all.length },
    ];
    for (const level of ["critical", "high", "medium", "low", "info"] as const) {
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

  /** Only render a band heading where the band has members. */
  const bands = React.useMemo(
    () =>
      BANDS.map((band) => ({
        ...band,
        items: visible.filter((insight) => band.key.includes(insight.severity)),
      })).filter((band) => band.items.length > 0),
    [visible],
  );

  const filtered = severity !== "all" || kind !== "all";

  return (
    <div className="space-y-7">
      <PageHeader
        title="Insights"
        description="What changed in your business, ranked by how much of the overall movement each finding accounts for."
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
          icon={Lightbulb}
          title="No insights yet"
          description="Insights appear after your first analysis. Each one describes something that moved materially, with the figures behind it — so a very short or very stable dataset may not produce any."
          action={
            <Button size="lg" asChild>
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
            <Segmented
              label="Filter by severity"
              options={severityOptions}
              value={severity}
              onChange={setSeverity}
            />

            <div className="flex items-center gap-2">
              <label htmlFor="kind-filter" className="sr-only">
                Filter by type
              </label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger id="kind-filter" className="h-9 w-44">
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

            {filtered ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSeverity("all");
                  setKind("all");
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
              icon={Lightbulb}
              title="Nothing matches those filters"
              description="Try widening the severity or type filter to see the rest of the insights from this analysis."
              action={
                <Button
                  variant="outline"
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
            <div className="space-y-9">
              {bands.map((band, bandIndex) => (
                <section key={band.title} className="space-y-4">
                  <SectionHeading
                    title={band.title}
                    hint={band.hint}
                    count={band.items.length}
                  />
                  {/* The single most important finding, in the most important
                      band, is given real prominence. Everything else keeps
                      the compact two-column treatment. */}
                  {bandIndex === 0 && !filtered ? (
                    <div className="space-y-3">
                      <InsightCard
                        insight={band.items[0]!}
                        currency={currency}
                        onDismiss={(id) => dismiss.mutate(id)}
                        featured
                      />
                      {band.items.length > 1 ? (
                        <div className="grid gap-3 lg:grid-cols-2">
                          {band.items.slice(1).map((insight) => (
                            <InsightCard
                              key={insight.id}
                              insight={insight}
                              currency={currency}
                              onDismiss={(id) => dismiss.mutate(id)}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {band.items.map((insight) => (
                        <InsightCard
                          key={insight.id}
                          insight={insight}
                          currency={currency}
                          onDismiss={(id) => dismiss.mutate(id)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
