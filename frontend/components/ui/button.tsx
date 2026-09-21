"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Buttons.
 *
 * Focus ring, disabled state, and icon sizing are shared by every variant so
 * they can never drift apart.
 *
 * The press feedback is a scale rather than a downward translate: a 1px shift
 * moves the label off the pixel grid and makes the text shimmer, which reads
 * as a rendering glitch at the exact moment the user is looking hardest at it.
 */
const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap " +
    "rounded-lg font-medium " +
    "transition-[background-color,border-color,color,box-shadow,transform,opacity] " +
    "duration-fast ease-out " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 " +
    "active:scale-[0.985] [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** The one action a screen most wants you to take. */
        default:
          "bg-primary text-primary-foreground shadow-e1 hover:bg-primary-hover " +
          "active:bg-primary-active",
        /** Ink, for a second high-emphasis action on a light surface. */
        inverse:
          "bg-inverse text-inverse-foreground shadow-e1 hover:bg-inverse/90 " +
          "active:bg-inverse/95",
        secondary:
          "border border-border bg-secondary text-secondary-foreground hover:bg-accent " +
          "hover:border-border-strong",
        outline:
          "border border-border bg-card text-foreground shadow-e0 hover:bg-accent " +
          "hover:border-border-strong",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        danger:
          "bg-danger text-danger-foreground shadow-e1 hover:brightness-[1.08] " +
          "active:brightness-95",
        subtle: "bg-muted text-foreground hover:bg-accent",
        /** On an inverted section, where none of the above have contrast. */
        "on-inverse":
          "bg-inverse-foreground text-inverse shadow-e1 hover:bg-inverse-foreground/90",
        "on-inverse-outline":
          "border border-inverse-border bg-transparent text-inverse-foreground " +
          "hover:bg-inverse-foreground/10 hover:border-inverse-foreground/40",
      },
      size: {
        xs: "h-7 gap-1.5 px-2.5 text-2xs [&_svg]:size-3.5",
        sm: "h-8 px-3 text-xs [&_svg]:size-3.5",
        default: "h-9 px-3.5 text-sm [&_svg]:size-4",
        lg: "h-11 px-5 text-base [&_svg]:size-4",
        xl: "h-12 px-6 text-md [&_svg]:size-[18px]",
        icon: "h-9 w-9 [&_svg]:size-4",
        "icon-sm": "h-8 w-8 [&_svg]:size-4",
        "icon-xs": "h-7 w-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  /** Replaces the label while loading so the button width stays stable. */
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    // Slot forwards to an arbitrary child and requires exactly one, so the
    // spinner is only injected when we own the markup.
    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
        {loading && loadingText ? <span>{loadingText}</span> : children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
