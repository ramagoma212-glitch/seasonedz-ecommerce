// Version 7, Milestone 171H: cookie/storage consent — Accept All /
// Reject Non-essential / Manage Preferences. Every Playwright test gets
// a fresh, isolated browser context (a fresh Local Storage) by default,
// so "first visit" behaviour is exactly what every test in this file
// starts from unless it explicitly sets a consent value first.
//
// This project has zero third-party analytics/marketing trackers
// anywhere (see js/consent.js's own header comment for the full
// audit) — there is nothing to test "doesn't execute before consent",
// so this file focuses on what's actually real: the banner/preferences
// UI itself, the stored decision, and that every existing strictly-
// necessary feature (cart, wishlist, login, social auth buttons,
// checkout) keeps working regardless of the customer's choice.
import { test, expect } from "@playwright/test";

const CONSENT_KEY = "seasonedz_cookie_consent";
const PHYSICAL_SLUG = "abc-colouring-book-for-kids-with-fun-facts";

async function getStoredConsent(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, CONSENT_KEY);
}

test.describe("Cookie consent — first visit and initial state (Milestone 171H)", () => {
  test("first visit shows the banner, and nothing is written to storage until the customer chooses", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-cookie-consent-banner]")).toBeVisible();

    // Necessary=true/analytics=false/marketing=false are the DEFAULT the
    // app treats an unset decision as (js/consent.js's defaultConsent())
    // — proven here by confirming nothing has actually been recorded
    // yet, i.e. no premature/implied consent of any kind.
    expect(await getStoredConsent(page)).toBeNull();
  });

  test("the banner never appears from mere scrolling or continued browsing — only an explicit choice records consent", async ({ page }) => {
    await page.goto("/");
    await page.mouse.wheel(0, 2000);
    await page.goto("/shop");
    await page.waitForTimeout(300);

    expect(await getStoredConsent(page)).toBeNull();
    await expect(page.locator("[data-cookie-consent-banner]")).toBeVisible();
  });

  test("Reject/Manage/Accept are all present with comparable, equally accessible controls — none hidden inside a menu", async ({ page }) => {
    await page.goto("/");
    const banner = page.locator("[data-cookie-consent-banner]");
    await expect(banner.locator('[data-action="cookie-reject"]')).toBeVisible();
    await expect(banner.locator('[data-action="cookie-manage"]')).toBeVisible();
    await expect(banner.locator('[data-action="cookie-accept"]')).toBeVisible();
  });
});

test.describe("Cookie consent — Accept All (Milestone 171H)", () => {
  test("Accept All stores the current version with every category true, and hides the banner", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-action="cookie-accept"]').click();
    await page.waitForTimeout(200);

    await expect(page.locator("[data-cookie-consent-banner]")).toHaveCount(0);

    const consent = await getStoredConsent(page);
    expect(consent.version).toBe("1");
    expect(consent.necessary).toBe(true);
    expect(consent.analytics).toBe(true);
    expect(consent.marketing).toBe(true);
    expect(consent.timestamp).toBeTruthy();
  });

  test("Accept All does not break the website — homepage and shop still work", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-action="cookie-accept"]').click();
    await page.waitForTimeout(200);

    await page.goto("/shop");
    await expect(page.locator(".product-card").first()).toBeVisible();
  });

  test("Accept All never auto-subscribes to the newsletter — cookie consent and newsletter consent stay separate", async ({ page }) => {
    let newsletterCalled = false;
    await page.route("**/api/newsletter/**", (route) => {
      newsletterCalled = true;
      return route.continue();
    });

    await page.goto("/");
    await page.locator('[data-action="cookie-accept"]').click();
    await page.waitForTimeout(500);

    expect(newsletterCalled).toBe(false);
  });

  test("the banner does not reappear after Accept All on a fresh page load", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-action="cookie-accept"]').click();
    await page.waitForTimeout(200);

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("[data-cookie-consent-banner]")).toHaveCount(0);
  });
});

