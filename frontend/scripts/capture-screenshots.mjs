/**
 * Capture the screenshots used in the README and docs.
 *
 *   node scripts/capture-screenshots.mjs
 *
 * Requires both servers running. Opens a demo workspace, waits for the
 * analysis to finish, and captures each screen with real data in it — at
 * desktop, and at 390px for the two screens people actually open on a phone.
 *
 * Deliberately not a mockup generator: every figure in these images is one the
 * product produced from the included sample dataset, so a reader who runs the
 * demo sees the same numbers. Mocked screenshots of an application that exists
 * are a small dishonesty that costs more trust than they buy — particularly in
 * a product whose whole argument is that its figures are traceable.
 *
 * Answering a question and generating a report are each two model calls. On a
 * local model on a CPU that is minutes per screen, which is why the waits here
 * are generous; against a hosted provider the whole run takes about a minute.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "..", "docs", "screenshots");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const ANALYSIS_TIMEOUT = 300_000;
/** Two model calls on a CPU. Measured at ~250s; this leaves headroom. */
const MODEL_TIMEOUT = 600_000;

/**
 * Full-page capture repaints fixed and sticky elements wherever the viewport
 * happened to be, so the sidebar and top bar land in the middle of a long
 * screenshot looking like a rendering fault. Unpinning them for the duration
 * of the capture is a screenshot concern, not a product one — nothing here
 * changes what a user sees.
 */
const UNPIN = `
  .capture-unpin [class*="fixed"], .capture-unpin aside { position: absolute !important; }
  .capture-unpin header[class*="sticky"], .capture-unpin [class*="sticky"] { position: static !important; }
`;

async function shoot(page, name, { fullPage = false } = {}) {
  // Let fonts settle and chart entry animations finish, or captures taken
  // moments apart differ for no reason anyone cares about.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);

  if (fullPage) {
    await page.addStyleTag({ content: UNPIN }).catch(() => {});
    await page.evaluate(() => document.documentElement.classList.add("capture-unpin"));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(350);
  }

  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });

  if (fullPage) {
    await page
      .evaluate(() => document.documentElement.classList.remove("capture-unpin"))
      .catch(() => {});
  }
  console.log(`  ${name}.png`);
}

