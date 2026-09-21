import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Logo, LogoMark, MARK_GEOMETRY } from "@/components/logo";

const root = join(__dirname, "..");
const read = (relative: string) => readFileSync(join(root, relative), "utf8");

/**
 * The mark exists in three places that cannot import each other: the React
 * component, the static favicon Next.js serves by file convention, and the
 * script that renders the social card and the iOS icon.
 *
 * Nothing stops those three drifting apart, and the failure is silent — the
 * favicon quietly becomes a different logo from the one in the product. These
 * tests are the thing that stops it.
 */
describe("the mark", () => {
  it("is drawn from the same geometry in the favicon as in the component", () => {
    const favicon = read("app/icon.svg");
    expect(favicon).toContain(MARK_GEOMETRY.line);
    expect(favicon).toContain(`rx="${MARK_GEOMETRY.corner}"`);
    expect(favicon).toContain(`stroke-width="${MARK_GEOMETRY.lineWidth}"`);
    expect(favicon).toContain(`r="${MARK_GEOMETRY.datum.r}"`);
    expect(favicon).toContain(`r="${MARK_GEOMETRY.datum.knockout}"`);
  });

  it("is drawn from the same geometry in the brand asset generator", () => {
    const generator = read("scripts/generate-brand-assets.mjs");
    expect(generator).toContain(MARK_GEOMETRY.line);
    expect(generator).toContain(String(MARK_GEOMETRY.corner));
    expect(generator).toContain(String(MARK_GEOMETRY.lineWidth));
  });

  /**
   * The bug this replaces: the container was filled with `currentColor` and
   * the glyph hard-coded to white, so in the sidebar — where `currentColor`
   * resolves to a near-white foreground in dark mode — the mark rendered as a
   * white square with invisible white contents on every authenticated screen.
   */
  it("never paints its container with currentColor", () => {
    const source = read("components/logo.tsx");
    expect(source).not.toMatch(/fill=["{]?["']?currentColor/);
  });

  it("gives the container and the glyph different colours in every tone", () => {
    const { container } = render(
      <>
        <LogoMark tone="ink" data-testid="ink" />
        <LogoMark tone="paper" data-testid="paper" />
      </>,
    );
    const marks = container.querySelectorAll("svg");
    expect(marks).toHaveLength(2);

    for (const mark of Array.from(marks)) {
      const box = mark.querySelector("rect")?.getAttribute("fill");
      const line = mark.querySelector("path")?.getAttribute("stroke");
      expect(box).toBeTruthy();
      expect(line).toBeTruthy();
      expect(box).not.toEqual(line);
    }
  });
});

describe("the lock-up", () => {
  it("names the product once when the wordmark is shown", () => {
    render(<Logo />);
    // The mark is decorative beside its own wordmark; announcing both would
    // read the product name twice.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("InsightFlow")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("names the product when the mark stands alone", () => {
    render(<Logo showWordmark={false} />);
    expect(screen.getByRole("img", { name: "InsightFlow AI" })).toBeInTheDocument();
  });
});
