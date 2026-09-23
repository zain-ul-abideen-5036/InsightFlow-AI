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

/**
 * The mark's geometry.
 *
 * Kept identical to `MARK_GEOMETRY` in `components/logo.tsx`. These are the
 * only two places the path exists, and both are checked by
 * `tests/brand.test.tsx`, which fails if they drift apart.
 */
const GEOMETRY = {
  corner: 9,
  rows: {
    top: "M7 10.5 H11.5 C15.2 10.5 16.2 16 19 16",
    centre: "M7 16 H19",
    bottom: "M7 21.5 H11.5 C15.2 21.5 16.2 16 19 16",
  },
  lineWidth: 2.3,
  datum: { cx: 23.6, cy: 16, r: 3, glow: 6.5, spark: 1 },
};

/**
 * The obsidian tile: many rows converging into one lit point.
 * `edge: false` drops the glass edge, for the iOS icon, which iOS masks itself.
 */
function mark({ edge = true, corner = GEOMETRY.corner } = {}) {
  const g = GEOMETRY;
  const d = g.datum;
  return `
<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tile" x1="16" y1="0" x2="16" y2="32" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1C2438"/><stop offset="1" stop-color="#080C16"/>
    </linearGradient>
    <linearGradient id="edge" x1="16" y1="0" x2="16" y2="32" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFFFFF" stop-opacity="0.28"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0.05"/>
    </linearGradient>
    <linearGradient id="outer" x1="7" y1="0" x2="19" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFFFFF" stop-opacity="0.32"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0.78"/>
    </linearGradient>
    <linearGradient id="centre" x1="7" y1="0" x2="19" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFFFFF" stop-opacity="0.6"/><stop offset="1" stop-color="#FFFFFF"/>
    </linearGradient>
    <radialGradient id="glow" cx="${d.cx}" cy="${d.cy}" r="${d.glow}" gradientUnits="userSpaceOnUse">
      <stop stop-color="#3B82F6" stop-opacity="0.75"/><stop offset="1" stop-color="#3B82F6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="32" height="32" rx="${corner}" fill="url(#tile)"/>
  ${edge ? `<rect x="0.5" y="0.5" width="31" height="31" rx="${corner - 0.5}" stroke="url(#edge)"/>` : ""}
  <circle cx="${d.cx}" cy="${d.cy}" r="${d.glow}" fill="url(#glow)"/>
  <path d="${g.rows.top}" stroke="url(#outer)" stroke-width="${g.lineWidth}" stroke-linecap="round"/>
  <path d="${g.rows.bottom}" stroke="url(#outer)" stroke-width="${g.lineWidth}" stroke-linecap="round"/>
  <path d="${g.rows.centre}" stroke="url(#centre)" stroke-width="${g.lineWidth}" stroke-linecap="round"/>
  <circle cx="${d.cx}" cy="${d.cy}" r="${d.r}" fill="#4C8DFF"/>
  <circle cx="${d.cx - 0.8}" cy="${d.cy - 0.8}" r="${d.spark}" fill="#FFFFFF" fill-opacity="0.9"/>
</svg>`;
}

const FONT_STACK = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

/**
 * The social card.
 *
 * Built from the same parts as the redesigned hero: the inverted brand
 * surface, the tagline as the display statement, and one real figure from the
 * sample analysis so the card carries a fact rather than an adjective.
 */
const ogCard = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; color: #fff; font-family: ${FONT_STACK};
    padding: 76px 80px; position: relative; overflow: hidden;
    background:
      radial-gradient(ellipse 60% 55% at 78% 8%, rgba(37,99,235,0.28), transparent 62%),
      radial-gradient(ellipse 50% 45% at 8% 96%, rgba(13,148,136,0.16), transparent 66%),
      #080C15;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px);
    background-size: 72px 72px;
    -webkit-mask-image: radial-gradient(ellipse 80% 70% at 50% 0%, #000 20%, transparent 75%);
  }
  .inner { position: relative; display: flex; flex-direction: column;
           justify-content: space-between; height: 100%; }
  .brand { display: flex; align-items: center; gap: 17px; }
  .brand svg { width: 56px; height: 56px; }
  .wordmark { font-size: 34px; font-weight: 640; letter-spacing: -0.025em; }
  .wordmark span { font-weight: 500; color: rgba(255,255,255,0.45); margin-left: 10px; }
  h1 { font-size: 72px; font-weight: 640; letter-spacing: -0.038em; line-height: 1.05; }
  h1 .muted { color: rgba(255,255,255,0.46); }
  p { margin-top: 28px; font-size: 26px; line-height: 1.5;
      color: rgba(255,255,255,0.62); max-width: 880px; }
  .foot { display: flex; align-items: center; gap: 14px; }
  .pill {
    font-size: 20px; padding: 11px 22px; border-radius: 999px; font-weight: 500;
    background: rgba(37,99,235,0.16); color: #9CC0FF;
    border: 1px solid rgba(147,180,253,0.22);
  }
  .fact { font-size: 20px; color: rgba(255,255,255,0.42); }
  .fact b { color: rgba(255,255,255,0.78); font-weight: 600; }
</style></head><body>
  <div class="grid"></div>
  <div class="inner">
    <div class="brand">${mark()}<div class="wordmark">InsightFlow<span>AI</span></div></div>
    <div>
      <h1>Understand your business.<br><span class="muted">Act on the data.</span></h1>
      <p>Upload your business data, see what changed, investigate why, and ask
         questions answered from your own figures.</p>
    </div>
    <div class="foot">
      <div class="pill">Evidence before explanation</div>
      <div class="fact">Every number computed, never generated &middot; <b>the AI explains, it does not calculate</b></div>
    </div>
  </div>
</body></html>`;

/**
 * The iOS home-screen icon.
 *
 * The tile bled square to the edges: iOS applies its own rounded mask, and a
 * pre-rounded tile inside that mask reads as a sticker.
 */
const appleIcon = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; }
  body { width: 180px; height: 180px; background: #080C16; }
  svg { width: 180px; height: 180px; display: block; }
</style></head><body>${mark({ edge: false, corner: 0 })}</body></html>`;

async function render(browser, html, { width, height, path }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
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
