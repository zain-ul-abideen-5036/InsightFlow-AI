import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * "This analysis is not possible" notice.
 *
 * Distinct from an error: nothing went wrong, the data simply does not support
 * this calculation. Showing a zero or a blank chart instead would imply a
 * finding that was never made.
 */
export function Unavailable({
  title,
  reason,
  required,
  className,
}: {
  title: string;
  reason: string;
  required?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3.5",
        className,
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{reason}</p>
        {required ? (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Needed:</span> {required}
          </p>
        ) : null}
      </div>
    </div>
  );
}