/** A context with the demo session already in it. */
async function openContext(browser, viewport, storageState) {
  return browser.newContext({
    viewport,
    // Readable when scaled down in a README.
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "reduce",
    isMobile: viewport.width < 500,
    hasTouch: viewport.width < 500,
    ...(storageState ? { storageState } : {}),
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await openContext(browser, DESKTOP);
  const page = await context.newPage();

  try {
    // ------------------------------------------------------------ marketing
    console.log("landing page");
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await shoot(page, "landing");

    console.log("sign in");
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await shoot(page, "login");

    // ----------------------------------------------------------- onboarding
    // Captured from a real signup, because the onboarding screen only exists
    // for a workspace that has never had data in it.
    console.log("onboarding");
    const fresh = await openContext(browser, DESKTOP);
    const freshPage = await fresh.newPage();
    try {
      await freshPage.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
      await freshPage.getByLabel("Business name").fill("Northwind Supply");
      await freshPage
        .getByLabel("Email address")
        .fill(`shots-${Date.now()}@example.com`);
      await freshPage.getByLabel("Password").fill("CorrectHorse42!");
      await freshPage.getByRole("button", { name: "Create account" }).click();
      await freshPage.waitForURL("**/onboarding", { timeout: 60_000 });
      await shoot(freshPage, "onboarding");

      console.log("dataset upload");
      await freshPage.goto(`${BASE}/datasets/new`, { waitUntil: "networkidle" });
      await shoot(freshPage, "upload");
    } catch (error) {
      console.log(`  (skipped: ${String(error).split("\n")[0]})`);
    } finally {
      await fresh.close();
    }

    // ----------------------------------------------------------------- demo
    console.log("opening a demo workspace");
    await page.goto(`${BASE}/demo`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/overview", { timeout: 180_000 });

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
    await shoot(page, "overview", { fullPage: true });

    console.log("insights");
    await page.goto(`${BASE}/insights`, { waitUntil: "networkidle" });
    await shoot(page, "insights", { fullPage: true });

    console.log("anomalies");
    await page.goto(`${BASE}/anomalies`, { waitUntil: "networkidle" });
    await shoot(page, "anomalies");

    console.log("investigation");
    const investigate = page.getByRole("link", { name: /Investigate/i }).first();
    if (await investigate.count()) {
      await investigate.click();
      // The deterministic investigation renders immediately; the written
      // narrative arrives separately. Wait for the evidence, not the prose.
      await page
        .getByText(/What happened/i)
        .first()
        .waitFor({ timeout: 120_000 })
        .catch(() => {});
      await page.waitForTimeout(2000);
      await shoot(page, "investigation", { fullPage: true });
    } else {
      console.log("  (no anomaly to investigate)");
    }

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

    console.log("ask insightflow — entry screen");
    await page.goto(`${BASE}/ask`, { waitUntil: "networkidle" });
    await shoot(page, "ask-empty");

    console.log("ask insightflow — answer (two model calls; this is the slow one)");
    const question = page.getByLabel("Your question");
    if (await question.count()) {
      await question.fill("Why did revenue decline last month?");
      await page.getByRole("button", { name: "Ask", exact: true }).click();
      await page
        .getByText(/Confidence:/i)
        .first()
        .waitFor({ timeout: MODEL_TIMEOUT })
        .catch(() => console.log("  (no answer in time; capturing as-is)"));
      await page.waitForTimeout(1500);
    }
    await shoot(page, "ask", { fullPage: true });

    console.log("reports");
    await page.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
    await shoot(page, "reports");

    const generate = page.getByRole("button", { name: /Generate/i }).first();
    if (await generate.count()) {
      await generate.click();
      await page
        .getByRole("heading", { name: /Executive summary/i })
        .first()
        .waitFor({ timeout: MODEL_TIMEOUT })
        .catch(() => {});
      await page.waitForTimeout(2000);
      await shoot(page, "report", { fullPage: true });
    }

    console.log("settings");
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
    await shoot(page, "settings");

    console.log("dashboard — dark");
    const dark = await browser.newContext({
      viewport: DESKTOP,
      deviceScaleFactor: 2,
      colorScheme: "dark",
      reducedMotion: "reduce",
      storageState: await context.storageState(),
    });
    const darkPage = await dark.newPage();
    await darkPage.goto(`${BASE}/overview`, { waitUntil: "networkidle" });
    await darkPage.waitForTimeout(2500);
    await shoot(darkPage, "overview-dark");
    await dark.close();

    // --------------------------------------------------------------- mobile
    const session = await context.storageState();
    const mobile = await openContext(browser, MOBILE, session);
    const mobilePage = await mobile.newPage();

    console.log("mobile dashboard");
    await mobilePage.goto(`${BASE}/overview`, { waitUntil: "networkidle" });
    await mobilePage.waitForTimeout(2500);
    await shoot(mobilePage, "mobile-overview");

    console.log("mobile ask");
    await mobilePage.goto(`${BASE}/ask`, { waitUntil: "networkidle" });
    await shoot(mobilePage, "mobile-ask");

    console.log("mobile navigation");
    await mobilePage.goto(`${BASE}/overview`, { waitUntil: "networkidle" });
    const menu = mobilePage.getByRole("button", { name: /Open navigation/i });
    if (await menu.count()) {
      await menu.click();
      await mobilePage.waitForTimeout(700);
      await shoot(mobilePage, "mobile-navigation");
    }

    console.log("mobile landing");
    await mobilePage.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await shoot(mobilePage, "mobile-landing");

    await mobile.close();

    console.log(`\ndone — written to ${OUT}`);
  } finally {
    await browser.close();
  }
}

await main();
