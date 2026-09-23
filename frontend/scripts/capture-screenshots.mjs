/**
 * Capture the screenshots used in the README and docs.
 *
 *   node scripts/capture-screenshots.mjs
 *
 * Requires both servers running. Opens a demo workspace, waits for the
 * analysis to finish, and captures each screen with real data in it — at
 * desktop, in the dark theme for the screens people judge a theme by, and at
 * 390px for the screens people actually open on a phone.
 *
 * Deliberately not a mockup generator: every figure in these images is one the
 * product produced from the included sample dataset, so a reader who runs the
 * demo sees the same numbers. Mocked screenshots of an application that exists
 * are a small dishonesty that costs more trust than they buy — particularly in
 * a product whose whole argument is that its figures are traceable.
 *
 * Answering a question, writing an investigation's explanation and generating
 * a report are each model calls. On a local model on a CPU that is minutes per
 * screen, which is why the waits here are generous; against a hosted provider
 * the whole run takes a few minutes. An answer lives only in the page's state,
 * so its dark and phone captures are taken from the same page — re-themed and
 * resized in place — rather than paying for the same answer three times.
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

/** The landing page's sections, captured on their own for the README. */
const LANDING_SECTIONS = ["features", "how-it-works", "evidence", "security"];

/**
 * Full-page capture repaints fixed and sticky elements wherever the viewport
 * happened to be, so the sidebar and top bar land in the middle of a long
 * screenshot looking like a rendering fault. Unpinning them for the duration
 * of the capture is a screenshot concern, not a product one — nothing here
 * changes what a user sees. The sidebar's wrapper is made its positioning
 * parent, so the unpinned sidebar runs the height of the page rather than
 * stopping one viewport down and leaving a bare strip beneath it.
 */
const UNPIN = `
  .capture-unpin div:has(> aside) { position: relative !important; }
  .capture-unpin [class*="fixed"], .capture-unpin aside { position: absolute !important; }
  .capture-unpin header[class*="sticky"], .capture-unpin [class*="sticky"] { position: static !important; }
`;

/**
 * The dev server's own build-status badge sits in the bottom-left corner and
 * is not part of the product. Hiding it here rather than switching
 * `devIndicators` off in next.config keeps a useful affordance for whoever is
 * actually developing.
 */
const HIDE_DEV_BADGE = "nextjs-portal { display: none !important; }";

async function settle(page) {
  // Let fonts settle and chart entry animations finish, or captures taken
  // moments apart differ for no reason anyone cares about.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.addStyleTag({ content: HIDE_DEV_BADGE }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function unpin(page, on) {
  if (on) await page.addStyleTag({ content: UNPIN }).catch(() => {});
  await page
    .evaluate((value) => document.documentElement.classList.toggle("capture-unpin", value), on)
    .catch(() => {});
}

/** Where an element starts, measured from the top of the page. */
async function pageTop(locator) {
  return locator.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
}

/**
 * `endBefore` stops a full-page capture above an element — the investigation's
 * evidence list is 29 rows long, which belongs on the page and not in a README.
 */
async function shoot(page, name, { fullPage = false, endBefore } = {}) {
  await settle(page);

  // A full page is captured by making the viewport as tall as the page, not
  // with Playwright's fullPage option. That option resizes the page at the
  // instant of capture; every chart re-measures, Recharts replays its entry
  // animation from zero, and the image shows axes around an empty plot.
  const viewport = page.viewportSize();
  let clip;
  if (fullPage) {
    await unpin(page, true);
    await page.evaluate(() => window.scrollTo(0, 0));
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: viewport.width, height });
    await page.waitForTimeout(2500);
    if (endBefore && (await endBefore.count())) {
      // Far enough above the heading to clear the padding of the card it opens.
      clip = {
        x: 0,
        y: 0,
        width: viewport.width,
        height: Math.round((await pageTop(endBefore.first())) - 48),
      };
    }
  }

  await page.screenshot({ path: join(OUT, `${name}.png`), ...(clip ? { clip } : {}) });

  if (fullPage) {
    await page.setViewportSize(viewport);
    await unpin(page, false);
  }
  console.log(`  ${name}.png`);
}

/**
 * One element on its own — a landing section — with a margin above it, since
 * some sections start flush with their own label.
 */
async function shootElement(page, selector, name, margin = 48) {
  const element = page.locator(selector).first();
  if (!(await element.count())) {
    console.log(`  (skipped ${name}: ${selector} not found)`);
    return;
  }
  await settle(page);
  // Unpinned so the sticky header does not sit over the top of the section.
  await unpin(page, true);
  await element.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  const top = Math.max(0, (await pageTop(element)) - margin);
  const { height } = await element.boundingBox();
  await page.screenshot({
    path: join(OUT, `${name}.png`),
    fullPage: true,
    clip: { x: 0, y: top, width: page.viewportSize().width, height: height + margin * 2 },
  });
  await unpin(page, false);
  console.log(`  ${name}.png`);
}

