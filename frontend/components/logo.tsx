import { cn } from "@/lib/utils";

/**
 * The InsightFlow mark.
 *
 * A quiet signal resolving into one bright point.
 *
 * The line is the data — understated, four moves, a dip and a recovery, drawn
 * at half opacity because in this product the data is the input, not the
 * output. The point is the finding: the single verified datum the whole
 * product exists to produce. It is the only saturated element in the mark, it
 * is knocked out of the line rather than sitting on top of it, and it is what
 * the eye lands on at any size. That is the product's argument in two shapes.
 *
 * ---
 *
 * **Why it is drawn this way and not with `currentColor`.**
 *
 * The previous mark filled its container with `currentColor` and drew the
 * glyph in hard-coded white. In the sidebar `currentColor` resolves to the
 * foreground, which in dark mode is near-white — so the mark rendered as a
 * white square with invisible white contents on every authenticated screen.
 *
 * The container and the glyph are therefore separate, theme-aware values:
 *
 * - **ink** (default) — dark container, light glyph. For light surfaces.
 * - **paper** — light container, dark glyph. For dark or coloured surfaces.
 * - **auto** — follows the active theme via CSS custom properties, which is
 *   what almost every caller wants and what `Logo` uses.
 *
 * There is no `currentColor` variant, because a two-tone mark cannot have one.
 */

type MarkTone = "auto" | "ink" | "paper" | "brand";

/** Container fill, glyph stroke, and datum fill for each tone. */
const TONES: Record<MarkTone, { box: string; line: string; datum: string }> = {
  // `auto` reads tokens defined in globals.css, so it flips with the theme.
  auto: {
    box: "hsl(var(--logo-box))",
    line: "hsl(var(--logo-line))",
    datum: "hsl(var(--logo-datum))",
  },
  ink: { box: "#0B1220", line: "#FFFFFF", datum: "#3B82F6" },
  paper: { box: "#FFFFFF", line: "#0B1220", datum: "#2563EB" },
  brand: { box: "#2563EB", line: "#FFFFFF", datum: "#FFFFFF" },
};

/**
 * The four moves of the signal line, and where its point lands.
 *
 * Held in constants so the favicon, the OG image and the app icon are drawn
 * from the same geometry as the component rather than from a copy of it that
 * quietly drifts.
 */
export const MARK_GEOMETRY = {
  viewBox: "0 0 32 32",
  corner: 8.6,
  line: "M6.8 21.9 L12.5 16.2 L16.3 20 L20.9 13",
  lineWidth: 2.7,
  datum: { cx: 23, cy: 10, r: 3.1, knockout: 5.5 },
} as const;

export function LogoMark({
  tone = "auto",
  title,
  className,
  ...props
}: React.SVGProps<SVGSVGElement> & { tone?: MarkTone; title?: string }) {
  const { box, line, datum } = TONES[tone];
  const g = MARK_GEOMETRY;

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
      <rect width="32" height="32" rx={g.corner} fill={box} />
      <path
        d={g.line}
        stroke={line}
        strokeOpacity="0.5"
        strokeWidth={g.lineWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The datum is knocked out of the line, not drawn over it: the finding
          interrupts the data rather than decorating it. */}
      <circle cx={g.datum.cx} cy={g.datum.cy} r={g.datum.knockout} fill={box} />
      <circle cx={g.datum.cx} cy={g.datum.cy} r={g.datum.r} fill={datum} />
    </svg>
  );
}

const MARK_SIZE = { xs: "size-5", sm: "size-6", default: "size-7", lg: "size-9" };
const TEXT_SIZE = {
  xs: "text-[13px]",
  sm: "text-[14.5px]",
  default: "text-[16px]",
  lg: "text-xl",
};
const GAP = { xs: "gap-1.5", sm: "gap-2", default: "gap-2.5", lg: "gap-3" };

/**
 * The full lock-up.
 *
 * `InsightFlow` is set at 640 weight with tight optical tracking; `AI` is a
 * suffix, not part of the name, so it is lighter, quieter, and separated by a
 * little more than a word space. Baselines are aligned by the flex row rather
 * than by eye.
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
            "font-semibold leading-none tracking-[-0.022em] text-foreground",
            TEXT_SIZE[size],
          )}
        >
          InsightFlow
          <span className="ml-[0.3em] font-medium tracking-normal text-muted-foreground/75">
            AI
          </span>
        </span>
      ) : null}
    </span>
  );
}
