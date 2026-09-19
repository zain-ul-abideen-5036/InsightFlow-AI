"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartFrame } from "@/components/charts/chart-frame";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { formatValue } from "@/lib/utils";
import type { TimeSeries } from "@/types/api";

/**
 * The revenue (or any metric) trend over time.
 *
 * The moving average is drawn as a second, quieter line: on daily data the raw
 * series is too noisy to read a direction from, and showing only the smoothed
 * line would hide the volatility that is itself a finding.
 */
export function TrendChart({
  series,
  currency = "USD",
  highlights = [],
  height = 300,
  description,
}: {
  series: TimeSeries;
  currency?: string;
  /** Periods to mark, e.g. detected anomalies. */
  highlights?: { period: string; label: string }[];
  height?: number;
  description?: string;
}) {
  const data = React.useMemo(
    () =>
      series.points.map((point, index) => ({
        period: point.period,
        value: point.value,
        average: series.moving_average[index] ?? null,
        rows: point.rows,
      })),
    [series],
  );

  const hasAverage = series.moving_average.some((value) => value !== null);
  const highlightMap = new Map(highlights.map((item) => [item.period, item.label]));

  const summary = React.useMemo(() => {
    const { summary: s } = series;
    if (!s.periods) return `${series.metric_label} over time.`;
    const direction = s.trend_description ?? "";
    return (
      `${series.metric_label} across ${s.periods} ${series.grain} periods from ` +
      `${s.first_period} to ${s.last_period}. ` +
      `It started at ${formatValue(s.first_value ?? null, series.unit, currency)} and ended at ` +
      `${formatValue(s.last_value ?? null, series.unit, currency)}. ` +
      `The highest period was ${s.peak_period} and the lowest was ${s.trough_period}. ${direction}`
    );
  }, [series, currency]);

  return (
    <ChartFrame
      title={`${series.metric_label} over time`}
      description={description}
      summary={summary}
      columns={["Period", series.metric_label]}
      rows={data.map((row) => [row.period, formatValue(row.value, series.unit, currency)])}
      height={height}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.22} />
              <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            vertical={false}
          />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            minTickGap={28}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={62}
            tickFormatter={(value: number) =>
              formatValue(value, series.unit, currency, { compact: true })
            }
          />
          <Tooltip
            content={<ChartTooltip unit={series.unit} currency={currency} />}
            cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            name={series.metric_label}
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
            fill="url(#trend-fill)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--background))" }}
          />
          {hasAverage ? (
            <Line
              type="monotone"
              dataKey="average"
              name="Moving average"
              stroke="hsl(var(--chart-3))"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              connectNulls
            />
          ) : null}
          {data
            .filter((row) => highlightMap.has(row.period))
            .map((row) => (
              <ReferenceDot
                key={row.period}
                x={row.period}
                y={row.value}
                r={5}
                fill="hsl(var(--danger))"
                stroke="hsl(var(--background))"
                strokeWidth={2}
              />
            ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
