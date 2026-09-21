import { ArrowUpRight, Package, Search, Sparkles } from "lucide-react";

import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";

/**
 * A picture of the product, built from the product's own parts.
 *
 * Every figure here is the actual output of running the analysis over the
 * included NovaMart sample dataset — a reader who opens the demo sees exactly
 * these values. That constraint is the point: a marketing shot of numbers the
 * product never produced is a small dishonesty that costs more trust than it
 * buys, in a product whose entire argument is that its figures are traceable.
 *
 * It is a static render rather than a screenshot so it stays sharp at any
 * width, flips with the theme, and cannot go stale against a redesign of the
 * real dashboard — it is made of the same tokens.
 */

const KPIS = [
  { label: "Revenue", value: "$193K", change: "-13.9%", down: true, spark: [58, 62, 55, 71, 83, 96, 74, 69, 78, 76, 82, 71] },
  { label: "Orders", value: "980", change: "-5.2%", down: true, spark: [52, 58, 61, 57, 69, 74, 81, 77, 84, 80, 86, 79] },
  { label: "Customers", value: "692", change: "-2.9%", down: true, spark: [44, 48, 52, 49, 58, 63, 67, 71, 69, 74, 72, 70] },
  { label: "Avg order value", value: "$196.97", change: "-9.1%", down: true, spark: [62, 66, 58, 74, 79, 88, 70, 66, 72, 75, 78, 69] },
];

/** The monthly revenue series, normalised to 0–100 for the plot. */
const TREND = [
  38, 41, 39, 35, 44, 52, 50, 55, 58, 92, 74, 46, 51, 62, 58, 54, 61, 57,
];

