/**
 * Capture the screenshots used in the README and docs.
 *
 *   node scripts/capture-screenshots.mjs
 *
 * Requires both servers running. Opens a demo workspace, waits for the analysis
 * to finish, and captures each screen with real data in it.
 *
 * Deliberately not a mockup generator: every figure in these images is one the
 * product produced from the included sample dataset, so a reader who runs the
 * demo sees the same numbers. Mocked screenshots of an application that exists
 * are a small dishonesty that costs more trust than they buy.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "..", "docs", "screenshots");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const VIEWPORT = { width: 1440, height: 900 };
const ANALYSIS_TIMEOUT = 180_000;

async function shoot(page, name, { fullPage = false } = {}) {
  // Let fonts settle and chart entry animations finish, or captures taken
  // moments apart differ for no reason anyone cares about.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage });
  console.log(`  ${name}.png`);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, // readable when scaled down in a README
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  try {
    console.log("landing page");
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await shoot(page, "landing");

    console.log("opening a demo workspace");
    await page.goto(`${BASE}/demo`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/overview", { timeout: 120_000 });

    console.log("waiting for the analysis to finish");
    await page
      .getByText(/Analysis complete/i)
      .first()
      .waitFor({ timeout: ANALYSIS_TIMEOUT })
      .catch(() => console.log("  (no completion banner; continuing)"));
    // The dashboard polls; give it a beat to swap in the finished results.
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    console.log("dashboard");
    await shoot(page, "overview");

    console.log("datasets");
    await page.goto(`${BASE}/datasets`, { waitUntil: "networkidle" });
    await shoot(page, "datasets");

    console.log("detected fields");
    const openDataset = page.getByRole("link", { name: /NovaMart/i }).first();
    if (await openDataset.count()) {
      await openDataset.click();
      await page.waitForTimeout(1500);
      const fieldsTab = page.getByRole("tab", { name: /fields/i }).first();
      if (await fieldsTab.count()) await fieldsTab.click();
      await shoot(page, "fields");
    }

    console.log("insights");
    await page.goto(`${BASE}/insights`, { waitUntil: "networkidle" });
    await shoot(page, "insights");

    console.log("investigation");
    await page.goto(`${BASE}/anomalies`, { waitUntil: "networkidle" });
    const investigate = page.getByRole("link", { name: /Investigate/i }).first();
    if (await investigate.count()) {
      await investigate.click();
      // The deterministic investigation renders immediately; the written
      // narrative arrives separately. Wait for the evidence, not the prose.
      await page
        .getByText(/What happened/i)
        .first()
        .waitFor({ timeout: 60_000 })
        .catch(() => {});
      await page.waitForTimeout(2000);
      await shoot(page, "investigation", { fullPage: true });
    } else {
      console.log("  (no anomaly to investigate)");
    }

    console.log("ask insightflow");
    await page.goto(`${BASE}/ask`, { waitUntil: "networkidle" });
    const question = page.getByLabel("Your question");
    if (await question.count()) {
      await question.fill("Why did revenue decline last month?");
      await page.getByRole("button", { name: "Ask", exact: true }).click();
      await page
        .getByText(/Confidence:/i)
        .first()
        .waitFor({ timeout: 300_000 })
        .catch(() => console.log("  (no answer in time; capturing as-is)"));
      await page.waitForTimeout(1500);
    }
    await shoot(page, "ask", { fullPage: true });

    console.log("report");
    await page.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
    const generate = page.getByRole("button", { name: /Generate/i }).first();
    if (await generate.count()) {
      await generate.click();
      await page
        .getByRole("heading", { name: /Executive summary/i })
        .first()
        .waitFor({ timeout: 300_000 })
        .catch(() => {});
      await page.waitForTimeout(2000);
    }
    await shoot(page, "report", { fullPage: true });

    console.log(`\ndone — written to ${OUT}`);
  } finally {
    await browser.close();
  }
}

await main();
