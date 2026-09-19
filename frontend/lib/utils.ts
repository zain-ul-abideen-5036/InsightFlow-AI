import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Round half away from zero, on the decimal value rather than the binary one.
 *
 * `(13.85).toFixed(1)` returns "13.8", because the nearest double to 13.85 is
 * 13.84999999999999964. A user who is told their revenue fell 13.85% and sees
 * "13.8%" reasonably concludes the product cannot round. Re-parsing through
 * exponential notation shifts the decimal point exactly, so 13.85 becomes 138.5
 * — which *is* exactly representable — and rounds to 139.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const shifted = Number(`${Math.abs(value)}e${decimals}`);
  if (!Number.isFinite(shifted)) return value;
  return sign * Number(`${Math.round(shifted)}e-${decimals}`);
}

/**
 * Format a figure the way a business owner reads it.
 *
 * Large currency amounts drop their decimals: on a dashboard, "USD 224,076" is
 * easier to scan than "USD 224,075.84", and the exact value is always available
 * in the evidence panel.
 */
export function formatValue(
  value: number | null | undefined,
  unit: string = "number",
  currency = "USD",
  options: { compact?: boolean; precise?: boolean } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";

  const { compact = false, precise = false } = options;

  switch (unit) {
    case "currency":
      return formatCurrency(value, currency, { compact, precise });
    case "percent": {
      const decimals = precise ? 2 : 1;
      return `${roundTo(value, decimals).toFixed(decimals)}%`;
    }
    case "count":
      return formatNumber(value, { compact, decimals: 0 });
    case "days":
      return `${formatNumber(value, { decimals: 0 })} ${Math.abs(value) === 1 ? "day" : "days"}`;
    case "ratio":
      return value.toFixed(2);
    default:
      return formatNumber(value, { compact, decimals: precise ? 2 : undefined });
  }
}

export function formatCurrency(
  value: number,
  currency = "USD",
  { compact = false, precise = false }: { compact?: boolean; precise?: boolean } = {},
): string {
  const magnitude = Math.abs(value);
  // Below 1000 the cents carry real information; above it they are noise.
  const decimals = precise ? 2 : magnitude < 1000 && magnitude > 0 ? 2 : 0;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: compact && magnitude >= 10_000 ? "compact" : "standard",
      minimumFractionDigits: compact && magnitude >= 10_000 ? 0 : decimals,
      maximumFractionDigits: compact && magnitude >= 10_000 ? 1 : decimals,
    }).format(value);
  } catch {
    // An unrecognised ISO code must not break the page.
    return `${currency} ${formatNumber(value, { compact, decimals })}`;
  }
}

export function formatNumber(
  value: number,
  { compact = false, decimals }: { compact?: boolean; decimals?: number } = {},
): string {
  const magnitude = Math.abs(value);
  const resolved =
    decimals ?? (Number.isInteger(value) ? 0 : magnitude < 10 ? 2 : magnitude < 1000 ? 1 : 0);

  return new Intl.NumberFormat("en-US", {
    notation: compact && magnitude >= 10_000 ? "compact" : "standard",
    minimumFractionDigits: compact && magnitude >= 10_000 ? 0 : resolved,
    maximumFractionDigits: compact && magnitude >= 10_000 ? 1 : resolved,
  }).format(value);
}

/** A signed percentage, e.g. "+18.4%". */
export function formatChange(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const rounded = roundTo(value, decimals);
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(decimals)}%`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(value: string | Date | null | undefined, withTime = false): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

/**
 * Parse a timestamp from the API.
 *
 * A timestamp with no zone designator is UTC — that is what the API stores and
 * sends. `new Date("2026-09-19T21:21:40")` disagrees: the ECMAScript spec says
 * a date-time form without an offset is *local* time. For a viewer five hours
 * from UTC, that turns "a moment ago" into "five hours ago", silently and with
 * nothing on screen to suggest the figure is wrong.
 *
 * The backend now always sends an offset. This stays as a second line of
 * defence, because the failure it prevents is invisible.
 */
function parseTimestamp(value: string | Date): Date {
  if (value instanceof Date) return value;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
  return new Date(hasZone ? value : `${value}Z`);
}

/** Thresholds, each with the unit that applies *below* it. */
const RELATIVE_DIVISIONS: [seconds: number, unit: Intl.RelativeTimeFormatUnit][] = [
  [60, "second"],
  [3600, "minute"],
  [86400, "hour"],
  [604800, "day"],
  [2629800, "week"], // an average month, so "4 weeks" does not become "1 month" early
  [31557600, "month"],
];

const UNIT_SECONDS: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2629800,
  year: 31557600,
};

export function formatRelativeTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = parseTimestamp(value);
  if (Number.isNaN(date.getTime())) return "—";

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (Math.abs(seconds) < 60) return "just now";

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const magnitude = Math.abs(seconds);

  // Each threshold is paired with the unit for values *under* it. Pairing a
  // threshold with the unit named beside it is the off-by-one that rendered
  // five hours as "5 days ago".
  for (const [limit, unit] of RELATIVE_DIVISIONS) {
    if (magnitude < limit) {
      return formatter.format(-Math.round(seconds / UNIT_SECONDS[unit]!), unit);
    }
  }
  return formatter.format(-Math.round(seconds / UNIT_SECONDS.year!), "year");
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

/** Truncate for display without cutting mid-word where avoidable. */
export function truncate(text: string, length = 80): string {
  if (text.length <= length) return text;
  const slice = text.slice(0, length);
  const lastSpace = slice.lastIndexOf(" ");
  return `${lastSpace > length * 0.6 ? slice.slice(0, lastSpace) : slice}…`;
}

export function initials(name: string, email?: string): string {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITY_ORDER)[number];

export function severityRank(severity: string): number {
  const index = SEVERITY_ORDER.indexOf(severity as Severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}

/**
 * Whether a movement is good news.
 *
 * Cost and discount invert the usual reading: falling cost is good. Returning
 * `null` means "no value judgement", which the UI renders in neutral grey
 * rather than guessing.
 */
export function isFavourable(metricKey: string, change: number | null): boolean | null {
  if (change === null || change === undefined || Math.abs(change) < 0.5) return null;
  const lowerIsBetter = new Set(["cost", "total_discount", "avg_discount"]);
  return lowerIsBetter.has(metricKey) ? change < 0 : change > 0;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
