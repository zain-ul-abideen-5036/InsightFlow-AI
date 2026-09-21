"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Database,
  FileText,
  Lightbulb,
  MessageSquareText,
  Sparkles,
  Upload,
} from "lucide-react";

import { PageHeader, SectionHeading } from "@/components/page-header";
import { BreakdownChart } from "@/components/charts/breakdown-chart";
import { ContributionChart } from "@/components/charts/contribution-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { EmptyState } from "@/components/states/empty-state";
import { Unavailable } from "@/components/states/unavailable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { Segmented, type SegmentOption } from "@/components/ui/segmented";
import { AnalysisProgress } from "@/features/analysis/analysis-progress";
import { AnomalyRow } from "@/features/anomalies/anomaly-row";
import { KpiCard } from "@/features/dashboard/kpi-card";
import { InsightCard } from "@/features/insights/insight-card";
import { api, queryKeys } from "@/lib/api-client";
import { cn, formatRelativeTime, formatValue, severityRank } from "@/lib/utils";
import type {
  Analysis,
  Metric,
  Overview,
  SegmentsSection,
  TimeSeries,
  TrendsSection,
} from "@/types/api";

/**
 * The four metrics a business owner reads first.
 *
 * Everything the engine computed is still on the screen, but profit, margin,
 * units and the rest move to a quieter second row. Five equal cards in a
 * four-column grid left the fifth wrapping alone at 1280px — a very common
 * laptop width — and gave a reader no idea which figure to start with.
 */
const PRIMARY_KEYS = ["revenue", "orders", "customers", "avg_order_value"] as const;

