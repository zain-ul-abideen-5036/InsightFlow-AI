/**
 * Renders the brand's raster assets from one HTML source of truth.
 *
 *   node scripts/generate-brand-assets.mjs
 *
 * Why a script and committed PNGs rather than `next/og` generating them at
 * request time: `@vercel/og` fails to resolve its own font path on Windows when
 * the project directory contains a space, which takes the whole production
 * build down. A social preview image does not change between deploys, so
 * paying for it once here — and committing the result — removes a build-time
 * dependency and a platform-specific failure for something entirely static.
 *
 * Re-run this after changing the logo, wordmark, or tagline.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const MARK = `
<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="7" y="18" width="3.5" height="7" rx="1.25" fill="white" fill-opacity="0.55"/>
  <rect x="14.25" y="13" width="3.5" height="12" rx="1.25" fill="white" fill-opacity="0.78"/>
  <rect x="21.5" y="8" width="3.5" height="17" rx="1.25" fill="white"/>
  <path d="M6 14.5C9.5 14.5 10.5 9 15 9C19.5 9 20 5.5 26 5.5" stroke="white"
        stroke-width="2" stroke-linecap="round" stroke-opacity="0.9"/>
</svg>`;

const FONT_STACK =
  `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

const ogCard = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; background: #0B0F19; color: #fff;
    font-family: ${FONT_STACK}; padding: 72px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .brand { display: flex; align-items: center; gap: 18px; }
  .brand svg { width: 60px; height: 60px; background: #2563EB; border-radius: 15px; }
  .wordmark { font-size: 36px; font-weight: 600; letter-spacing: -0.02em; }
  .wordmark span { font-weight: 400; color: #9CA3AF; margin-left: 8px; }
  h1 { font-size: 68px; font-weight: 600; letter-spacing: -0.035em; line-height: 1.08; }
  h1 .muted { color: #9CA3AF; }
  p { margin-top: 26px; font-size: 27px; line-height: 1.45; color: #9CA3AF; max-width: 940px; }
  .pill {
    align-self: flex-start; font-size: 21px; padding: 10px 22px; border-radius: 999px;
    background: rgba(37, 99, 235, 0.18); color: #93B4FD;
  }
</style></head><body>
  <div class="brand">${MARK}<div class="wordmark">InsightFlow<span>AI</span></div></div>
  <div>
    <h1>Understand your business.<br><span class="muted">Act on the data.</span></h1>
    <p>An AI business operations analyst. Every figure computed, every claim traceable.</p>
  </div>
  <div class="pill">Evidence before explanation</div>
</body></html>`;

const appleIcon = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; }
  body {
    width: 180px; height: 180px; background: #111827;
    display: flex; align-items: center; justify-content: center;
  }
  svg { width: 128px; height: 128px; }
</style></head><body>${MARK}</body></html>`;

async function render(browser, html, { width, height, path }) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: "load" });
  const buffer = await page.screenshot({ type: "png" });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
  await page.close();
  console.log(`wrote ${path} (${width}x${height}, ${buffer.length} bytes)`);
}

const browser = await chromium.launch();
try {
  await render(browser, ogCard, {
    width: 1200,
    height: 630,
    path: join(root, "app", "opengraph-image.png"),
  });
  await render(browser, appleIcon, {
    width: 180,
    height: 180,
    path: join(root, "app", "apple-icon.png"),
  });
} finally {
  await browser.close();
}
