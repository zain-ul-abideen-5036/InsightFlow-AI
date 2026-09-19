"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Error state.
 *
 * Shows the human-readable message the API produced plus its hint. Raw status
 * codes and stack traces are never surfaced: the person reading this is a
 * business owner, and "500 Internal Server Error" tells them nothing they can
 * act on.
 */
export function ErrorState({
  title = "We could not load this",
  message,
  hint,
  onRetry,
  className,
  compact = false,
}: {
  title?: string;
  message: string;
  hint?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-danger/25",
        "bg-danger-subtle/50 text-center",
        compact ? "px-5 py-6" : "px-6 py-12",
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-md font-semibold">{title}</h3>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{message}</p>
        {hint ? <p className="mx-auto max-w-md text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
