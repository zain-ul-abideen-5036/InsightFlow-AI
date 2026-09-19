import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Empty state.
 *
 * Every empty area must answer three questions: what this is, why it matters,
 * and what to do next. "No data" answers none of them, so `description` and an
 * action are part of the contract rather than optional decoration.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border",
        "bg-surface text-center",
        compact ? "gap-2 px-5 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      {Icon ? (
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-muted text-muted-foreground",
            compact ? "size-8" : "size-11",
          )}
        >
          <Icon className={compact ? "size-4" : "size-5"} aria-hidden="true" />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <h3 className={cn("font-semibold", compact ? "text-sm" : "text-md")}>{title}</h3>
        <p
          className={cn(
            "mx-auto text-muted-foreground",
            compact ? "max-w-sm text-xs" : "max-w-md text-sm",
          )}
        >
          {description}
        </p>
      </div>

      {action || secondaryAction ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
