import { expect, test, type Page } from "@playwright/test";

/**
 * The journey a real user takes, in a real browser.
 *
 * The API-level equivalent lives in `backend/scripts/acceptance_check.py`.
 * These tests exist to catch what that cannot: focus management, keyboard
 * access, responsive layout, and whether the thing actually renders.
 */

const PASSWORD = "CorrectHorse42!";

/**
 * Our own error banners.
 *
 * Next.js renders a permanently-present `role="alert"` route announcer, so a
 * bare `getByRole("alert")` matches two elements on every page.
 */
function errorBanner(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
}

async function signUp(page: Page): Promise<string> {
  const email = uniqueEmail();
  await page.goto("/signup");
  await page.getByLabel("Business name").fill("E2E Retail");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/onboarding", { timeout: 30_000 });
  return email;
}

async function loadSampleAndAnalyse(page: Page) {
  await page.getByRole("button", { name: /Continue/i }).click();
  await expect(page.getByRole("heading", { name: "Add your data" })).toBeVisible();

  await page.getByRole("button", { name: /Use sample data/i }).click();
  await expect(page.getByRole("button", { name: /Review detected fields/i })).toBeVisible({
    timeout: 60_000,
  });

  await page.getByRole("button", { name: /Review detected fields/i }).click();
  await page.getByRole("button", { name: /Confirm fields and analyse/i }).click();

  await expect(page.locator("#main").getByText(/Analysis complete/i)).toBeVisible({
    timeout: 90_000,
  });
}

test.describe("landing page", () => {
  test("presents the product and routes to signup", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/InsightFlow AI/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Understand your business",
    );

    await page.getByRole("link", { name: /Analyze your data/i }).click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test("makes no unverified compliance claims", async ({ page }) => {
    await page.goto("/");
    const body = (await page.textContent("body")) ?? "";
    expect(body).not.toMatch(/SOC 2 certified/i);
    expect(body).not.toMatch(/GDPR compliant/i);
    // It states plainly what it does *not* hold.
    expect(body).toMatch(/does not hold SOC 2/i);
  });

  test("the first tab stop is a skip link", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /Skip to content/i })).toBeFocused();
  });
});

test.describe("authentication", () => {
  test("rejects wrong credentials with a readable message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill("nobody@example.com");
    await page.getByLabel("Password").fill("WrongPassword99!");
    await page.getByRole("button", { name: "Sign in" }).click();

    const alert = errorBanner(page);
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/incorrect/i);
  });

  test("signed-out users are redirected to login with their destination kept", async ({
    page,
  }) => {
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/login/);
    await expect(page).toHaveURL(/next=/);
  });
});

test.describe("full journey", () => {
  test("signup through analysis, insights, question, and report", async ({ page }) => {
    test.slow();

    await signUp(page);
    await expect(
      page.getByRole("heading", { name: /understand your business/i }),
    ).toBeVisible();

    await loadSampleAndAnalyse(page);

    // --- dashboard ------------------------------------------------------
    await page.getByRole("link", { name: "View dashboard" }).click();
    await page.waitForURL("**/overview");

    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
    await expect(page.getByText("Revenue").first()).toBeVisible();
    await expect(page.getByText(/Revenue (fell|rose)/i).first()).toBeVisible();
    // The headline figure must be traceable, not just present.
    await expect(
      page.getByRole("button", { name: /How Revenue is calculated/i }).first(),
    ).toBeVisible();

    // --- insights and evidence ------------------------------------------
    await page.getByRole("link", { name: "Insights" }).click();
    await page.waitForURL("**/insights");
    await expect(page.getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: /View evidence/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The trust feature: every claim traces back to a calculation.
    await expect(dialog.getByText(/Supporting figures/i)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    // --- anomalies and investigation ------------------------------------
    await page.getByRole("link", { name: "Anomalies" }).click();
    await page.waitForURL("**/anomalies");
    await expect(page.getByRole("heading", { name: "Anomalies", level: 1 })).toBeVisible();

    const investigate = page.getByRole("link", { name: /Investigate/i }).first();
    if (await investigate.isVisible()) {
      await investigate.click();
      await expect(page.getByRole("heading", { name: "Investigation" })).toBeVisible();
      await expect(page.getByText(/What happened/i).first()).toBeVisible({
        timeout: 90_000,
      });
      await expect(page.getByText(/Confidence:/i).first()).toBeVisible();
    }

    // --- ask --------------------------------------------------------------
    await page.getByRole("link", { name: "Ask InsightFlow" }).click();
    await page.waitForURL("**/ask");
    await page.getByLabel("Your question").fill("Why did revenue decline?");
    await page.getByRole("button", { name: "Ask" }).click();

    // Generous: local CPU inference can take a couple of minutes.
    await expect(page.getByText(/Confidence:/i).first()).toBeVisible({ timeout: 240_000 });
    await expect(page.getByRole("button", { name: /View evidence/i }).first()).toBeVisible();

    // --- report -----------------------------------------------------------
    await page.getByRole("link", { name: "Reports" }).click();
    await page.waitForURL("**/reports");
    await page.getByRole("button", { name: /Generate/i }).first().click();

    await expect(
      page.getByRole("heading", { name: /Executive summary/i }).first(),
    ).toBeVisible({ timeout: 180_000 });
    await expect(page.getByRole("heading", { name: /Key figures/i }).first()).toBeVisible();
  });
});

test.describe("error and empty states", () => {
  test("rejects an unsupported file with an actionable message", async ({ page }) => {
    await signUp(page);
    await page.goto("/datasets/new");

    await page.setInputFiles('input[type="file"]', {
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("this is not a spreadsheet"),
    });

    const alert = errorBanner(page);
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/not supported/i);
  });

  test("a new workspace explains what to do next", async ({ page }) => {
    await signUp(page);
    await page.goto("/overview");

    await expect(page.getByText(/Upload your business data/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Upload data/i })).toBeVisible();
  });

  test("the empty anomalies state teaches the concept", async ({ page }) => {
    await signUp(page);
    await page.goto("/anomalies");

    await expect(page.getByText(/No anomalies detected/i)).toBeVisible();
    // Not just "no data" — it says what an anomaly is and why none is good.
    await expect(page.getByText(/deviates materially/i)).toBeVisible();
  });
});

test.describe("responsive layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("navigation is reachable and nothing overflows on a phone", async ({ page }) => {
    await signUp(page);
    await page.goto("/overview");

    await page.getByRole("button", { name: /Open navigation/i }).click();
    await expect(page.getByRole("link", { name: "Datasets" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Navigation" })).not.toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
