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

/**
 * The sidebar, scoped.
 *
 * `getByRole("link", { name: "Insights" })` matches by substring, so once the
 * dashboard grew an "All insights" link it matched two elements and strict
 * mode failed the click. These tests mean the navigation item, so they say so.
 */
function nav(page: Page) {
  return page.getByRole("navigation", { name: "Main" });
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

    // The same primary call to action appears in the hero and again in the
    // closing section, which is deliberate — a reader who scrolls the whole
    // page should not have to scroll back. `.first()` picks the hero one.
    //
    // "Analyse", not "Analyze": the product had both spellings for the same
    // action, and one vocabulary is now enforced across the interface.
    await page.getByRole("link", { name: /Analyse your data/i }).first().click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test("offers a way in that needs no account", async ({ page }) => {
    // The demo generates a dataset, ingests it, profiles it, and analyses
    // fourteen thousand rows before the dashboard has anything to show.
    //
    // A test's own timeout has to exceed everything it waits for inside, or
    // those waits can never reach their limit and the run fails reporting the
    // wrong deadline — which is what the default 120s did here. The waits
    // below add up to 300s, so this leaves headroom rather than matching them
    // exactly. It typically finishes in about 50.
    test.setTimeout(360_000);

    await page.goto("/");

    await page.getByRole("link", { name: /See how it works/i }).first().click();
    await expect(page).toHaveURL(/\/demo/);

    // The demo page must say what it is doing rather than show a bare spinner:
    // it is creating a workspace and analysing fourteen thousand rows, and a
    // visitor who sees nothing assumes it is broken.
    await expect(page.getByRole("heading", { name: /Setting up your demo/i })).toBeVisible();
    await expect(page.getByText(/NovaMart/i).first()).toBeVisible();

    // And it must actually land in a workspace with the data already loading.
    await page.waitForURL("**/overview", { timeout: 120_000 });

    // Either state is correct here: the analysis may still be running, and the
    // dashboard must say so rather than tell the visitor to go and start one.
    //
    // The finished dashboard's h1 is the greeting — it leads with what
    // happened rather than with the navigation label "Overview", which said
    // nothing a visitor did not already know from the sidebar.
    await expect(
      page.getByRole("heading", {
        name: /(Here's what changed|Analysing your data)/,
        level: 1,
      }),
    ).toBeVisible();

    // Whichever it was, it must finish without the visitor doing anything.
    await expect(
      page.getByRole("heading", { name: /Here's what changed/, level: 1 }),
    ).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText(/Revenue/i).first()).toBeVisible();
  });

  test("makes no unverified compliance claims", async ({ page }) => {
    await page.goto("/");
    const body = (await page.textContent("body")) ?? "";
    expect(body).not.toMatch(/SOC 2 certified/i);
    expect(body).not.toMatch(/GDPR compliant/i);
    // It states plainly what it does *not* hold.
    expect(body).toMatch(/(does not hold|holds no) SOC 2/i);
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
    // This is one continuous session on purpose — it is the journey, not a set
    // of independent checks — so every slow step runs back to back. Against a
    // local 3B model on CPU that is minutes, not seconds: an investigation
    // measured at 97s and a question at 246s on a developer machine.
    //
    // `test.slow()` only triples the 120s default, which does not cover that.
    // The budget is stated outright instead, and set above the sum of every
    // wait inside (930s) so each one can actually reach its own limit rather
    // than being cut short by this one. A hosted provider returns in seconds
    // and never approaches any of it.
    test.setTimeout(1_200_000);

    await signUp(page);
    await expect(
      page.getByRole("heading", { name: /understand your business/i }),
    ).toBeVisible();

    await loadSampleAndAnalyse(page);

    // --- dashboard ------------------------------------------------------
    await page.getByRole("link", { name: "View dashboard" }).click();
    await page.waitForURL("**/overview");

    await expect(
      page.getByRole("heading", { name: /Here's what changed/, level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Revenue").first()).toBeVisible();
    await expect(page.getByText(/Revenue (fell|rose)/i).first()).toBeVisible();

    // The two concepts must stay separate: movements the analysis ranked, and
    // periods that fall outside prediction. They were previously the same
    // records rendered twice under two different names.
    await expect(page.getByRole("heading", { name: /What changed/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Needs attention/ })).toBeVisible();
    // The headline figure must be traceable, not just present.
    await expect(
      page.getByRole("button", { name: /How Revenue is calculated/i }).first(),
    ).toBeVisible();

    // --- insights and evidence ------------------------------------------
    await nav(page).getByRole("link", { name: "Insights", exact: true }).click();
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
    await nav(page).getByRole("link", { name: "Anomalies", exact: true }).click();
    await page.waitForURL("**/anomalies");
    await expect(page.getByRole("heading", { name: "Anomalies", level: 1 })).toBeVisible();

    const investigate = page.getByRole("link", { name: /Investigate/i }).first();
    if (await investigate.isVisible()) {
      await investigate.click();
      // The same 90 seconds the assertion below already allows, for the same
      // reason: this heading does not appear until the server has finished
      // rendering the page, and rendering it recomputes the investigation in
      // pandas. Fifteen seconds — the default — is enough on an idle machine
      // and not enough on a busy one, which made this the one step in the
      // journey that failed for a reason having nothing to do with the
      // product. The page is allowed to be slow here; it is not allowed to be
      // wrong, and every assertion about what it says is unchanged.
      await expect(page.getByRole("heading", { name: "Investigation" })).toBeVisible({
        timeout: 90_000,
      });
      await expect(page.getByText(/What happened/i).first()).toBeVisible({
        timeout: 90_000,
      });
      await expect(page.getByText(/Confidence:/i).first()).toBeVisible();
    }

    // --- ask --------------------------------------------------------------
    await nav(page).getByRole("link", { name: "Ask InsightFlow", exact: true }).click();
    await page.waitForURL("**/ask");
    await page.getByLabel("Your question").fill("Why did revenue decline?");
    await page.getByRole("button", { name: "Ask" }).click();

    // Answering a question is two model calls, not one: the plan, then the
    // prose. On CPU that pair was measured at 333s, so 240s was cutting into
    // a request that was still working correctly.
    await expect(page.getByText(/Confidence:/i).first()).toBeVisible({ timeout: 480_000 });
    await expect(page.getByRole("button", { name: /View evidence/i }).first()).toBeVisible();

    // --- report -----------------------------------------------------------
    await nav(page).getByRole("link", { name: "Reports", exact: true }).click();
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

    // Through the real affordance rather than by writing to the hidden input.
    // `setInputFiles` does not wait for anything, so on a page React has not
    // finished hydrating it sets the file before the change handler exists and
    // the test fails with no error shown and no explanation. Clicking "browse"
    // waits for the handler, because without one no file chooser ever opens.
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "browse" }).click(),
    ]);
    await chooser.setFiles({
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
    await expect(
      nav(page).getByRole("link", { name: "Datasets", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Navigation" })).not.toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
