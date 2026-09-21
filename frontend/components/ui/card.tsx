import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The card.
 *
 * Previously there was exactly one treatment — a white box with a 1px border
 * and a shadow below the threshold of visibility — and it was used for the KPI
 * row, the chart frame, an insight, a settings panel, a marketing feature tile
 * and a FAQ entry alike. Nothing advanced and nothing receded, so the eye had
 * no entry point on any screen.
 *
 * `elevation` now says how much a card wants to come forward, and `tone` says
 * what kind of thing it is. Both are deliberately short lists: the point is to
 * make the choice once, here, rather than re-improvise it with utility classes
 * on every instance.
 */
const cardVariants = cva("relative rounded-xl text-card-foreground", {
  variants: {
    elevation: {
      /** Sits flat on the canvas. For dense lists and nested panels. */
      flat: "border border-border bg-card",
      /** The default. A card on a page. */
      raised: "border border-border bg-card shadow-e1",
      /** Asks for attention: the primary chart, the headline finding. */
      prominent: "border border-border bg-card shadow-e2",
      /** Recessed. For a well inside another card. */
      sunken: "border border-border/70 bg-surface-sunken",
      /** No chrome at all — grouping only. */
      none: "",
    },
    tone: {
      default: "",
      /** Carries real weight: the closing CTA, the trust argument. */
      inverse: "border-inverse-border bg-inverse text-inverse-foreground",
      accent: "border-info-border bg-info-subtle",
      success: "border-success-border bg-success-subtle",
      warning: "border-warning-border bg-warning-subtle",
      danger: "border-danger-border bg-danger-subtle",
    },
    interactive: {
      true:
        "transition-[box-shadow,border-color,transform] duration-base ease-out " +
        "hover:-translate-y-px hover:border-border-strong hover:shadow-e2 " +
        "focus-within:border-border-strong",
      false: "",
    },
  },
  defaultVariants: { elevation: "raised", tone: "default", interactive: false },
});

export interface CardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "color">,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevation, tone, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ elevation, tone, interactive }), className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

/**
 * Header.
 *
 * `p-5 pb-3` is the one card rhythm. `compact` exists for cards inside a
 * narrow column, where the full padding costs more than it buys.
 */
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { compact?: boolean }
>(({ className, compact = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col gap-1",
      compact ? "p-4 pb-2.5" : "p-5 pb-3.5",
      className,
    )}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" | "h4" }
>(({ className, as: Tag = "h3", ...props }, ref) => (
  <Tag
    ref={ref}
    className={cn("text-base font-semibold leading-snug tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm leading-relaxed text-muted-foreground", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { compact?: boolean }
>(({ className, compact = false, ...props }, ref) => (
  <div ref={ref} className={cn(compact ? "p-4 pt-0" : "p-5 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-wrap items-center gap-2 border-t border-border bg-surface-sunken/50 px-5 py-3 " +
          "rounded-b-xl",
        className,
      )}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  cardVariants,
};
