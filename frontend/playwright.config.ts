import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end tests.
 *
 * These assume both servers are already running — the backend needs a Python
 * environment that Playwright should not be managing. Start them first:
 *
 *   cd backend && uvicorn app.main:app --port 8000
 *   cd frontend && npm run dev
 *
 * then `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // One worker: the tests create accounts against a shared backend, and the
  // auth rate limiter is per-IP.
  workers: 1,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
