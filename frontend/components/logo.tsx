import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The InsightFlow mark.
 *
 * Many rows converging into one point.
 *
 * Three lines enter from the left — the rows of a spreadsheet — and bend
 * together into a single bright datum: the verified finding the whole product
 * exists to produce. The centre row runs straight and brightest; the outer
 * rows are quieter and curve in to meet it. That is the product's argument in
 * one shape: the engine reduces the file to a figure you can trust.
 *
 * It is made of the same materials as the site: an obsidian tile lit from
 * above with a fine glass edge, rows in white that strengthen as they
 * converge, and blue used only as light — the datum glows, nothing else is
 * coloured. A dark tile reads on the dark marketing pages and stands out on
 * the light application chrome, so it needs no theme-dependent inversion.
 *
 * ---
 *
 * **Why the container is never `currentColor`.** An earlier mark filled its
 * container with `currentColor` and hard-coded the glyph to white; in the
 * dark sidebar that rendered a white square with invisible contents. Every
 * tone below gives the container and the glyph explicitly different paints.
 */

type MarkTone = "auto" | "brand" | "ink" | "paper";

type Paint = {
  /** Container fill: a solid colour, or null for the obsidian gradient. */
  box: string | null;
  /** Row colour; the rows fade in from the left with this as their end. */
  row: string;
  /** The datum's core and the glow around it. */
  datum: string;
  glow: string;
  /** Glass edge opacity at the top and bottom of the tile. */
  edge: [number, number];
  edgeColor: string;
};

const OBSIDIAN: Paint = {
  box: null,
  row: "#FFFFFF",
  datum: "#4C8DFF",
  glow: "#3B82F6",
  edge: [0.28, 0.05],
  edgeColor: "#FFFFFF",
};

const TONES: Record<MarkTone, Paint> = {
  // `auto` is the obsidian tile: it reads on every surface, so it no longer
  // needs to follow the theme.
  auto: OBSIDIAN,
  brand: OBSIDIAN,
  ink: { ...OBSIDIAN, box: "#0B1220" },
  // For placing the mark on a dark or coloured plate of someone else's.
  paper: {
    box: "#FFFFFF",
    row: "#0B1220",
    datum: "#2563EB",
    glow: "#3B82F6",
    edge: [0.1, 0.06],
    edgeColor: "#0B1220",
  },
};

/** The obsidian tile's gradient stops, top to bottom. */
export const MARK_GRADIENT = { from: "#1C2438", to: "#080C16" } as const;

/**
 * The mark's geometry, on a 32-unit grid.
 *
 * Held in one constant so the favicon, the iOS icon and the social card are
 * drawn from the same shapes as the component. `tests/brand.test.tsx` fails
 * if any of them drifts.
 */
export const MARK_GEOMETRY = {
  viewBox: "0 0 32 32",
  corner: 9,
  rows: {
    top: "M7 10.5 H11.5 C15.2 10.5 16.2 16 19 16",
    centre: "M7 16 H19",
    bottom: "M7 21.5 H11.5 C15.2 21.5 16.2 16 19 16",
  },
  lineWidth: 2.3,
  datum: { cx: 23.6, cy: 16, r: 3, glow: 6.5, spark: 1 },
} as const;

export function LogoMark({
  tone = "auto",
  title,
  className,
  ...props
}: React.SVGProps<SVGSVGElement> & { tone?: MarkTone; title?: string }) {
  const paint = TONES[tone];
  const g = MARK_GEOMETRY;
  const d = g.datum;
  // Several marks can share a page, so every gradient needs its own id.
  const id = `if-mark-${React.useId().replace(/:/g, "")}`;

  return (
    <svg
      viewBox={g.viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      // A mark next to its own wordmark is decorative; a mark standing alone
      // is the product's name and needs to be announced.
      {...(title ? { role: "img" } : { "aria-hidden": true })}
      className={cn("size-8 shrink-0", className)}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={`${id}-tile`} x1="16" y1="0" x2="16" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor={MARK_GRADIENT.from} />
          <stop offset="1" stopColor={MARK_GRADIENT.to} />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="16" y1="0" x2="16" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor={paint.edgeColor} stopOpacity={paint.edge[0]} />
          <stop offset="1" stopColor={paint.edgeColor} stopOpacity={paint.edge[1]} />
        </linearGradient>
        {/* The rows strengthen as they converge: data resolving into a finding. */}
        <linearGradient id={`${id}-outer`} x1="7" y1="0" x2="19" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor={paint.row} stopOpacity="0.32" />
          <stop offset="1" stopColor={paint.row} stopOpacity="0.78" />
        </linearGradient>
        <linearGradient id={`${id}-centre`} x1="7" y1="0" x2="19" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor={paint.row} stopOpacity="0.6" />
          <stop offset="1" stopColor={paint.row} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx={d.cx} cy={d.cy} r={d.glow} gradientUnits="userSpaceOnUse">
          <stop stopColor={paint.glow} stopOpacity="0.75" />
          <stop offset="1" stopColor={paint.glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx={g.corner} fill={paint.box ?? `url(#${id}-tile)`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx={g.corner - 0.5} stroke={`url(#${id}-edge)`} />
      <circle cx={d.cx} cy={d.cy} r={d.glow} fill={`url(#${id}-glow)`} />
      {/* Outer rows first, so the centre row is drawn over the point where
          they meet. */}
      <path d={g.rows.top} stroke={`url(#${id}-outer)`} strokeWidth={g.lineWidth} strokeLinecap="round" />
      <path d={g.rows.bottom} stroke={`url(#${id}-outer)`} strokeWidth={g.lineWidth} strokeLinecap="round" />
      <path d={g.rows.centre} stroke={`url(#${id}-centre)`} strokeWidth={g.lineWidth} strokeLinecap="round" />
      <circle cx={d.cx} cy={d.cy} r={d.r} fill={paint.datum} />
      {/* A catch-light on the datum, so it reads as a lit point, not a dot. */}
      <circle cx={d.cx - 0.8} cy={d.cy - 0.8} r={d.spark} fill="#FFFFFF" fillOpacity="0.9" />
    </svg>
  );
}

const MARK_SIZE = { xs: "size-5", sm: "size-6", default: "size-7", lg: "size-9" };
const TEXT_SIZE = {
  xs: "text-[13.5px]",
  sm: "text-[15px]",
  default: "text-[17px]",
  lg: "text-[21px]",
};
const GAP = { xs: "gap-1.5", sm: "gap-2", default: "gap-2.5", lg: "gap-3" };

/**
 * The full lock-up.
 *
 * `InsightFlow` is set in the display face at 600 with tight tracking, so the
 * wordmark belongs to the same family as the headlines. `AI` is a suffix, not
 * part of the name: lighter, quieter, and separated by a little more than a
 * word space.
 */
export function Logo({
  className,
  showWordmark = true,
  size = "default",
  tone = "auto",
}: {
  className?: string;
  showWordmark?: boolean;
  size?: "xs" | "sm" | "default" | "lg";
  tone?: MarkTone;
}) {
  return (
    <span className={cn("inline-flex items-center", GAP[size], className)}>
      <LogoMark
        tone={tone}
        className={MARK_SIZE[size]}
        title={showWordmark ? undefined : "InsightFlow AI"}
      />
      {showWordmark ? (
        <span
          className={cn(
            "font-display font-semibold leading-none tracking-[-0.03em] text-foreground",
            TEXT_SIZE[size],
          )}
        >
          InsightFlow
          <span className="ml-[0.28em] font-medium tracking-normal text-muted-foreground/70">
            AI
          </span>
        </span>
      ) : null}
    </span>
  );
}
