"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  Database,
  Eye,
  MapPin,
  Package,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Delta } from "@/components/ui/delta";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EvidenceList } from "@/features/insights/evidence-panel";
import { cn, formatValue } from "@/lib/utils";
import type { Insight, Severity } from "@/types/api";

/**
 * How loudly each severity is allowed to speak.
 *
 * Eleven of fourteen insights on a typical dataset are critical or high, and
 * the previous treatment gave all five severities the same silhouette: a
 * coloured rail, a coloured icon chip, a badge. A page of fourteen identical
 * red cards tells a business owner nothing except that something is wrong
 * everywhere, which is both alarming and false.
 *
 * `rail` now carries the weight, the chip is tinted only where it earns it,
 * and low/info drop the badge entirely — their severity is legible from the
 * absence of emphasis, which is how severity is supposed to work.
 */
const SEVERITY_STYLE: Record<
  Severity,
  {
    badge: "danger" | "warning" | "info" | "neutral";
    label: string;
    rail: string;
    chip: string;
    showBadge: boolean;
  }
> = {
  critical: {
    badge: "danger",
    label: "Critical",
    rail: "bg-danger",
    chip: "bg-danger-subtle text-danger ring-danger-border/50",
    showBadge: true,
  },
  high: {
    badge: "danger",
    label: "High",
    rail: "bg-danger/55",
    chip: "bg-danger-subtle/70 text-danger ring-danger-border/40",
    showBadge: true,
  },
  medium: {
    badge: "warning",
    label: "Medium",
    rail: "bg-warning/70",
    chip: "bg-warning-subtle text-warning ring-warning-border/40",
    showBadge: true,
  },
  low: {
    badge: "neutral",
    label: "Low",
    rail: "bg-border-strong",
    chip: "bg-muted text-muted-foreground ring-border",
    showBadge: false,
  },
  info: {
    badge: "neutral",
    label: "Info",
    rail: "bg-border",
    chip: "bg-muted text-muted-foreground ring-border",
    showBadge: false,
  },
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
  investigateHref,
  compact = false,
  featured = false,
}: {
  insight: Insight;
  currency?: string;
  onDismiss?: (id: string) => void;
  onInvestigate?: (insight: Insight) => void;
  /** Link form of the investigate action, for server-rendered lists. */
  investigateHref?: string;
  compact?: boolean;
  /** The single most important finding on the page, given real prominence. */
  featured?: boolean;
}) {
  const [evidenceOpen, setEvidenceOpen] = React.useState(false);
  const severity = SEVERITY_STYLE[insight.severity] ?? SEVERITY_STYLE.info;
  const Icon = KIND_ICON[insight.kind] ?? TrendingUp;

  const hasFigure = insight.metric_value !== null && insight.metric_value !== undefined;

  return (
    <>
      <article
        className={cn(
          "group relative flex gap-3 overflow-hidden rounded-xl border border-border bg-card",
          "transition-[box-shadow,border-color] duration-base ease-out",
          featured ? "p-5 shadow-e2" : "shadow-e1 hover:border-border-strong hover:shadow-e2",
          !featured && (compact ? "p-3.5" : "p-4"),
        )}
      >
        {/* Severity is carried by a label and an icon too — never colour alone. */}
        <span
          className={cn("absolute inset-y-0 left-0 w-[3px]", severity.rail)}
          aria-hidden="true"
        />

        <div
          className={cn(
            "mt-0.5 flex shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            severity.chip,
            featured ? "size-10" : "size-8",
          )}
        >
          <Icon className={featured ? "size-5" : "size-4"} aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <h3
              className={cn(
                "font-semibold leading-snug tracking-tight text-balance",
                featured ? "text-xl" : "text-base",
              )}
            >
              {insight.title}
            </h3>
            <div className="flex shrink-0 items-center gap-1.5">
              {severity.showBadge ? (
                <Badge variant={severity.badge}>{severity.label}</Badge>
              ) : null}
              {onDismiss ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => onDismiss(insight.id)}
                  aria-label={`Dismiss insight: ${insight.title}`}
                >
                  <X aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </div>

          <p
            className={cn(
              "leading-relaxed text-muted-foreground text-pretty",
              featured ? "text-base" : "text-sm",
            )}
          >
            {insight.summary}
          </p>

          {insight.narrative ? (
            <p className="rounded-lg border border-border bg-surface-sunken px-3.5 py-2.5 text-sm leading-relaxed">
              {insight.narrative}
            </p>
          ) : null}

          {hasFigure ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className={cn(
                  "tabular font-semibold",
                  featured ? "text-metric-sm" : "text-base",
                )}
              >
                {formatValue(insight.metric_value, insight.unit, currency, { compact: true })}
              </span>
              {insight.change_pct !== null && insight.change_pct !== undefined ? (
                <Delta value={insight.change_pct} metricKey={insight.metric_key ?? ""} />
              ) : null}
              {insight.comparison_value !== null &&
              insight.comparison_value !== undefined ? (
                <span className="text-xs text-subtle-foreground">
                  from{" "}
                  <span className="tabular">
                    {formatValue(insight.comparison_value, insight.unit, currency, {
                      compact: true,
                    })}
                  </span>
                </span>
              ) : null}
            </div>
          ) : null}

          {insight.evidence.length > 0 || onInvestigate || investigateHref ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {insight.evidence.length > 0 ? (
                <Button variant="outline" size="sm" onClick={() => setEvidenceOpen(true)}>
                  <Eye aria-hidden="true" />
                  View evidence
                  <span className="text-subtle-foreground">({insight.evidence.length})</span>
                </Button>
              ) : null}
              {investigateHref ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link href={investigateHref}>
                    <Search aria-hidden="true" />
                    Investigate
                  </Link>
                </Button>
              ) : onInvestigate ? (
                <Button variant="ghost" size="sm" onClick={() => onInvestigate(insight)}>
                  <Search aria-hidden="true" />
                  Investigate
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </article>

      <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}>
        <DialogContent size="lg" className="max-h-[85dvh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{insight.title}</DialogTitle>
            <DialogDescription>{insight.summary}</DialogDescription>
          </DialogHeader>
          <div className="-mx-1 overflow-y-auto px-1">
            <h4 className="eyebrow mb-2.5">Supporting figures</h4>
            <EvidenceList evidence={insight.evidence} currency={currency} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function InsightCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card p-4">
      <div className="shimmer size-8 shrink-0 rounded-lg" />
      <div className="flex-1 space-y-2">
        <div className="shimmer h-4 w-2/3" />
        <div className="shimmer h-3 w-full" />
        <div className="shimmer h-3 w-4/5" />
      </div>
    </div>
  );
}
