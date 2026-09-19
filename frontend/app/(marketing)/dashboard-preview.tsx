import { AlertTriangle, ArrowDownRight, ArrowUpRight, Package } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * Static preview of the real dashboard.
 *
 * The figures shown are the actual output of running the analysis over the
 * NovaMart sample dataset, not invented marketing numbers — a reader who signs
 * up and loads the sample sees exactly these values.
 */
export function DashboardPreview() {
  const kpis = [
    { label: "Revenue", value: "$193,033", change: "-13.9%", down: true },
    { label: "Profit", value: "$91,388", change: "-11.0%", down: true },
    { label: "Orders", value: "980", change: "-5.3%", down: true },
    { label: "Customers", value: "692", change: "-3.1%", down: true },
  ];

  const bars = [42, 47, 44, 52, 58, 71, 95, 61, 63, 74, 72, 80, 73, 68, 59];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-danger/40" />
          <span className="size-2.5 rounded-full bg-warning/40" />
          <span className="size-2.5 rounded-full bg-success/40" />
        </div>
        <span className="ml-2 text-2xs text-muted-foreground">NovaMart · Overview</span>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-border bg-surface p-3.5">
              <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                {kpi.label}
              </p>
              <p className="tabular mt-1.5 text-xl font-semibold tracking-tight">{kpi.value}</p>
              <p
                className={`tabular mt-1 inline-flex items-center gap-0.5 text-2xs font-medium ${
                  kpi.down ? "text-danger" : "text-success"
                }`}
              >
                {kpi.down ? (
                  <ArrowDownRight className="size-3" aria-hidden="true" />
                ) : (
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                )}
                {kpi.change}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Trend */}
          <div className="rounded-lg border border-border bg-surface p-4 lg:col-span-3">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-medium">Revenue over time</p>
              <p className="text-2xs text-muted-foreground">Monthly · 15 periods</p>
            </div>
            <div className="mt-4 flex h-28 items-end gap-1.5" aria-hidden="true">
              {bars.map((height, index) => (
                <div
                  key={index}
                  className={`flex-1 rounded-t-sm ${
                    index === bars.length - 1 ? "bg-danger/70" : "bg-primary/70"
                  }`}
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
            <p className="mt-3 text-2xs text-muted-foreground">Jun 2025 — Aug 2026</p>
          </div>

          {/* Insights */}
          <div className="space-y-2.5 lg:col-span-2">
            <div className="rounded-lg border border-border bg-surface p-3.5">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded bg-danger-subtle text-danger">
                  <Package className="size-3.5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs font-semibold">Nova Air Purifier fell 44.5%</p>
                  </div>
                  <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
                    Accounts for 62% of the overall revenue change.
                  </p>
                  <Badge variant="danger" className="mt-2">
                    Critical
                  </Badge>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface p-3.5">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded bg-warning-subtle text-warning">
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">Zero stock on 7 days</p>
                  <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
                    Coincides with the fall in revenue.
                  </p>
                  <Badge variant="warning" className="mt-2">
                    Investigate
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