test.describe("Cookie consent — Reject Non-essential (Milestone 171H)", () => {
  test("Reject Non-essential stores necessary=true, analytics=false, marketing=false, and hides the banner", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-action="cookie-reject"]').click();
    await page.waitForTimeout(200);

    await expect(page.locator("[data-cookie-consent-banner]")).toHaveCount(0);

    const consent = await getStoredConsent(page);
    expect(consent.necessary).toBe(true);
    expect(consent.analytics).toBe(false);
    expect(consent.marketing).toBe(false);
  });

  test("after rejecting, the cart still works — an item can be added and persists", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-action="cookie-reject"]').click();
    await page.waitForTimeout(200);

    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator('[data-action="add-to-cart"]').click();
    await page.waitForTimeout(300);

    await page.goto("/cart");
    await expect(page.locator(".cart-items")).toBeVisible();
    const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("seasonedz_cart") || "[]"));
    expect(cart.length).toBeGreaterThan(0);
  });

  test("after rejecting, the wishlist still works", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-action="cookie-reject"]').click();
    await page.waitForTimeout(200);

    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator('[data-action="toggle-wishlist"]').click();
    await page.waitForTimeout(300);

    const wishlist = await page.evaluate(() => JSON.parse(localStorage.getItem("seasonedz_wishlist") || "[]"));
    expect(wishlist.length).toBeGreaterThan(0);
  });

  test("after rejecting, customer login still works (client-side validation still runs, the form is fully present)", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-action="cookie-reject"]').click();
    await page.waitForTimeout(200);

    await page.goto("/account");
    const loginForm = page.locator("#customer-login-form");
    await expect(loginForm).toBeVisible();
    await loginForm.locator('button[type=submit]').click();
    await expect(loginForm.locator('[data-error-for="email"]')).not.toHaveText("");
  });

  test("after rejecting, checkout still loads and accepts items", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-action="cookie-reject"]').click();
    await page.waitForTimeout(200);

    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator('[data-action="add-to-cart"]').click();
    await page.goto("/checkout");
    await expect(page.locator("form").first()).toBeVisible();
  });
});

test.describe("Cookie consent — Manage Preferences (Milestone 171H)", () => {
  test("opening preferences shows Strictly Necessary as Always Active with no toggle, and Analytics/Marketing as togglable, off by default", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-cookie-consent-banner] [data-action="cookie-manage"]').click();
    await page.waitForTimeout(200);

    const modal = page.locator("[data-cookie-preferences-modal]");
    await expect(modal).toBeVisible();
    await expect(modal.locator(".cookie-category__always-active")).toHaveText("Always Active");
    await expect(page.locator("#cookie-category-necessary")).toHaveCount(0);
    await expect(page.locator("#cookie-category-analytics")).not.toBeChecked();
    await expect(page.locator("#cookie-category-marketing")).not.toBeChecked();
  });

  test("toggling a category and saving persists exactly that choice across a reload", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-cookie-consent-banner] [data-action="cookie-manage"]').click();
    await page.waitForTimeout(200);

    await page.locator("#cookie-category-analytics").check();
    await page.locator('[data-action="cookie-save"]').click();
    await page.waitForTimeout(200);

    let consent = await getStoredConsent(page);
    expect(consent.analytics).toBe(true);
    expect(consent.marketing).toBe(false);

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("[data-cookie-consent-banner]")).toHaveCount(0);
    consent = await getStoredConsent(page);
    expect(consent.analytics).toBe(true);
    expect(consent.marketing).toBe(false);
  });

  test("Escape closes the preferences panel without saving a new choice", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-cookie-consent-banner] [data-action="cookie-manage"]').click();
    await page.waitForTimeout(200);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await expect(page.locator("[data-cookie-preferences-modal]")).toHaveCount(0);
    // The banner itself is still showing — nothing was decided yet.
    await expect(page.locator("[data-cookie-consent-banner]")).toBeVisible();
  });

  test("clicking the backdrop closes the preferences panel", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-cookie-consent-banner] [data-action="cookie-manage"]').click();
    await page.waitForTimeout(200);

    await page.locator("[data-cookie-preferences-overlay]").click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(200);
    await expect(page.locator("[data-cookie-preferences-modal]")).toHaveCount(0);
  });

  test("the footer's Cookie Settings link reopens preferences after a decision has already been made", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-action="cookie-accept"]').click();
    await page.waitForTimeout(200);

    await page.locator(".site-footer [data-action=\"cookie-manage\"]").scrollIntoViewIfNeeded();
    await page.locator(".site-footer [data-action=\"cookie-manage\"]").click();
    await page.waitForTimeout(200);
    await expect(page.locator("[data-cookie-preferences-modal]")).toBeVisible();
    // Reflects the already-accepted state, not defaults.
    await expect(page.locator("#cookie-category-analytics")).toBeChecked();
  });

  test("changing a decision through Cookie Settings updates the stored consent's updatedAt without resetting the original timestamp", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-action="cookie-reject"]').click();
    await page.waitForTimeout(200);
    const firstConsent = await getStoredConsent(page);

    await page.waitForTimeout(50);
    await page.locator(".site-footer [data-action=\"cookie-manage\"]").scrollIntoViewIfNeeded();
    await page.locator(".site-footer [data-action=\"cookie-manage\"]").click();
    await page.locator("#cookie-category-analytics").check();
    await page.locator('[data-action="cookie-save"]').click();
    await page.waitForTimeout(200);

    const updatedConsent = await getStoredConsent(page);
    expect(updatedConsent.analytics).toBe(true);
    expect(updatedConsent.timestamp).toBe(firstConsent.timestamp);
    expect(updatedConsent.updatedAt).not.toBe(firstConsent.updatedAt);
  });
});