/** Metrics offered by the main chart's switcher, in order of usefulness. */
const TREND_KEYS = ["revenue", "orders", "customers", "avg_order_value", "profit"] as const;

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

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
    refetchInterval: (query) => (query.state.data?.running_analysis ? 2000 : false),
    // Not while the tab is hidden. Polling a backgrounded tab every two
    // seconds spends the user's battery on a screen nobody is looking at.
    refetchIntervalInBackground: false,
  });

  const overview = data ?? initialData;
  const currency = overview.workspace.currency;
  const running = overview.running_analysis;

  // Hooks must run unconditionally, so these sit above the early returns.
  const seriesMap = React.useMemo(
    () => ((overview.trends ?? {}) as TrendsSection)?.series ?? {},
    [overview.trends],
  );

  const trendOptions = React.useMemo<SegmentOption<string>[]>(() => {
    const ordered = [
      ...TREND_KEYS.filter((key) => seriesMap[key]?.sufficiency.ok),
      ...Object.keys(seriesMap).filter(
        (key) =>
          !TREND_KEYS.includes(key as (typeof TREND_KEYS)[number]) &&
          seriesMap[key]?.sufficiency.ok,
      ),
    ];
    return ordered
      .slice(0, 5)
      .map((key) => ({ value: key, label: seriesMap[key]!.metric_label }));
  }, [seriesMap]);

  const [trendKey, setTrendKey] = React.useState<string | null>(null);
  const activeTrendKey = trendKey ?? trendOptions[0]?.value ?? null;
  const activeSeries: TimeSeries | undefined = activeTrendKey
    ? seriesMap[activeTrendKey]
    : undefined;

  if (!overview.has_data) return <NoDataState />;

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
  const segments = overview.top_segments as SegmentsSection;

  const byKey = new Map(overview.metrics.map((metric) => [metric.key, metric]));
  const primary = PRIMARY_KEYS.map((key) => byKey.get(key)).filter(Boolean) as Metric[];
  // If the dataset does not support all four, backfill so the row stays full
  // rather than leaving a hole where a column should be.
  const usedKeys = new Set(primary.map((metric) => metric.key));
  for (const metric of overview.metrics) {
    if (primary.length >= 4) break;
    if (!usedKeys.has(metric.key)) {
      primary.push(metric);
      usedKeys.add(metric.key);
    }
  }
  const secondary = overview.metrics.filter((metric) => !usedKeys.has(metric.key));

  /** Recent values for a metric, for its sparkline. */
  const historyFor = (key: string): number[] | undefined => {
    const series = seriesMap[key];
    if (!series?.points?.length) return undefined;
    return series.points.slice(-14).map((point) => point.value);
  };

  /**
   * What changed, and what needs attention, are different questions.
   *
   * The dashboard used to answer both with the same records: the "Key
   * insights" panel was filled with anomalies ("Unusual units sold on
   * 2026-03-14") and then the "Recent anomalies" card below it listed the same
   * findings again in a different format. Two names, two treatments, one set
   * of facts.
   */
  const changes = overview.insights
    .filter((insight) => insight.kind !== "anomaly")
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  const attention = overview.anomalies;
  const worstDeviation = Math.max(
    1,
    ...attention.map((anomaly) => Math.abs(anomaly.deviation_pct)),
  );

  const anomalyHighlights = attention
    .filter((anomaly) => anomaly.grain === activeSeries?.grain)
    .map((anomaly) => ({
      period: anomaly.occurred_at.slice(0, 10),
      label: anomaly.metric_label,
    }));

  const primaryBreakdown =
    segments?.breakdowns?.product ??
    segments?.breakdowns?.category ??
    Object.values(segments?.breakdowns ?? {})[0];

  const primaryContribution =
    segments?.contributions?.product ??
    segments?.contributions?.category ??
    Object.values(segments?.contributions ?? {})[0];

  return (
    <div className="space-y-9">
      {/* -------------------------------------------------------- Headline */}
      {/*
        The page used to open with the word "Overview" — a navigation label,
        not a statement. The screen now leads with what actually happened, and
        the nav label survives only as the accessible page name.
      */}
      <PageHeader
        title="Overview"
        titleNode={
          <>
            <span className="text-muted-foreground">{greeting()}.</span>{" "}
            <span className="block sm:inline">{"Here's what changed."}</span>
          </>
        }
        description={summary.headline}
        meta={
          <>
            {summary.current_period ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 font-medium text-foreground">
                <CalendarRange className="size-3.5 text-subtle-foreground" aria-hidden="true" />
                {summary.current_period}
                {summary.previous_period ? (
                  <span className="font-normal text-subtle-foreground">
                    vs {summary.previous_period}
                  </span>
                ) : null}
              </span>
            ) : null}
            <span>
              Last analysed {formatRelativeTime(overview.latest_analysis.finished_at)}
            </span>
            {summary.row_count ? (
              <>
                <Dot />
                <span className="tabular">
                  {summary.row_count.toLocaleString()} records
                </span>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/reports">
                <FileText aria-hidden="true" />
                Generate report
              </Link>
            </Button>
            <Button asChild>
              <Link href="/ask">
                <MessageSquareText aria-hidden="true" />
                Ask InsightFlow
              </Link>
            </Button>
          </>
        }
      />

      {/* ------------------------------------------------------------- KPIs */}
      <section aria-labelledby="kpi-heading" className="enter space-y-3" style={{ "--enter-index": 1 } as React.CSSProperties}>
        <h2 id="kpi-heading" className="sr-only">
          Key figures
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {primary.map((metric) => (
            <KpiCard
              key={metric.key}
              metric={metric}
              currency={currency}
              comparisonLabel={summary.previous_period}
              history={historyFor(metric.key)}
            />
          ))}
        </div>

        {/*
          Everything else the engine computed, in one quiet strip.

          These are real figures and they stay on the screen, but giving them
          the same card weight as revenue told the reader that profit margin
          and total discount deserve equal attention on first glance. They do
          not. One scrollable row of compact items, no cards.
        */}
        {secondary.length > 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-e0">
            <ul className="grid grid-cols-2 divide-y divide-border sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6">
              {secondary.slice(0, 6).map((metric, index) => (
                <li
                  key={metric.key}
                  className={cn(
                    "min-w-0 px-4 py-3",
                    index > 0 && "sm:border-l sm:border-border",
                    index % 2 === 1 && "border-l border-border sm:border-l",
                  )}
                >
                  <p className="eyebrow truncate">{metric.label}</p>
                  <p className="tabular mt-1 text-lg font-semibold leading-tight">
                    {formatValue(metric.value, metric.unit, currency, { compact: true })}
                  </p>
                  <Delta
                    value={metric.change_pct}
                    metricKey={metric.key}
                    size="sm"
                    className="mt-0.5"
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* ------------------------------------------------------ Main trend */}
      {/*
        Full width, and sized to its own content.

        This chart used to sit in a `xl:col-span-3` beside a taller insights
        column, and CSS grid stretched its card to match — leaving roughly
        380px of empty white below the plot on the product's most important
        screen. Nothing was wrong with the chart; the layout was asking it to
        be as tall as a list it had nothing to do with.
      */}
      <section aria-labelledby="trend-heading" className="enter" style={{ "--enter-index": 2 } as React.CSSProperties}>
        <h2 id="trend-heading" className="sr-only">
          Trend over time
        </h2>
        <Card elevation="prominent">
          <CardContent className="pt-5">
            {activeSeries && activeSeries.sufficiency.ok ? (
              <TrendChart
                key={activeTrendKey ?? "trend"}
                series={activeSeries}
                currency={currency}
                highlights={anomalyHighlights}
                height={320}
                description={
                  anomalyHighlights.length
                    ? `${anomalyHighlights.length} unusual ${
                        anomalyHighlights.length === 1 ? "period" : "periods"
                      } marked in red`
                    : undefined
                }
                actions={
                  trendOptions.length > 1 ? (
                    <Segmented
                      label="Metric to plot"
                      options={trendOptions}
                      value={activeTrendKey ?? trendOptions[0]!.value}
                      onChange={setTrendKey}
                      size="sm"
                    />
                  ) : null
                }
              />
            ) : (
              <Unavailable
                title="Trend not available"
                reason={
                  activeSeries?.sufficiency.reason ??
                  "This dataset does not contain enough history to plot a trend."
                }
                required={activeSeries?.sufficiency.required}
              />
            )}
          </CardContent>
        </Card>
      </section>

      {/* ----------------------------------------------------- What changed */}
      <section aria-labelledby="changes-heading" className="enter space-y-4" style={{ "--enter-index": 3 } as React.CSSProperties}>
        <SectionHeading
          id="changes-heading"
          title="What changed"
          count={changes.length || undefined}
          hint="Movements the analysis ranked by how much of the overall change they account for."
          action={
            changes.length > 0 ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/insights">
                  All insights
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : null
          }
        />

        {changes.length ? (
          <div className="space-y-3">
            {/* The top finding gets real prominence. A ranked list in which
                every item looks identical is not a ranked list. */}
            <InsightCard insight={changes[0]!} currency={currency} featured />
            {changes.length > 1 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {changes.slice(1, 5).map((insight) => (
                  <InsightCard key={insight.id} insight={insight} currency={currency} />
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState
            compact
            align="start"
            icon={Lightbulb}
            title="Nothing moved materially"
            description="Insights appear when the analysis finds a change large enough to matter. A short or very stable dataset may not produce any — which is itself a finding."
          />
        )}
      </section>

      {/* -------------------------------------------------- Needs attention */}
      <section aria-labelledby="attention-heading" className="enter space-y-4" style={{ "--enter-index": 4 } as React.CSSProperties}>
        <SectionHeading
          id="attention-heading"
          title="Needs attention"
          count={attention.length || undefined}
          hint="Periods that fall outside what the rest of your data would predict. These are separate from the movements above."
          action={
            attention.length > 0 ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/anomalies">
                  All anomalies
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : null
          }
        />

        {attention.length ? (
          <Card elevation="flat">
            <ul className="divide-y divide-border">
              {attention.slice(0, 5).map((anomaly) => (
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
        ) : (
          <Card elevation="flat" tone="success">
            <CardContent className="flex items-start gap-3 py-4">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
              <div className="space-y-0.5">
                <p className="text-base font-semibold">No anomalies detected</p>
                <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                  Every period in this dataset falls inside the range the rest of the data
                  predicts. Nothing here needs looking at.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ------------------------------------------------- What drove it */}
      {primaryContribution || primaryBreakdown ? (
        <section aria-labelledby="drivers-heading" className="space-y-4">
          <SectionHeading
            id="drivers-heading"
            title="What drove it"
            hint="Which parts of the business account for the movement, and how the total is distributed across them."
          />
          <div className="grid gap-5 xl:grid-cols-2">
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

            {primaryBreakdown ? (
              <Card>
                <CardContent className="pt-5">
                  <BreakdownChart breakdown={primaryBreakdown} currency={currency} />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-5">
                  <Unavailable
                    title="No breakdown available"
                    reason="This dataset has no product, category, or region column to break results down by."
                    required="A column describing products, categories, regions, or channels."
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------ Ask CTA */}
      <AskBand suggestions={overview.suggestions} />
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-subtle-foreground/50">
      ·
    </span>
  );
}

/**
 * The closing call to action.
 *
 * `Questions this data can answer` used to be a bare `flex-wrap` of outline
 * buttons inside a plain white card at the very bottom of the page: the
 * product's signature feature, styled as a form control, below the fold.
 */
function AskBand({ suggestions }: { suggestions: string[] }) {
  return (
    <section aria-labelledby="ask-cta-heading">
      <Card elevation="none" tone="inverse" className="overflow-hidden">
        <div className="relative px-6 py-7 sm:px-8 sm:py-9">
          {/* One soft accent bloom, not a gradient wash. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 50% 90% at 88% 0%, hsl(var(--primary) / 0.22), transparent 70%)",
            }}
          />
          <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
            <div className="max-w-xl space-y-2">
              <h2 id="ask-cta-heading" className="text-2xl font-semibold tracking-tight">
                Have a question about your business?
              </h2>
              <p className="text-base leading-relaxed text-inverse-muted">
                Ask in plain English. InsightFlow plans an analysis, runs it against your data,
                and shows the figures behind the answer.
              </p>
            </div>
            <Button size="lg" variant="on-inverse" asChild>
              <Link href="/ask">
                Ask InsightFlow
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>

          {suggestions.length ? (
            <div className="relative mt-6 flex flex-wrap gap-2">
              {suggestions.slice(0, 5).map((question) => (
                <Link
                  key={question}
                  href={`/ask?q=${encodeURIComponent(question)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-inverse-border
                             bg-inverse-foreground/[0.06] px-3 py-1.5 text-xs text-inverse-foreground/85
                             transition-colors duration-fast hover:bg-inverse-foreground/12
                             hover:text-inverse-foreground focus-visible:outline-none
                             focus-visible:ring-2 focus-visible:ring-inverse-foreground/60"
                >
                  <Sparkles className="size-3 opacity-60" aria-hidden="true" />
                  {question}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </Card>
    </section>
  );
}

function NoDataState() {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <EmptyState
        icon={Upload}
        title="Upload your business data to get started"
        description="InsightFlow reads a CSV or Excel export of your orders, sales, or transactions, works out what the columns mean, and tells you what changed. Nothing is analysed until you confirm the detected fields."
        action={
          <Button size="lg" asChild>
            <Link href="/datasets/new">
              <Upload aria-hidden="true" />
              Upload data
            </Link>
          </Button>
        }
        secondaryAction={
          <Button size="lg" variant="outline" asChild>
            <Link href="/onboarding">Use sample data</Link>
          </Button>
        }
        footnote="CSV, TSV or Excel, up to 50 MB. Nothing leaves your workspace."
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
    <div className="mx-auto max-w-2xl py-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Analysing your data</h1>
        <p className="text-md leading-relaxed text-muted-foreground">
          Working out what your columns mean, computing the metrics your data supports, and
          looking for what changed. This page fills in on its own.
        </p>
      </div>
      <div className="mt-7">
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
    <div className="mx-auto max-w-2xl py-10">
      <EmptyState
        icon={Database}
        title="Your data is uploaded, but not analysed yet"
        description="Review the detected fields so we know what each column means, then run the analysis. It usually takes a few seconds."
        action={
          <Button size="lg" asChild>
            <Link href="/datasets">
              Review and run analysis
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        }
      />
    </div>
  );
}
