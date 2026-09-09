// Milestone 183 — Google Analytics 4: the "must stay off" half of the
// required test list. Runs under the "local" Playwright project, whose
// own build (see playwright.config.js) deliberately never sets
// VITE_GA_MEASUREMENT_ID — the same discipline already established for
// VITE_API_BASE_URL, so this suite's content never depends on a live
// service. That absence is itself Part O's "GA4 must not send real
// traffic from ... local dev, CI builds, or test environments"
// requirement, proven here directly: even granting analytics consent
// and driving a full shopping journey must never load gtag.js or
// write to window.dataLayer. The opposite half (a Measurement ID IS
// configured, and events actually fire) is
// tests/smoke/analyticsEnabled.spec.js, which runs against a separate
// throwaway build with a fake, non-existent Measurement ID — see that
// file and playwright.config.js's own header comments.
import { test, expect } from "@playwright/test";

const PHYSICAL_SLUG = "abc-colouring-book-for-kids-with-fun-facts";

async function grantAnalyticsConsent(page) {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    "seasonedz_cookie_consent",
    JSON.stringify({ version: "1", necessary: true, preferences: true, analytics: true, marketing: false, timestamp: new Date().toISOString(), updatedAt: new Date().toISOString() }),
  ]);
}

async function getDataLayer(page) {
  return page.evaluate(() => window.dataLayer ?? null);
}

test.describe("GA4 stays off without a Measurement ID (Milestone 183)", () => {
  test("granting analytics consent still never defines window.gtag/window.dataLayer", async ({ page }) => {
    await grantAnalyticsConsent(page);
    await page.goto("/");
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => typeof window.gtag)).toBe("undefined");
    expect(await getDataLayer(page)).toBeNull();
  });

  test("no request is ever made to googletagmanager.com across a full shop -> product -> cart -> checkout journey", async ({ page }) => {
    await grantAnalyticsConsent(page);

    let gtagRequestSeen = false;
    page.on("request", (request) => {
      if (request.url().includes("googletagmanager.com")) gtagRequestSeen = true;
    });

    await page.goto("/shop");
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    const addButton = page.locator('[data-action="add-to-cart"]');
    if (await addButton.count()) await addButton.first().click();
    await page.goto("/cart");
    await page.goto("/checkout");

    expect(gtagRequestSeen).toBe(false);
    expect(await getDataLayer(page)).toBeNull();
  });

  test("a Bank Transfer order still places successfully end to end with analytics fully absent (failure safety)", async ({ page }) => {
    await grantAnalyticsConsent(page);
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator('[data-action="add-to-cart"]').click();
    await page.goto("/checkout");

    await page.route("**/api/orders", (route) =>
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { orderNumber: "SZ-TEST-GA-OFF-1" } }) })
    );

    await page.locator("#firstName").fill("Thandiwe");
    await page.locator("#lastName").fill("Nkosi");
    await page.locator("#email").fill("thandiwe@example.com");
    await page.locator("#phone").fill("0821234567");
    await page.locator('input[name="deliveryMethod"][value="COLLECTION"]').check();
    await page.locator("#collectionCity").selectOption({ index: 1 });
    await page.locator('input[name="paymentMethod"][value="bank-transfer"]').check();
    await page.locator('#checkout-form button[type="submit"]').click();

    // The real point of this test: checkout completed normally. GA4
    // being fully absent (no Measurement ID) must never be the reason
    // an order fails to place.
    await expect(page).toHaveURL(/order-confirmation/);
  });
});
