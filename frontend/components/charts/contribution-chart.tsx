"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
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
 * How each segment contributed to a change.
 *
 * Diverging bars around zero: the question being answered is "who moved, and
 * which way", and a signed bar answers it at a glance. Colour carries the sign,
 * but so does the bar's direction, so the meaning survives without colour.
 */
export function ContributionChart({
  breakdown,
  currency = "USD",
  limit = 8,
  currentPeriod,
  previousPeriod,
}: {
  breakdown: Breakdown;
  currency?: string;
  limit?: number;
  currentPeriod?: string;
  previousPeriod?: string;
}) {
  const rows = React.useMemo(
    () =>
      breakdown.rows
        .filter((row) => row.change !== null)
        .slice(0, limit)
        .map((row) => ({
          name: truncate(row.name, 26),
          fullName: row.name,
          change: row.change ?? 0,
          contribution: row.contribution_pct,
          changePct: row.change_pct,
        })),
    [breakdown.rows, limit],
  );

  const summary = React.useMemo(() => {
    const leader = breakdown.rows[0];
    const window =
      currentPeriod && previousPeriod ? ` between ${previousPeriod} and ${currentPeriod}` : "";
    if (!leader || leader.change === null) {
      return `Change in ${breakdown.metric_label.toLowerCase()} by ${breakdown.dimension}${window}.`;
    }
    return (
      `Change in ${breakdown.metric_label.toLowerCase()} by ${breakdown.dimension}${window}. ` +
      `${leader.name} moved the most, by ${formatValue(leader.change, breakdown.unit, currency)}` +
      (leader.contribution_pct !== null
        ? `, which is ${Math.abs(leader.contribution_pct).toFixed(0)}% of the total change.`
        : ".")
    );
  }, [breakdown, currency, currentPeriod, previousPeriod]);

  return (
    <ChartFrame
      title={`What drove the change in ${breakdown.metric_label.toLowerCase()}`}
      description={
        currentPeriod && previousPeriod ? `${previousPeriod} to ${currentPeriod}` : undefined
      }
      summary={summary}
      columns={["Segment", "Change", "Share of change"]}
      rows={rows.map((row) => [
        row.fullName,
        formatValue(row.change, breakdown.unit, currency),
        row.contribution !== null && row.contribution !== undefined
          ? `${row.contribution.toFixed(1)}%`
          : "—",
      ])}
      height={Math.max(200, rows.length * 34 + 28)}
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
          <ReferenceLine x={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
          <Bar dataKey="change" name="Change" radius={3} barSize={18}>
            {rows.map((row) => (
              <Cell
                key={row.fullName}
                fill={row.change >= 0 ? "hsl(var(--success))" : "hsl(var(--danger))"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
