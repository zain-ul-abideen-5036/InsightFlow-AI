"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartFrame } from "@/components/charts/chart-frame";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { formatValue, truncate } from "@/lib/utils";
import type { Breakdown } from "@/types/api";

/**
 * A metric broken down by one dimension.
 *
 * Horizontal bars, because segment names are words: rotated labels under
 * vertical bars are markedly harder to read, and product names are long.
 */
export function BreakdownChart({
  breakdown,
  currency = "USD",
  limit = 8,
  height,
}: {
  breakdown: Breakdown;
  currency?: string;
  limit?: number;
  height?: number;
}) {
  const rows = React.useMemo(
    () =>
      breakdown.rows.slice(0, limit).map((row) => ({
        name: truncate(row.name, 28),
        fullName: row.name,
        value: row.value,
        share: row.share_pct,
        isOther: Boolean(row.is_other),
      })),
    [breakdown.rows, limit],
  );

  const summary = React.useMemo(() => {
    const leader = breakdown.rows[0];
    const base = `${breakdown.metric_label} by ${breakdown.dimension}, across ${breakdown.rows.length} segments.`;
    if (!leader) return base;
    return (
      `${base} The largest is ${leader.name} at ` +
      `${formatValue(leader.value, breakdown.unit, currency)} (${leader.share_pct.toFixed(1)}% of the total). ` +
      (breakdown.concentration.description ?? "")
    );
  }, [breakdown, currency]);

  return (
    <ChartFrame
      title={`${breakdown.metric_label} by ${breakdown.dimension}`}
      summary={summary}
      columns={["Segment", breakdown.metric_label, "Share"]}
      rows={breakdown.rows.map((row) => [
        row.name,
        formatValue(row.value, breakdown.unit, currency),
        `${row.share_pct.toFixed(1)}%`,
      ])}
      height={height ?? Math.max(200, rows.length * 34 + 28)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) =>
              formatValue(value, breakdown.unit, currency, { compact: true })
            }
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={130}
          />
          <Tooltip
            content={<ChartTooltip unit={breakdown.unit} currency={currency} />}
            cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
          />
          <Bar dataKey="value" name={breakdown.metric_label} radius={[0, 4, 4, 0]} barSize={18}>
            {rows.map((row, index) => (
              <Cell
                key={row.fullName}
                // "Other" is an aggregate, not a segment; greying it stops it
                // reading as the fifth-largest product.
                fill={
                  row.isOther
                    ? "hsl(var(--muted-foreground))"
                    : `hsl(var(--chart-${(index % 6) + 1}))`
                }
                fillOpacity={row.isOther ? 0.45 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
