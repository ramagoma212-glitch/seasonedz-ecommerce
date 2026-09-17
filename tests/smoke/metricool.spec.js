// Milestone 186: Metricool Web Analytics — additional site analytics
// alongside GA4 (see js/metricool.js's own header comment). Never hits
// the real tracker.metricool.com from a test — every test here mocks
// the tracker script response, same "mock external services, never
// depend on them being reachable" discipline as every other smoke
// test in this project. Runs against the "local" project (no
// VITE_GA_MEASUREMENT_ID build-time gate applies to Metricool at all —
// it's gated purely by runtime consent, same as GA4's own consent
// gate, but with no separate config-presence gate to also satisfy).
import { test, expect } from "@playwright/test";

const TRACKER_URL_PATTERN = "**/tracker.metricool.com/resources/be.js";
const EXPECTED_HASH = "1a4cb5231d8873d12258557dd3fd3c36";

// Fulfils the real tracker request with a minimal stub that records
// every beTracker.t() call onto window.__metricoolCalls, so tests can
// assert on exactly what this project's own code passed it — without
// ever depending on the real external Metricool service being
// reachable during a test run.
async function mockMetricoolTracker(page) {
  let requestCount = 0;
  await page.route(TRACKER_URL_PATTERN, (route) => {
    requestCount += 1;
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `window.beTracker = { t: function (opts) { window.__metricoolCalls = window.__metricoolCalls || []; window.__metricoolCalls.push(opts); } };`,
    });
  });
  return () => requestCount;
}

async function getMetricoolCalls(page) {
  return page.evaluate(() => window.__metricoolCalls || []);
}

async function grantAnalyticsConsent(page) {
  await page.locator('[data-action="cookie-accept"]').click();
}

test.describe("Metricool: consent gating (Milestone 186)", () => {
  test("Metricool does not load before analytics consent", async ({ page }) => {
    const getRequestCount = await mockMetricoolTracker(page);
    await page.goto("/");
    await expect(page.locator("[data-cookie-consent-banner]")).toBeVisible();
    await page.waitForTimeout(1500);

    expect(getRequestCount()).toBe(0);
    expect(await getMetricoolCalls(page)).toEqual([]);
  });

  test("Metricool loads after analytics consent, with the correct tracker script and hash", async ({ page }) => {
    const getRequestCount = await mockMetricoolTracker(page);
    await page.goto("/");
    await grantAnalyticsConsent(page);

    await expect.poll(async () => (await getMetricoolCalls(page)).length).toBeGreaterThan(0);
    expect(getRequestCount()).toBe(1);

    const calls = await getMetricoolCalls(page);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ hash: EXPECTED_HASH });
  });

  test("a returning visitor who already granted consent loads Metricool immediately on page load, no interaction needed", async ({
    page,
    context,
  }) => {
    // Seed the exact consent record shape js/consent.js's saveConsent()
    // produces, same convention as analyticsEnabled.spec.js.
    await context.addInitScript(() => {
      localStorage.setItem(
        "seasonedz_cookie_consent",
        JSON.stringify({
          version: "1",
          necessary: true,
          preferences: true,
          analytics: true,
          marketing: false,
          timestamp: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );
    });
    const getRequestCount = await mockMetricoolTracker(page);
    await page.goto("/");

    await expect.poll(async () => (await getMetricoolCalls(page)).length).toBeGreaterThan(0);
    expect(getRequestCount()).toBe(1);
  });
});

test.describe("Metricool: duplicate protection (Milestone 186)", () => {
  test("the tracker script is requested only once, and beTracker.t() is called only once, even across SPA navigation", async ({
    page,
  }) => {
    // Deliberately clicks real in-app links rather than calling
    // page.goto() again for the 2nd/3rd navigation — page.goto() is a
    // full browser navigation (a fresh page load, fresh JS module
    // state), not the SPA client-side pushState transition router.js's
    // own link-interception actually produces for a real customer
    // clicking around the site (same discipline as analyticsEnabled.spec.js's
    // own "GA4 page_view on SPA navigation" test).
    const getRequestCount = await mockMetricoolTracker(page);
    await page.goto("/");
    await grantAnalyticsConsent(page);
    await expect.poll(async () => (await getMetricoolCalls(page)).length).toBeGreaterThan(0);

    await page.locator('a[href="/shop"]').first().click();
    await expect(page.locator(".product-card").first()).toBeVisible();
    await page.locator('a[href="/product/abc-colouring-book-for-kids-with-fun-facts"]').first().click();
    await expect(page.locator(".product-details__main-image")).toBeVisible();

    expect(getRequestCount()).toBe(1);
    expect(await getMetricoolCalls(page)).toHaveLength(1);
  });
});

test.describe("Metricool: does not interfere with the site (Milestone 186)", () => {
  test("homepage, product, category and blog pages all still work normally with Metricool active", async ({ page }) => {
    await mockMetricoolTracker(page);
    await page.goto("/");
    await grantAnalyticsConsent(page);
    await expect(page.locator(".new-releases-grid, .home-hero")).toBeVisible();

    await page.goto("/product/abc-colouring-book-for-kids-with-fun-facts");
    await expect(page.locator(".product-details__main-image")).toBeVisible();

    await page.goto("/category/bible-colouring-books");
    await expect(page.locator(".product-card").first()).toBeVisible();

    await page.goto("/blog/calming-power-of-mindfulness-colouring");
    await expect(page).toHaveTitle(/The Calming Power of Mindfulness Colouring/);
  });

  test("no serious console errors are produced once Metricool is active", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await mockMetricoolTracker(page);
    await page.goto("/");
    await grantAnalyticsConsent(page);
    await expect.poll(async () => (await getMetricoolCalls(page)).length).toBeGreaterThan(0);
    await page.goto("/shop");
    await expect(page.locator(".product-card").first()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("an offline/unreachable Metricool tracker never breaks the page", async ({ page }) => {
    await page.route(TRACKER_URL_PATTERN, (route) => route.abort("connectionrefused"));
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await grantAnalyticsConsent(page);
    await page.waitForTimeout(1000);
    await page.goto("/shop");
    await expect(page.locator(".product-card").first()).toBeVisible();

    expect(errors).toEqual([]);
  });
});

test.describe("Metricool + UTM + affiliate coexistence (Milestone 186, Parts 6-7)", () => {
  test("a UTM-tagged, affiliate-referred landing URL keeps every parameter intact with Metricool active, and Metricool does not rewrite the URL", async ({
    page,
  }) => {
    await mockMetricoolTracker(page);
    let capturedRefCode = null;
    await page.route("**/api/referrals/capture*", (route) => {
      const url = new URL(route.request().url());
      capturedRefCode = url.searchParams.get("code");
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "OK",
          data: { code: capturedRefCode, capturedAt: new Date().toISOString(), signature: "test-signature-abc123", isValid: true, discountRatePercent: 5 },
        }),
      });
    });

    await page.goto(
      "/?ref=testcode1&utm_source=facebook&utm_medium=social&utm_campaign=revised_books_launch_2026&utm_content=test_post"
    );
    await grantAnalyticsConsent(page);
    await expect.poll(() => capturedRefCode).toBe("testcode1");

    const search = await page.evaluate(() => window.location.search);
    const params = new URLSearchParams(search);
    expect(params.get("ref")).toBe("testcode1");
    expect(params.get("utm_source")).toBe("facebook");
    expect(params.get("utm_medium")).toBe("social");
    expect(params.get("utm_campaign")).toBe("revised_books_launch_2026");
    expect(params.get("utm_content")).toBe("test_post");
  });
});
