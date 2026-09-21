"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Shown as a quiet suffix — usually how many results the option yields. */
  count?: number;
  disabled?: boolean;
}

/**
 * A small set of mutually exclusive choices.
 *
 * Used for the dashboard's metric switcher and the insight severity filter.
 * Both were `<select>` elements, which hide the range of what is available
 * behind a click — on a filter, that means you cannot see the shape of your
 * own results until after you have narrowed them.
 *
 * Implemented as a radiogroup rather than tabs: these select *what is shown*,
 * they do not switch between panels. Arrow keys move and select in one step,
 * which is the expected behaviour for a radiogroup and matches how someone
 * flicks between Revenue and Orders.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "default",
  className,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. Required: a bare set of chips is unlabelled. */
  label: string;
  size?: "sm" | "default";
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, delta: number) => {
    const enabled = options
      .map((option, index) => ({ option, index }))
      .filter(({ option }) => !option.disabled);
    if (enabled.length === 0) return;
    const position = enabled.findIndex(({ index }) => index === from);
    const next = enabled[(position + delta + enabled.length) % enabled.length]!;
    onChange(next.option.value);
    refs.current[next.index]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 rounded-lg border border-border",
        "bg-surface-sunken p-0.5",
        // Five metric names do not fit across a phone. Scrolling the group is
        // the honest answer: wrapping made "Average order value" three lines
        // tall and pushed "Profit" off the edge of the card entirely.
        "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            // Only the selected option is in the tab order; arrows move within.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                move(index, 1);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                move(index, -1);
              }
            }}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md font-medium",
              "transition-[background-color,color,box-shadow] duration-fast ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:pointer-events-none disabled:opacity-40",
              size === "sm" ? "h-7 px-2.5 text-2xs" : "h-8 px-3 text-xs",
              selected
                ? "bg-card text-foreground shadow-e1"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {typeof option.count === "number" ? (
              <span
                className={cn(
                  "tabular text-2xs tracking-normal",
                  selected ? "text-muted-foreground" : "text-subtle-foreground",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
