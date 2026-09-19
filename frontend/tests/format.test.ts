import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatBytes,
  formatChange,
  formatCurrency,
  formatDuration,
  formatNumber,
  formatRelativeTime,
  formatValue,
  initials,
  isFavourable,
  severityRank,
  truncate,
} from "@/lib/utils";

/**
 * Formatting is the last step between a computed figure and the user's eyes.
 * A bug here turns a correct analysis into a wrong-looking one, so it gets the
 * same treatment as the analytics maths.
 */

describe("formatValue", () => {
  it("renders currency without cents above 1000", () => {
    expect(formatValue(224075.84, "currency", "USD")).toBe("$224,076");
  });

  it("keeps cents below 1000, where they carry information", () => {
    expect(formatValue(196.97, "currency", "USD")).toBe("$196.97");
  });

  it("renders percentages to one decimal", () => {
    expect(formatValue(13.85, "percent")).toBe("13.9%");
  });

  it("renders counts without decimals", () => {
    expect(formatValue(1712, "count")).toBe("1,712");
  });

  it("pluralises days", () => {
    expect(formatValue(1, "days")).toBe("1 day");
    expect(formatValue(7, "days")).toBe("7 days");
  });

  it("shows an em dash for missing values rather than zero", () => {
    // Zero and "not measured" are different facts and must not look the same.
    expect(formatValue(null, "currency")).toBe("—");
    expect(formatValue(undefined, "count")).toBe("—");
    expect(formatValue(Number.NaN, "number")).toBe("—");
    expect(formatValue(0, "currency", "USD")).toBe("$0");
  });

  it("falls back gracefully on an unknown currency code", () => {
    expect(formatValue(1500, "currency", "XYZ")).toContain("1,500");
  });
});

describe("formatCurrency", () => {
  it("compacts large figures for dashboards", () => {
    expect(formatCurrency(224075.84, "USD", { compact: true })).toBe("$224.1K");
  });

  it("does not compact small figures", () => {
    expect(formatCurrency(842, "USD", { compact: true })).toBe("$842.00");
  });

  it("keeps full precision when asked", () => {
    expect(formatCurrency(224075.84, "USD", { precise: true })).toBe("$224,075.84");
  });

  it("handles negatives", () => {
    expect(formatCurrency(-19193, "USD")).toBe("-$19,193");
  });
});

describe("formatNumber", () => {
  it("formats integers without decimals", () => {
    expect(formatNumber(14261)).toBe("14,261");
  });

  it("compacts above ten thousand", () => {
    expect(formatNumber(14261, { compact: true })).toBe("14.3K");
  });
});

describe("formatChange", () => {
  it("signs positive changes explicitly", () => {
    expect(formatChange(20)).toBe("+20.0%");
  });

  it("signs negative changes", () => {
    expect(formatChange(-13.85)).toBe("-13.9%");
  });

  it("returns an em dash when there is no comparison", () => {
    expect(formatChange(null)).toBe("—");
  });
});

describe("isFavourable", () => {
  it("treats rising revenue as good news", () => {
    expect(isFavourable("revenue", 20)).toBe(true);
  });

  it("treats falling revenue as bad news", () => {
    expect(isFavourable("revenue", -20)).toBe(false);
  });

  it("inverts the reading for cost", () => {
    // Falling cost is good; colouring it red would be actively misleading.
    expect(isFavourable("cost", -20)).toBe(true);
    expect(isFavourable("cost", 20)).toBe(false);
  });

  it("inverts the reading for discounts", () => {
    expect(isFavourable("total_discount", -15)).toBe(true);
  });

  it("makes no judgement on a negligible movement", () => {
    expect(isFavourable("revenue", 0.2)).toBeNull();
    expect(isFavourable("revenue", null)).toBeNull();
  });
});

describe("severityRank", () => {
  it("orders severities from most to least urgent", () => {
    const sorted = ["info", "critical", "low", "high", "medium"].sort(
      (a, b) => severityRank(a) - severityRank(b),
    );
    expect(sorted).toEqual(["critical", "high", "medium", "low", "info"]);
  });

  it("sorts unknown severities last", () => {
    expect(severityRank("nonsense")).toBeGreaterThan(severityRank("info"));
  });
});

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("formatDuration", () => {
  it("uses milliseconds under a second", () => {
    expect(formatDuration(450)).toBe("450 ms");
  });

  it("uses seconds under a minute", () => {
    expect(formatDuration(1618)).toBe("1.6s");
  });

  it("uses minutes and seconds beyond that", () => {
    expect(formatDuration(95_000)).toBe("1m 35s");
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("Nova Air Purifier", 30)).toBe("Nova Air Purifier");
  });

  it("breaks on a word boundary where it can", () => {
    const result = truncate("Nova Air Purifier Replacement Filter Pack", 20);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(21);
    expect(result).not.toContain("Replacemen…");
  });
});

describe("initials", () => {
  it("uses first and last name", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
  });

  it("falls back to the email local part", () => {
    expect(initials("", "zain.abideen@example.com")).toBe("ZA");
  });

  it("never returns an empty string", () => {
    expect(initials("")).toBe("?");
  });
});

describe("formatRelativeTime", () => {
  const NOW = new Date("2026-09-20T12:00:00Z");

  afterEach(() => {
    vi.useRealTimers();
  });

  function at(iso: string) {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    return formatRelativeTime(iso);
  }

  it("says 'just now' inside a minute", () => {
    expect(at("2026-09-20T11:59:30Z")).toBe("just now");
  });

  /**
   * The bug this pins: each threshold was paired with the unit named beside it
   * rather than the unit that applies below it, so every value was reported one
   * unit too large. An analysis that finished five hours ago read "5 days ago",
   * on a dashboard whose entire purpose is to be trusted about time.
   */
  it.each([
    ["2026-09-20T11:58:00Z", "2 minutes ago"],
    ["2026-09-20T11:15:00Z", "45 minutes ago"],
    ["2026-09-20T09:00:00Z", "3 hours ago"],
    ["2026-09-20T07:00:00Z", "5 hours ago"],
    ["2026-09-18T12:00:00Z", "2 days ago"],
    ["2026-09-06T12:00:00Z", "2 weeks ago"],
    ["2026-06-20T12:00:00Z", "3 months ago"],
    ["2024-09-20T12:00:00Z", "2 years ago"],
  ])("renders %s as %s", (iso, expected) => {
    expect(at(iso)).toBe(expected);
  });

  /**
   * A timestamp with no zone designator is UTC, because that is what the API
   * sends. The ECMAScript spec reads that same string as *local* time, so a
   * viewer five hours from UTC would see every timestamp five hours out with
   * nothing on screen to suggest it was wrong.
   */
  it("treats a timestamp without an offset as UTC", () => {
    expect(at("2026-09-20T09:00:00")).toBe("3 hours ago");
    expect(at("2026-09-20T09:00:00.123456")).toBe("3 hours ago");
  });

  it("respects an explicit offset", () => {
    expect(at("2026-09-20T14:00:00+05:00")).toBe("3 hours ago");
  });

  it("handles a future timestamp without inverting the sign", () => {
    expect(at("2026-09-20T15:00:00Z")).toBe("in 3 hours");
  });

  it("returns a dash for nothing", () => {
    expect(formatRelativeTime(null)).toBe("—");
    expect(formatRelativeTime(undefined)).toBe("—");
    expect(formatRelativeTime("not a date")).toBe("—");
  });
});