export function DashboardPreview({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card shadow-showcase",
        className,
      )}
      // The whole thing is one decorative image of the product; its content is
      // described in the surrounding copy, and announcing every figure in it
      // would read the sample dataset aloud to a screen-reader user.
      role="img"
      aria-label="The InsightFlow dashboard, showing revenue, orders, customers and average order value for the NovaMart sample dataset, a revenue trend chart, a ranked finding, and the Ask InsightFlow entry point."
    >
      {/* ------------------------------------------------------ App chrome */}
      <div className="flex items-center gap-3 border-b border-border bg-chrome px-3.5 py-2.5">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-surface-sunken px-2 py-1">
          <LogoMark className="size-3.5" />
          <span className="text-[10px] font-medium text-muted-foreground">
            NovaMart · Overview
          </span>
        </div>
      </div>

      <div className="flex">
        {/* --------------------------------------------------------- Rail */}
        <div className="hidden w-[134px] shrink-0 flex-col gap-3 border-r border-border bg-chrome px-2.5 py-3 sm:flex">
          <NavGroup
            label="Workspace"
            items={["Overview", "Insights", "Anomalies", "Ask InsightFlow", "Reports"]}
            active="Overview"
          />
          <NavGroup label="Data" items={["Datasets"]} />
        </div>

        {/* ------------------------------------------------------ Content */}
        <div className="min-w-0 flex-1 space-y-3.5 p-3.5 sm:p-4">
          <div className="space-y-0.5">
            <p className="text-[13px] font-semibold tracking-tight">
              <span className="text-muted-foreground">Good morning.</span> Here&rsquo;s what
              changed.
            </p>
            <p className="text-[10.5px] text-muted-foreground">
              Revenue fell 13.9% in Aug 2026 compared with Jul 2026.
            </p>
          </div>

          {/* ------------------------------------------------------- KPIs */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {KPIS.map((kpi) => (
              <div key={kpi.label} className="rounded-lg border border-border bg-card p-2.5">
                <p className="truncate text-[8.5px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground">
                  {kpi.label}
                </p>
                <div className="mt-1 flex items-end justify-between gap-1.5">
                  <p className="tabular text-[15px] font-semibold leading-none tracking-tight">
                    {kpi.value}
                  </p>
                  <MiniSpark values={kpi.spark} />
                </div>
                <p className="tabular mt-1 text-[9.5px] font-semibold text-danger">
                  ↓ {kpi.change}
                </p>
              </div>
            ))}
          </div>

          {/* ------------------------------------------------------ Trend */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold">Revenue over time</p>
              <div className="hidden items-center gap-0.5 rounded-md bg-surface-sunken p-0.5 md:flex">
                {["Revenue", "Orders", "Customers"].map((label, index) => (
                  <span
                    key={label}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[9px] font-medium",
                      index === 0
                        ? "bg-card text-foreground shadow-e0"
                        : "text-subtle-foreground",
                    )}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <TrendPlot />
            <div className="mt-1.5 flex justify-between text-[8.5px] text-subtle-foreground">
              <span>Jun 2025</span>
              <span>Feb 2026</span>
              <span>Aug 2026</span>
            </div>
          </div>

          {/* ---------------------------------------- What changed + Ask */}
          <div className="grid gap-2.5 lg:grid-cols-5">
            <div className="space-y-2 lg:col-span-3">
              <p className="text-[10px] font-semibold">What changed</p>
              <div className="relative overflow-hidden rounded-lg border border-border bg-card p-2.5">
                <span className="absolute inset-y-0 left-0 w-[3px] bg-danger" aria-hidden="true" />
                <div className="flex gap-2 pl-1">
                  <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded bg-danger-subtle text-danger ring-1 ring-inset ring-danger-border/50">
                    <Package className="size-3" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold leading-tight">
                      Nova Air Purifier fell 44.5%
                    </p>
                    <p className="mt-0.5 text-[9.5px] leading-snug text-muted-foreground">
                      Accounts for 62% of the overall change in revenue.
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-0.5 rounded border border-border bg-card px-1.5 py-0.5 text-[8.5px] font-medium">
                        View evidence
                      </span>
                      <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[8.5px] font-medium text-muted-foreground">
                        <Search className="size-2.5" aria-hidden="true" />
                        Investigate
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold">Needs attention</p>
                  <span className="rounded bg-muted px-1 py-px text-[8.5px] font-medium text-muted-foreground">
                    6
                  </span>
                </div>
                <div className="mt-1.5 space-y-1.5">
                  <AnomalyLine
                    metric="Units sold"
                    date="14 Mar 2026"
                    detail="161 against an expected 61"
                    width={100}
                  />
                  <AnomalyLine
                    metric="Revenue"
                    date="16 Jan 2026"
                    detail="$10.3K against an expected $5,269"
                    width={58}
                  />
                </div>
              </div>
            </div>

            {/* ------------------------------------------------------ Ask */}
            <div className="flex flex-col justify-between gap-2 overflow-hidden rounded-lg bg-inverse p-3 text-inverse-foreground lg:col-span-2">
              <div>
                <p className="inline-flex items-center gap-1 rounded border border-inverse-border/70 px-1.5 py-0.5 text-[8.5px] font-medium text-inverse-foreground/75">
                  <Sparkles className="size-2.5" aria-hidden="true" />
                  Ask InsightFlow
                </p>
                <p className="mt-2 text-[11px] font-semibold leading-snug">
                  Have a question about your business?
                </p>
                <p className="mt-1 text-[9.5px] leading-relaxed text-inverse-muted">
                  Ask in plain English. Every figure in the answer is computed from your
                  data and can be opened.
                </p>
              </div>
              <div className="space-y-1">
                {["Why did revenue change last month?", "Which products are declining?"].map(
                  (question) => (
                    <p
                      key={question}
                      className="truncate rounded border border-inverse-border/70 bg-inverse-foreground/[0.07] px-1.5 py-1 text-[8.5px] text-inverse-foreground/85"
                    >
                      {question}
                    </p>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavGroup({
  label,
  items,
  active,
}: {
  label: string;
  items: string[];
  active?: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="px-1.5 pb-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-subtle-foreground">
        {label}
      </p>
      {items.map((item) => (
        <p
          key={item}
          className={cn(
            "relative truncate rounded px-1.5 py-[3px] text-[9.5px]",
            item === active
              ? "bg-card font-medium text-foreground shadow-e0"
              : "text-muted-foreground",
          )}
        >
          {item === active ? (
            <span
              className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
              aria-hidden="true"
            />
          ) : null}
          {item}
        </p>
      ))}
    </div>
  );
}

function MiniSpark({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 44 + 1;
      const y = 15 - ((value - min) / span) * 13;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width="46" height="16" viewBox="0 0 46 16" fill="none" aria-hidden="true">
      <polyline
        points={points}
        stroke="hsl(var(--danger))"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrendPlot() {
  const width = 520;
  const height = 96;
  const min = Math.min(...TREND);
  const max = Math.max(...TREND);
  const span = max - min || 1;

  const point = (value: number, index: number) => {
    const x = (index / (TREND.length - 1)) * width;
    const y = height - 6 - ((value - min) / span) * (height - 18);
    return [x, y] as const;
  };

  const line = TREND.map((value, index) => point(value, index).join(",")).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const [peakX, peakY] = point(max, TREND.indexOf(max));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-2.5 h-[92px] w-full"
      preserveAspectRatio="none"
      // Without this the polyline inherits the default `fill: black` and
      // paints the whole area under the trend line solid.
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="preview-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity="0.20" />
          <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((fraction) => (
        <line
          key={fraction}
          x1="0"
          x2={width}
          y1={height * fraction}
          y2={height * fraction}
          stroke="hsl(var(--chart-grid))"
          strokeWidth="1"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <polygon points={area} fill="url(#preview-fill)" />
      <polyline
        points={line}
        stroke="hsl(var(--chart-1))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* The anomaly the dashboard marks on this same series. */}
      <circle
        cx={peakX}
        cy={peakY}
        r="3.5"
        fill="hsl(var(--danger))"
        stroke="hsl(var(--card))"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function AnomalyLine({
  metric,
  date,
  detail,
  width,
}: {
  metric: string;
  date: string;
  detail: string;
  width: number;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded bg-info-subtle text-info">
        <ArrowUpRight className="size-2.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[9.5px]">
          <span className="font-semibold">{metric}</span>{" "}
          <span className="text-subtle-foreground">{date}</span>
        </p>
        <p className="truncate text-[9px] text-muted-foreground">{detail}</p>
        <div className="mt-0.5 h-[3px] w-24 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-info" style={{ width: `${width}%` }} />
        </div>
      </div>
    </div>
  );
}
