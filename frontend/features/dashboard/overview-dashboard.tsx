"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Database,
  Lightbulb,
  MessageSquareText,
  Sparkles,
  Upload,
} from "lucide-react";

import { BreakdownChart } from "@/components/charts/breakdown-chart";
import { ContributionChart } from "@/components/charts/contribution-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { EmptyState } from "@/components/states/empty-state";
import { Unavailable } from "@/components/states/unavailable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalysisProgress } from "@/features/analysis/analysis-progress";
import { AnomalyRow } from "@/features/anomalies/anomaly-row";
import { KpiCard } from "@/features/dashboard/kpi-card";
import { InsightCard } from "@/features/insights/insight-card";
import { api, queryKeys } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/utils";
import type { Analysis, Overview, SegmentsSection, TrendsSection } from "@/types/api";

export function OverviewDashboard({
  workspaceId,
  initialData,
}: {
  workspaceId: string;
  initialData: Overview;
}) {
  const { data } = useQuery({
    queryKey: queryKeys.overview(workspaceId),
    queryFn: () => api.overview(workspaceId),
    initialData,
    // While an analysis is in flight, keep checking: the dashboard should fill
    // in by itself rather than wait for the visitor to think to reload.
    refetchInterval: (query) =>
      query.state.data?.running_analysis ? 2000 : false,
  });

  const overview = data ?? initialData;
  const currency = overview.workspace.currency;
  const running = overview.running_analysis;

  if (!overview.has_data) {
    return <NoDataState />;
  }

  if (!overview.latest_analysis) {
    // An analysis already under way is not "not analysed yet". Telling someone
    // to go and start work that is already running — which is exactly what a
    // demo visitor used to see on their first screen — reads as the product
    // not knowing its own state.
    return running ? (
      <AnalysisRunningState workspaceId={workspaceId} analysis={running} />
    ) : (
      <NotAnalysedState />
    );
  }

  const summary = overview.latest_analysis.summary;
  const trends = overview.trends as TrendsSection;
  const segments = overview.top_segments as SegmentsSection;

  const revenueSeries =
    trends?.series?.revenue ?? trends?.series?.orders ?? Object.values(trends?.series ?? {})[0];

  const primaryBreakdown =
    segments?.breakdowns?.product ??
    segments?.breakdowns?.category ??
    Object.values(segments?.breakdowns ?? {})[0];

  const primaryContribution =
    segments?.contributions?.product ??
    segments?.contributions?.category ??
    Object.values(segments?.contributions ?? {})[0];

  // Highlight detected anomalies directly on the trend line so the chart and
  // the anomaly list are visibly the same finding.
  const anomalyHighlights = overview.anomalies
    .filter((anomaly) => anomaly.grain === revenueSeries?.grain)
    .map((anomaly) => ({
      period: anomaly.occurred_at.slice(0, 10),
      label: anomaly.metric_label,
    }));

  return (
    <div className="space-y-8">
      {/* -------------------------------------------------------- Headline */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
            {summary.headline ? (
              <p className="text-md text-muted-foreground">{summary.headline}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/ask">
                <MessageSquareText aria-hidden="true" />
                Ask a question
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/reports">
                <Sparkles aria-hidden="true" />
                Generate report
              </Link>
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Last analysed {formatRelativeTime(overview.latest_analysis.finished_at)}
          {summary.row_count ? ` · ${summary.row_count.toLocaleString()} records` : null}
          {summary.current_period ? ` · ${summary.current_period}` : null}
        </p>
      </header>

      {/* ------------------------------------------------------------- KPIs */}
      <section aria-labelledby="kpi-heading" className="space-y-3">
        <h2 id="kpi-heading" className="sr-only">
          Key figures
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
          {overview.metrics.slice(0, 5).map((metric) => (
            <KpiCard
              key={metric.key}
              metric={metric}
              currency={currency}
              comparisonLabel={summary.previous_period}
            />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------- Trend + insights */}
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardContent className="pt-5">
            {revenueSeries && revenueSeries.sufficiency.ok ? (
              <TrendChart
                series={revenueSeries}
                currency={currency}
                highlights={anomalyHighlights}
                description={
                  anomalyHighlights.length
                    ? `${anomalyHighlights.length} unusual period(s) marked in red`
                    : undefined
                }
              />
            ) : (
              <Unavailable
                title="Trend not available"
                reason={
                  revenueSeries?.sufficiency.reason ??
                  "This dataset does not contain enough history to plot a trend."
                }
                required={revenueSeries?.sufficiency.required}
              />
            )}
          </CardContent>
        </Card>

        <section aria-labelledby="insights-heading" className="space-y-3 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 id="insights-heading" className="text-sm font-semibold">
              Key insights
            </h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/insights">
                View all
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>

          {overview.insights.length ? (
            <div className="space-y-2.5">
              {overview.insights.slice(0, 4).map((insight) => (
                <InsightCard key={insight.id} insight={insight} currency={currency} compact />
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              icon={Lightbulb}
              title="No insights yet"
              description="Insights appear when the analysis finds something that moved materially. A short or very stable dataset may not produce any."
            />
          )}
        </section>
      </div>

      {/* --------------------------------------------------- What drove it */}
      {primaryContribution ? (
        <Card>
          <CardContent className="pt-5">
            <ContributionChart
              breakdown={primaryContribution}
              currency={currency}
              currentPeriod={summary.current_period}
              previousPeriod={summary.previous_period}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* ------------------------------------------- Breakdown + anomalies */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-5">
            {primaryBreakdown ? (
              <BreakdownChart breakdown={primaryBreakdown} currency={currency} />
            ) : (
              <Unavailable
                title="No breakdown available"
                reason="This dataset has no product, category, or region column to break results down by."
                required="A column describing products, categories, regions, or channels."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle as="h2" className="text-sm">
              Recent anomalies
            </CardTitle>
            {overview.anomalies.length ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/anomalies">
                  View all
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {overview.anomalies.length ? (
              <ul className="divide-y divide-border">
                {overview.anomalies.slice(0, 5).map((anomaly) => (
                  <li key={anomaly.id}>
                    <AnomalyRow anomaly={anomaly} currency={currency} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={AlertTriangle}
                title="No anomalies detected yet"
                description="An anomaly is a period that falls outside what the rest of your data would predict. None were found — which is itself a good sign."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------ Suggestions */}
      {overview.suggestions.length ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-sm">
              Questions this data can answer
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {overview.suggestions.map((question) => (
              <Button key={question} variant="outline" size="sm" asChild>
                <Link href={`/ask?q=${encodeURIComponent(question)}`}>{question}</Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function NoDataState() {
  return (
    <div className="mx-auto max-w-2xl py-12">
      <EmptyState
        icon={Upload}
        title="Upload your business data to get started"
        description="InsightFlow reads a CSV or Excel export of your orders, sales, or transactions, works out what the columns mean, and tells you what changed. Nothing is analysed until you confirm the detected fields."
        action={
          <Button asChild>
            <Link href="/datasets/new">
              <Upload aria-hidden="true" />
              Upload data
            </Link>
          </Button>
        }
        secondaryAction={
          <Button variant="outline" asChild>
            <Link href="/onboarding">Use sample data</Link>
          </Button>
        }
      />
    </div>
  );
}

function AnalysisRunningState({
  workspaceId,
  analysis,
}: {
  workspaceId: string;
  analysis: Analysis;
}) {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Analysing your data</h1>
        <p className="text-md text-muted-foreground">
          Working out what your columns mean, computing the metrics your data supports,
          and looking for what changed. This page fills in on its own.
        </p>
      </div>
      <div className="mt-8">
        <AnalysisProgress
          workspaceId={workspaceId}
          analysisId={analysis.id}
          initialData={analysis}
          onComplete={() => router.refresh()}
        />
      </div>
    </div>
  );
}

function NotAnalysedState() {
  return (
    <div className="mx-auto max-w-2xl py-12">
      <EmptyState
        icon={Database}
        title="Your data is uploaded, but not analysed yet"
        description="Review the detected fields so we know what each column means, then run the analysis. It usually takes a few seconds."
        action={
          <Button asChild>
            <Link href="/datasets">
              Review and analyse
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        }
      />
    </div>
  );
}
