import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { cn, formatChange, isFavourable } from "@/lib/utils";

/**
 * A signed change, shown once, consistently.
 *
 * Six screens rendered this by hand and no two agreed on the arrow, the
 * colour rule, or whether a near-flat movement counted as a direction.
 *
 * Three rules, enforced here:
 *
 * 1. **Direction survives without colour.** There is always an arrow and
 *    always a sign (WCAG 1.4.1).
 * 2. **Colour reflects whether the movement is good news, not whether it is
 *    up.** Falling cost is green. `isFavourable` owns that judgement and
 *    returns `null` where there is none to make, which renders neutral rather
 *    than guessing.
 * 3. **Under half a percent is flat.** A horizontal arrow, no colour. Calling
 *    a 0.2% drift a decline is noise dressed as a finding.
 */
export function Delta({
  value,
  metricKey = "",
  comparisonLabel,
  size = "default",
  variant = "text",
  className,
}: {
  value: number | null | undefined;
  /** Drives the good-news rule; omit for a plain up-is-green reading. */
  metricKey?: string;
  /** "vs Jul 2026" — rendered as a quiet suffix. */
  comparisonLabel?: string;
  size?: "sm" | "default" | "lg";
  /** `pill` gives it a tinted background, for use against a busy surface. */
  variant?: "text" | "pill";
  className?: string;
}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return (
      <span className={cn("text-2xs text-subtle-foreground", className)}>
        No comparison period available
      </span>
    );
  }

  const flat = Math.abs(value) < 0.5;
  const favourable = isFavourable(metricKey, value);
  const Icon = flat ? ArrowRight : value > 0 ? ArrowUpRight : ArrowDownRight;

  const tone =
    favourable === null
      ? { text: "text-muted-foreground", pill: "bg-muted text-muted-foreground" }
      : favourable
        ? { text: "text-success", pill: "bg-success-subtle text-success" }
        : { text: "text-danger", pill: "bg-danger-subtle text-danger" };

  const sizing = {
    sm: { text: "text-2xs", icon: "size-3", pad: "px-1 py-px" },
    default: { text: "text-xs", icon: "size-3.5", pad: "px-1.5 py-0.5" },
    lg: { text: "text-sm", icon: "size-4", pad: "px-2 py-0.5" },
  }[size];

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-semibold",
          sizing.text,
          variant === "pill" ? cn("rounded-md", sizing.pad, tone.pill) : tone.text,
        )}
      >
        <Icon className={sizing.icon} aria-hidden="true" />
        <span className="tabular">{formatChange(value)}</span>
      </span>
      {comparisonLabel ? (
        <span className="text-2xs text-subtle-foreground">vs {comparisonLabel}</span>
      ) : null}
    </span>
  );
}