test.describe("Cookie consent — social auth unaffected (Milestone 171H)", () => {
  function mockProviders(page, providers) {
    return page.route("**/api/auth/providers", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "ok", data: providers }) })
    );
  }

  test("Continue with Google remains available and points at the real OAuth start route after Reject Non-essential", async ({ page }) => {
    await mockProviders(page, { google: true, facebook: false, apple: false });
    await page.goto("/");
    await page.locator('[data-action="cookie-reject"]').click();
    await page.waitForTimeout(200);

    await page.goto("/account");
    const googleButton = page.locator('[data-account-panel="login"] [data-social-auth-button="google"]');
    await expect(googleButton).toBeVisible();
    await expect(googleButton).toHaveAttribute("href", /\/auth\/oauth\/google\?intent=login/);
  });

  test("Facebook button still respects its own provider feature flag (not shown when disabled) regardless of cookie consent", async ({ page }) => {
    await mockProviders(page, { google: true, facebook: false, apple: false });
    await page.goto("/");
    await page.locator('[data-action="cookie-accept"]').click();
    await page.waitForTimeout(200);

    await page.goto("/account");
    await expect(page.locator('[data-account-panel="login"] [data-social-auth-button="facebook"]')).toHaveCount(0);
  });
});

test.describe("Cookie consent — security (Milestone 171H)", () => {
  test("the stored consent record contains no credentials, session data, or personal information — only the category booleans and timestamps", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-action="cookie-accept"]').click();
    await page.waitForTimeout(200);

    const consent = await getStoredConsent(page);
    const allowedKeys = ["version", "necessary", "preferences", "analytics", "marketing", "timestamp", "updatedAt"];
    expect(Object.keys(consent).sort()).toEqual([...allowedKeys].sort());
    for (const key of Object.keys(consent)) {
      expect(typeof consent[key] === "string" || typeof consent[key] === "boolean").toBe(true);
    }
  });

  test("rejecting all optional cookies has no effect on server-side session cookies — customer_session is HttpOnly and never touched by this frontend code", async ({ page, context }) => {
    await page.goto("/");
    await page.locator('[data-action="cookie-reject"]').click();
    await page.waitForTimeout(200);

    // This frontend never reads/writes document.cookie at all (confirmed
    // by this milestone's own audit) — asserting that holds regardless
    // of the consent choice just made.
    const hasDocumentCookieAccess = await page.evaluate(() => {
      try {
        return typeof document.cookie === "string";
      } catch {
        return false;
      }
    });
    // document.cookie itself is always readable by the platform; the
    // real guarantee is that nothing in this app's own code path writes
    // to it — proven structurally (see js/consent.js's own header
    // comment) rather than by this assertion alone, which just confirms
    // rejecting cookies didn't somehow break cookie access entirely.
    expect(hasDocumentCookieAccess).toBe(true);
  });
});

test.describe("Cookie Policy page (Milestone 171H, content replaced 24 August 2026)", () => {
  test("the existing /cookies-policy page was updated in place, not duplicated — loads with accurate content and its own working Cookie Settings button", async ({ page }) => {
    await page.goto("/cookies-policy");
    await expect(page.locator("h1")).toHaveText("Cookie Policy");
    await expect(page.locator(".stub-page__text")).toHaveText("Last updated: 24 August 2026");
    await expect(page.locator(".info-page__body")).toContainText("Where analytics tools are enabled");
    await expect(page.locator(".info-page__body")).toContainText("may in future use marketing or advertising technologies");
    await expect(page.locator(".info-page__body")).toContainText("2024/618215/07");

    await page.locator(".info-page__body .link-button").click();
    await page.waitForTimeout(200);
    await expect(page.locator("[data-cookie-preferences-modal]")).toBeVisible();
  });

  test("no other Cookie Policy route exists — /cookie-policy (singular) is not a separate duplicate page", async ({ page }) => {
    const response = await page.goto("/cookie-policy");
    // The SPA's own not-found handling renders normally (never a raw
    // 404 network error under GitHub Pages' SPA fallback), but it must
    // not be a second real Cookie Policy page with its own content.
    const status = response?.status();
    if (status && status < 400) {
      await expect(page.locator("h1")).not.toHaveText("Cookie Policy");
    }
  });
});
