"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Feeds the pointer position to every `.spotlight` card inside it.
 *
 * One listener on the group, not one per card, and it writes CSS variables
 * directly rather than through React state — a pointer move must never cause
 * a render. Touch devices have no hover, so the effect simply never shows.
 */
export function SpotlightGroup({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const onPointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const cards = event.currentTarget.querySelectorAll<HTMLElement>(".spotlight");
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      card.style.setProperty("--my", `${event.clientY - rect.top}px`);
    }
  }, []);

  return (
    <div className={cn(className)} onPointerMove={onPointerMove}>
      {children}
    </div>
  );
}
