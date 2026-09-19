"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Database,
  Eye,
  MapPin,
  Minus,
  Package,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EvidenceList } from "@/features/insights/evidence-panel";
import { cn, formatChange, formatValue } from "@/lib/utils";
import type { Insight, Severity } from "@/types/api";

const SEVERITY_STYLE: Record<Severity, { badge: "danger" | "warning" | "info" | "neutral"; label: string; accent: string }> = {
  critical: { badge: "danger", label: "Critical", accent: "bg-danger" },
  high: { badge: "danger", label: "High", accent: "bg-danger/70" },
  medium: { badge: "warning", label: "Medium", accent: "bg-warning" },
  low: { badge: "info", label: "Low", accent: "bg-info/60" },
  info: { badge: "neutral", label: "Info", accent: "bg-muted-foreground/40" },
};

const KIND_ICON: Record<string, typeof TrendingUp> = {
  trend: TrendingUp,
  risk: AlertTriangle,
  opportunity: Sparkles,
  anomaly: AlertTriangle,
  concentration: Boxes,
  customer: Users,
  product: Package,
  geography: MapPin,
  data_quality: Database,
};

/**
 * One insight.
 *
 * The `summary` is written by the analytics engine and is always present and
 * always correct. `narrative` is an optional AI rewrite layered on top — it is
 * shown as an addition, never as a replacement, so a user can always see the
 * computed statement.
 */
export function InsightCard({
  insight,
  currency = "USD",
  onDismiss,
  onInvestigate,
  compact = false,
}: {
  insight: Insight;
  currency?: string;
  onDismiss?: (id: string) => void;
  onInvestigate?: (insight: Insight) => void;
  compact?: boolean;
}) {
  const [evidenceOpen, setEvidenceOpen] = React.useState(false);
  const severity = SEVERITY_STYLE[insight.severity] ?? SEVERITY_STYLE.info;
  const Icon = KIND_ICON[insight.kind] ?? TrendingUp;

  const DirectionIcon =
    insight.direction === "up" ? ArrowUpRight : insight.direction === "down" ? ArrowDownRight : Minus;

  return (
    <>
      <article
        className={cn(
          "group relative flex gap-3 overflow-hidden rounded-lg border border-border bg-card",
          "shadow-xs transition-shadow hover:shadow-md",
          compact ? "p-3.5" : "p-4",
        )}
      >
        {/* Severity is carried by a label and an icon too — never colour alone. */}
        <span
          className={cn("absolute inset-y-0 left-0 w-0.5", severity.accent)}
          aria-hidden="true"
        />

        <div
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md",
            insight.severity === "critical" || insight.severity === "high"
              ? "bg-danger-subtle text-danger"
              : insight.severity === "medium"
                ? "bg-warning-subtle text-warning"
                : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-snug">{insight.title}</h3>
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge variant={severity.badge}>{severity.label}</Badge>
              {onDismiss ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => onDismiss(insight.id)}
                  aria-label={`Dismiss insight: ${insight.title}`}
                >
                  <X aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">{insight.summary}</p>

          {insight.narrative ? (
            <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed">
              {insight.narrative}
            </p>
          ) : null}

          {insight.metric_value !== null && insight.change_pct !== null ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
              <span className="tabular font-medium">
                {formatValue(insight.metric_value, insight.unit, currency, { compact: true })}
              </span>
              <span
                className={cn(
                  "tabular inline-flex items-center gap-0.5 font-medium",
                  insight.direction === "up" ? "text-success" : "text-danger",
                )}
              >
                <DirectionIcon className="size-3" aria-hidden="true" />
                {formatChange(insight.change_pct)}
              </span>
              {insight.comparison_value !== null ? (
                <span className="text-muted-foreground">
                  from {formatValue(insight.comparison_value, insight.unit, currency, { compact: true })}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {insight.evidence.length > 0 ? (
              <Button variant="outline" size="sm" onClick={() => setEvidenceOpen(true)}>
                <Eye aria-hidden="true" />
                View evidence
                <span className="text-muted-foreground">({insight.evidence.length})</span>
              </Button>
            ) : null}
            {onInvestigate ? (
              <Button variant="ghost" size="sm" onClick={() => onInvestigate(insight)}>
                Investigate
              </Button>
            ) : null}
          </div>
        </div>
      </article>

      <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}>
        <DialogContent size="lg" className="max-h-[85dvh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{insight.title}</DialogTitle>
            <DialogDescription>{insight.summary}</DialogDescription>
          </DialogHeader>
          <div className="-mx-1 overflow-y-auto px-1">
            <h4 className="mb-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              Supporting figures
            </h4>
            <EvidenceList evidence={insight.evidence} currency={currency} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function InsightCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card p-4">
      <div className="shimmer size-8 shrink-0 rounded-md" />
      <div className="flex-1 space-y-2">
        <div className="shimmer h-4 w-2/3 rounded" />
        <div className="shimmer h-3 w-full rounded" />
        <div className="shimmer h-3 w-4/5 rounded" />
      </div>
    </div>
  );
}
