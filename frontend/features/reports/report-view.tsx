"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

import { BreakdownChart } from "@/components/charts/breakdown-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { Unavailable } from "@/components/states/unavailable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatChange, formatDate, formatValue, isFavourable } from "@/lib/utils";
import type {
  Breakdown,
  Metric,
  ReportDetail,
  ReportSection,
  SegmentsSection,
  TrendsSection,
} from "@/types/api";

/**
 * A business performance report.
 *
 * Laid out to be read top to bottom by someone who was not involved in
 * producing it, and styled to print cleanly — a report a business owner cannot
 * hand to their accountant is not finished.
 */
export function ReportView({
  report,
  currency = "USD",
}: {
  report: ReportDetail;
  currency?: string;
}) {
  const section = (key: string) => report.sections.find((item) => item.key === key);

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <div className="no-print">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/reports">
            <ArrowLeft aria-hidden="true" />
            All reports
          </Link>
        </Button>
      </div>

      {/*
        A title block, not a page header.

        This artefact is the thing a business owner forwards to their board,
        and it used to open exactly like every other application screen. It
        now reads as a document: a masthead rule, the period as the subject,
        and the provenance stated up front rather than buried at the end.
      */}
      <header className="border-y border-border py-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0 space-y-2">
            <p className="eyebrow">Business performance report</p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance">
              {report.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {report.period_label} &middot; generated{" "}
              {formatDate(report.created_at, true)}
            </p>
          </div>
          <Button variant="outline" className="no-print" onClick={() => window.print()}>
            <Printer aria-hidden="true" />
            Print / Save as PDF
          </Button>
        </div>
        <p className="mt-5 max-w-prose text-xs leading-relaxed text-subtle-foreground">
          Every figure below was computed from your data at the moment this report was
          generated and is fixed to it, so the numbers here will not move if the underlying
          analysis is re-run.
        </p>
      </header>

      <ExecutiveSummary section={section("summary")} />
      <KeyFigures section={section("kpis")} currency={currency} />
      <Trends section={section("trends")} currency={currency} />
      <Segments section={section("segments")} currency={currency} />
      <Insights section={section("insights")} />
      <Anomalies section={section("anomalies")} currency={currency} />
      <AboutThisAnalysis section={section("data")} />
    </div>
  );
}

