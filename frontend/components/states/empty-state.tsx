import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Empty state.
 *
 * Every empty area must answer three questions: what this is, why it matters,
 * and what to do next. "No data" answers none of them, so `description` and an
 * action are part of the contract rather than optional decoration.
 *
 * **The dashed border is gone.** It appeared on the dashboard, Ask, insights,
 * anomalies and reports, and on all five it read as an unimplemented
 * placeholder rather than as a considered state — the single strongest
 * "unfinished" signal in the product. What replaces it is a real composition:
 * a solid recessed surface, an icon given enough weight to be a graphic rather
 * than a leftover glyph, and a measured text column.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  footnote,
  className,
  compact = false,
  align = "center",
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  /** A quiet line under the actions: a caveat, a hint, a shortcut. */
  footnote?: React.ReactNode;
  className?: string;
  compact?: boolean;
  /** Left-align inside a narrow column, where centring reads as ragged. */
  align?: "center" | "start";
}) {
  const centred = align === "center";

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-border bg-surface-sunken/60",
        centred ? "items-center text-center" : "items-start text-left",
        compact ? "gap-2.5 px-5 py-7" : "gap-3.5 px-6 py-12",
        className,
      )}
    >
      {Icon ? (
        <div
          className={cn(
            "relative flex items-center justify-center rounded-xl",
            "border border-border bg-card text-muted-foreground shadow-e1",
            compact ? "size-9" : "size-12",
          )}
        >
          <Icon className={compact ? "size-4" : "size-5"} aria-hidden="true" />
        </div>
      ) : null}

      <div className={cn("space-y-1.5", centred && "flex flex-col items-center")}>
        <h3 className={cn("font-semibold tracking-tight", compact ? "text-base" : "text-lg")}>
          {title}
        </h3>
        <p
          className={cn(
            "leading-relaxed text-muted-foreground",
            compact ? "max-w-sm text-sm" : "max-w-prose text-base",
          )}
        >
          {description}
        </p>
      </div>

      {action || secondaryAction ? (
        <div
          className={cn(
            "mt-1 flex flex-wrap items-center gap-2.5",
            centred && "justify-center",
          )}
        >
          {action}
          {secondaryAction}
        </div>
      ) : null}

      {footnote ? (
        <p className="text-xs leading-relaxed text-subtle-foreground">{footnote}</p>
      ) : null}
    </div>
  );
}
