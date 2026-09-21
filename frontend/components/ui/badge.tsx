import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badges.
 *
 * Two things are enforced here rather than left to call sites.
 *
 * **Casing.** Severity arrived from the API lowercase (`critical`) and was
 * rendered raw on the anomalies list while the insights list title-cased the
 * same word. `sentence` capitalises the first letter so the same vocabulary
 * reads the same way everywhere, whatever the backend sends.
 *
 * **Weight.** A badge that is as loud as the finding it labels is noise. The
 * subtle fills are the default; `solid` exists for the rare case where a badge
 * *is* the finding.
 */
const badgeVariants = cva(
  "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-md border " +
    "px-1.5 py-0.5 text-2xs font-medium transition-colors [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-info-border/60 bg-info-subtle text-info",
        neutral: "border-border bg-muted text-muted-foreground",
        outline: "border-border bg-transparent text-muted-foreground",
        success: "border-success-border/60 bg-success-subtle text-success",
        warning: "border-warning-border/60 bg-warning-subtle text-warning",
        danger: "border-danger-border/60 bg-danger-subtle text-danger",
        info: "border-info-border/60 bg-info-subtle text-info",
        solid: "border-transparent bg-foreground text-background",
        "solid-danger": "border-transparent bg-danger text-danger-foreground",
        /** Legible on an inverted section. */
        "on-inverse":
          "border-inverse-border bg-inverse-foreground/10 text-inverse-foreground",
      },
      size: {
        sm: "px-1.5 py-0.5 text-2xs",
        default: "px-2 py-0.5 text-2xs",
        lg: "rounded-lg px-2.5 py-1 text-xs",
      },
      /**
       * Capitalise API-sourced vocabulary.
       *
       * `capitalize` rather than `first-letter:uppercase` because ::first-letter
       * only applies to block containers and a badge is an inline-flex box, so
       * the pseudo-element never matched and the rule did nothing. That limits
       * this to single-token vocabulary — severities, statuses, kinds — which
       * is the whole of what it is for.
       */
      sentence: { true: "capitalize", false: "" },
    },
    defaultVariants: { variant: "neutral", size: "default", sentence: false },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, sentence, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size, sentence }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