function ExecutiveSummary({ section }: { section?: ReportSection }) {
  if (!section?.body && !section?.key_points?.length) return null;
  return (
    <Card elevation="flat" className="print-break-inside-avoid">
      <CardHeader>
        <CardTitle as="h2" className="text-lg">{section.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {section.body ? (
          <p className="text-md leading-relaxed">{section.body}</p>
        ) : null}

        {section.key_points?.length ? (
          <div className="space-y-2">
            <h3 className="eyebrow">
              Key points
            </h3>
            <ul className="space-y-1.5">
              {section.key_points.map((point, index) => (
                <li key={index} className="flex gap-2 text-sm">
                  <span className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-foreground/40" aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {section.recommended_focus?.length ? (
          <div className="space-y-2 rounded-xl border border-border bg-surface-sunken px-4 py-3.5">
            <h3 className="eyebrow">
              Where to focus
            </h3>
            <ul className="space-y-1.5">
              {section.recommended_focus.map((item, index) => (
                <li key={index} className="text-sm text-muted-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function KeyFigures({ section, currency }: { section?: ReportSection; currency: string }) {
  const metrics = (section?.items ?? []) as unknown as Metric[];
  if (!metrics.length) return null;

  return (
    <Card className="print-break-inside-avoid">
      <CardHeader>
        <CardTitle as="h2">{section?.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table caption="Key figures for this period, compared with the previous one">
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead numeric>This period</TableHead>
              <TableHead numeric>Previous</TableHead>
              <TableHead numeric>Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.map((metric) => {
              const favourable = isFavourable(metric.key, metric.change_pct);
              return (
                <TableRow key={metric.key}>
                  <TableCell className="font-medium">{metric.label}</TableCell>
                  <TableCell numeric>
                    {formatValue(metric.value, metric.unit, currency)}
                  </TableCell>
                  <TableCell numeric className="text-muted-foreground">
                    {metric.previous_value !== null
                      ? formatValue(metric.previous_value, metric.unit, currency)
                      : "—"}
                  </TableCell>
                  <TableCell
                    numeric
                    className={cn(
                      "font-medium",
                      favourable === null
                        ? "text-muted-foreground"
                        : favourable
                          ? "text-success"
                          : "text-danger",
                    )}
                  >
                    {formatChange(metric.change_pct)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Trends({ section, currency }: { section?: ReportSection; currency: string }) {
  const payload = section?.payload as TrendsSection | undefined;
  const series = payload?.series?.revenue ?? Object.values(payload?.series ?? {})[0];
  if (!series) return null;

  return (
    <Card className="print-break-inside-avoid">
      <CardHeader>
        <CardTitle as="h2">{section?.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {series.sufficiency.ok ? (
          <TrendChart series={series} currency={currency} height={260} />
        ) : (
          <Unavailable
            title="Trend not available"
            reason={series.sufficiency.reason}
            required={series.sufficiency.required}
          />
        )}

        {payload?.seasonality?.available && payload.seasonality.is_meaningful ? (
          <p className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
            {payload.seasonality.description}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Segments({ section, currency }: { section?: ReportSection; currency: string }) {
  const payload = section?.payload as SegmentsSection | undefined;
  const breakdowns = Object.values(payload?.breakdowns ?? {}) as Breakdown[];
  if (!breakdowns.length) return null;

  return (
    <Card className="print-break-inside-avoid">
      <CardHeader>
        <CardTitle as="h2">{section?.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {breakdowns.slice(0, 2).map((breakdown) => (
          <BreakdownChart
            key={breakdown.dimension}
            breakdown={breakdown}
            currency={currency}
            limit={6}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function Insights({ section }: { section?: ReportSection }) {
  const items = (section?.items ?? []) as {
    id: string;
    title: string;
    summary: string;
    severity: string;
  }[];
  if (!items.length) return null;

  return (
    <Card className="print-break-inside-avoid">
      <CardHeader>
        <CardTitle as="h2">{section?.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="border-l-2 border-border pl-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{item.title}</p>
                <Badge
                  variant={
                    item.severity === "critical" || item.severity === "high"
                      ? "danger"
                      : item.severity === "medium"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {item.severity}
                </Badge>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {item.summary}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Anomalies({ section, currency }: { section?: ReportSection; currency: string }) {
  const items = (section?.items ?? []) as {
    id: string;
    metric_label: string;
    occurred_at: string;
    observed_value: number;
    expected_value: number;
    deviation_pct: number;
    severity: string;
    direction: string;
  }[];
  if (!items.length) return null;

  return (
    <Card className="print-break-inside-avoid">
      <CardHeader>
        <CardTitle as="h2">{section?.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table caption="Unusual periods detected in this dataset">
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead>Date</TableHead>
              <TableHead numeric>Observed</TableHead>
              <TableHead numeric>Expected</TableHead>
              <TableHead numeric>Deviation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.metric_label}</TableCell>
                <TableCell>{formatDate(item.occurred_at)}</TableCell>
                <TableCell numeric>
                  {formatValue(item.observed_value, "number", currency, { compact: true })}
                </TableCell>
                <TableCell numeric className="text-muted-foreground">
                  {formatValue(item.expected_value, "number", currency, { compact: true })}
                </TableCell>
                <TableCell
                  numeric
                  className={cn(
                    "font-medium",
                    item.direction === "up" ? "text-info" : "text-danger",
                  )}
                >
                  {formatChange(item.deviation_pct)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AboutThisAnalysis({ section }: { section?: ReportSection }) {
  const payload = section?.payload as
    | {
        dataset_name?: string;
        row_count?: number;
        generated_by?: string;
        model?: string | null;
        derivations?: Record<string, string>;
        quality_issues?: { title: string; detail: string }[];
      }
    | undefined;
  if (!payload) return null;

  const derivations = Object.entries(payload.derivations ?? {});

  return (
    <Card className="print-break-inside-avoid">
      <CardHeader>
        <CardTitle as="h2" className="text-sm">
          {section?.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs leading-relaxed text-muted-foreground">
        <p>
          Based on {payload.dataset_name ?? "your dataset"}
          {payload.row_count ? `, covering ${payload.row_count.toLocaleString()} records` : null}.
          Every figure in this report was computed directly from that data.
        </p>

        {derivations.length ? (
          <div>
            <p className="font-medium text-foreground">Calculated fields</p>
            <ul className="mt-1 space-y-0.5">
              {derivations.map(([name, formula]) => (
                <li key={name}>
                  {name}: {formula} (not a column in your file)
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {payload.quality_issues?.length ? (
          <div>
            <p className="font-medium text-foreground">Data quality notes</p>
            <ul className="mt-1 space-y-0.5">
              {payload.quality_issues.slice(0, 4).map((issue) => (
                <li key={issue.title}>{issue.detail}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <p>
          {payload.generated_by === "deterministic"
            ? "The written summary was produced from the computed analysis without a language model."
            : `The written summary was phrased by ${payload.model ?? payload.generated_by}, using only the figures above.`}
        </p>
      </CardContent>
    </Card>
  );
}
