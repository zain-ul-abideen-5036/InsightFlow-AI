import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A KPI's shape, at thumbnail size.
 *
 * A figure with a percentage beside it says how much something moved. It does
 * not say whether the move was a step, a drift, or a spike — and those call
 * for different reactions. This adds that in about 60 pixels.
 *
 * Deliberately axis-free and tooltip-free: it is a glyph, not a chart. The
 * real chart is one click away, and this is marked `aria-hidden` because the
 * value and change beside it already carry the information in text.
 */
export function Sparkline({
  values,
  tone = "neutral",
  className,
  width = 96,
  height = 28,
  showEndpoint = true,
}: {
  values: readonly number[];
  /** Matches the KPI's change tone, so the glyph agrees with the figure. */
  tone?: "positive" | "negative" | "neutral" | "accent";
  className?: string;
  width?: number;
  height?: number;
  showEndpoint?: boolean;
}) {
  const points = React.useMemo(
    () => values.filter((value) => Number.isFinite(value)),
    [values],
  );
  const gradientId = React.useId();

  // Two points is the minimum that can describe a shape; one is a dot, and a
  // dot presented as a trend is a small lie. This sits below every hook, so
  // the early return cannot change the hook order between renders.
  if (points.length < 2) return null;

  const stroke = {
    positive: "hsl(var(--success))",
    negative: "hsl(var(--danger))",
    neutral: "hsl(var(--muted-foreground))",
    accent: "hsl(var(--primary))",
  }[tone];

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  // Inset by the stroke's half-width plus the endpoint dot, so neither is
  // clipped by the viewBox at the extremes of the series.
  const pad = showEndpoint ? 3 : 1.5;
  const x = (index: number) => (index / (points.length - 1)) * (width - pad * 2) + pad;
  const y = (value: number) => height - pad - ((value - min) / span) * (height - pad * 2);

  const line = points.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const area = `${x(0)},${height} ${line} ${x(points.length - 1)},${height}`;

  const lastX = x(points.length - 1);
  const lastY = y(points[points.length - 1]!);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn("overflow-visible", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {showEndpoint ? (
        <circle cx={lastX} cy={lastY} r="2" fill={stroke} stroke="hsl(var(--card))" strokeWidth="1.5" />
      ) : null}
    </svg>
  );
}