/** The heading of the investigation's evidence list, which the README captures stop above. */
const evidenceCard = (page) => page.getByRole("heading", { name: /^Evidence \(/ });

/** Re-theme the open page without reloading it, so its state survives. */
async function setDark(page, dark) {
  await page.evaluate((value) => document.documentElement.classList.toggle("dark", value), dark);
  await page.waitForTimeout(400);
}

/** A context with the demo session already in it. */
async function openContext(browser, viewport, { storageState, deviceScaleFactor = 2 } = {}) {
  return browser.newContext({
    viewport,
    // Readable when scaled down in a README.
    deviceScaleFactor,
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
    // The public pages are dark by design, whatever the visitor's theme.
    console.log("landing page");
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await shoot(page, "landing");

    console.log("landing page — its sections");
    for (const id of LANDING_SECTIONS) {
      await shootElement(page, `section#${id}`, `section-${id}`);
    }

    // At 1x: the whole page at 2x is a very tall image that a README scales
    // down to a thumbnail anyway, and it would be most of the folder's size.
    console.log("landing page — top to bottom");
    const full = await openContext(browser, DESKTOP, { deviceScaleFactor: 1 });
    const fullPage = await full.newPage();
    await fullPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await shoot(fullPage, "landing-full", { fullPage: true });
    await full.close();

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

    console.log("investigation (the explanation is a model call)");
    let investigationUrl;
    const investigate = page.getByRole("link", { name: /Investigate/i }).first();
    if (await investigate.count()) {
      await investigate.click();
      await page.waitForURL("**/anomalies/**", { timeout: 60_000 });
      investigationUrl = page.url();
      // The evidence renders first and the written explanation follows. Wait
      // for the prose, so the capture shows the finished page; once written it
      // is cached on the anomaly, so every later visit gets it immediately.
      await page
        .getByText(/What happened/i)
        .first()
        .waitFor({ timeout: 120_000 })
        .catch(() => {});
      await page
        .getByText(/Writing the explanation/i)
        .first()
        .waitFor({ state: "hidden", timeout: MODEL_TIMEOUT })
        .catch(() => console.log("  (explanation still pending; capturing as-is)"));
      await page.waitForTimeout(1500);
      await shoot(page, "investigation", { fullPage: true, endBefore: evidenceCard(page) });
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
    let answered = false;
    if (await question.count()) {
      await question.fill("Why did revenue decline last month?");
      await page.getByRole("button", { name: "Ask", exact: true }).click();
      answered = await page
        .getByText(/Confidence:/i)
        .first()
        .waitFor({ timeout: MODEL_TIMEOUT })
        .then(
          () => true,
          () => (console.log("  (no answer in time; capturing as-is)"), false),
        );
      await page.waitForTimeout(1500);
    }
    await shoot(page, "ask", { fullPage: true });

    if (answered) {
      // The same answer, on the same page: themed, then resized.
      console.log("ask insightflow — answer, dark");
      await setDark(page, true);
      await shoot(page, "ask-dark", { fullPage: true });
      await setDark(page, false);

      console.log("ask insightflow — answer, on a phone");
      await page.setViewportSize(MOBILE);
      await page.waitForTimeout(800);
      await shoot(page, "mobile-ask");
      await page.setViewportSize(DESKTOP);
    }

    console.log("reports");
    await page.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
    await shoot(page, "reports");

    const generate = page.getByRole("button", { name: /Generate/i }).first();
    if (await generate.count()) {
      console.log("report (model calls)");
      await generate.click();
      const summary = page.getByRole("heading", { name: /Executive summary/i }).first();
      const opened = await summary.waitFor({ timeout: MODEL_TIMEOUT }).then(
        () => true,
        () => false,
      );
      // Generating a report is meant to open it. When that navigation does not
      // happen the report still exists, so open it from the list rather than
      // capture the list and call it the report — and say so, because it is
      // the product failing to navigate, not the capture.
      if (!opened) {
        console.log("  (the report was generated but did not open; opening it from the list)");
        await page.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
        await page.locator('a[href^="/reports/"]').first().click();
        await summary.waitFor({ timeout: 60_000 }).catch(() => {});
      }
      await page.waitForTimeout(2000);
      await shoot(page, "report", { fullPage: true });
    }

    console.log("settings");
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
    await shoot(page, "settings");

    // ----------------------------------------------------------------- dark
    const session = await context.storageState();
    const dark = await browser.newContext({
      viewport: DESKTOP,
      deviceScaleFactor: 2,
      colorScheme: "dark",
      reducedMotion: "reduce",
      storageState: session,
    });
    const darkPage = await dark.newPage();

    console.log("dashboard — dark");
    await darkPage.goto(`${BASE}/overview`, { waitUntil: "networkidle" });
    await darkPage.waitForTimeout(2500);
    await shoot(darkPage, "overview-dark");

    console.log("insights — dark");
    await darkPage.goto(`${BASE}/insights`, { waitUntil: "networkidle" });
    await shoot(darkPage, "insights-dark");

    if (investigationUrl) {
      console.log("investigation — dark");
      await darkPage.goto(investigationUrl, { waitUntil: "networkidle" });
      await darkPage.getByText(/What happened/i).first().waitFor({ timeout: 120_000 }).catch(() => {});
      await darkPage.waitForTimeout(1500);
      await shoot(darkPage, "investigation-dark", { fullPage: true, endBefore: evidenceCard(darkPage) });
    }
    await dark.close();

    // --------------------------------------------------------------- mobile
    const mobile = await openContext(browser, MOBILE, { storageState: session });
    const mobilePage = await mobile.newPage();

    console.log("mobile dashboard");
    await mobilePage.goto(`${BASE}/overview`, { waitUntil: "networkidle" });
    await mobilePage.waitForTimeout(2500);
    await shoot(mobilePage, "mobile-overview");

    if (investigationUrl) {
      console.log("mobile investigation");
      await mobilePage.goto(investigationUrl, { waitUntil: "networkidle" });
      await mobilePage.getByText(/What happened/i).first().waitFor({ timeout: 120_000 }).catch(() => {});
      await mobilePage.waitForTimeout(1500);
      await shoot(mobilePage, "mobile-investigation");
    }

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
