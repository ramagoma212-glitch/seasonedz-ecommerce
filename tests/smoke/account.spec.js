// Version 7, Milestone 128: customer account frontend smoke checks.
// GET /api/customers/me is proxied to the real live backend (same
// convention as every other API call in this suite — see
// safety.spec.js's own header comment) — while logged out (the only
// state a fresh Playwright browser context can ever be in here), it
// correctly 401s and the page shows the logged-out login/register
// view, so these checks never create any real Customer row. Deliberate
// exception: the two client-validation tests submit each form with
// nothing filled in, which is rejected before any network call is
// ever made (see js/app.js's handleCustomerRegisterSubmit/
// handleCustomerLoginSubmit — validation runs first, and only calls
// the backend once it passes) — still zero real accounts created.
import { test, expect } from "@playwright/test";

test.describe("Customer account smoke checks", () => {
  test("account page loads and shows the logged-out view", async ({ page }) => {
    await page.goto("/account");
    await expect(page.locator("#customer-login-form")).toBeVisible();
    await expect(page.locator('[data-account-tab="register"]')).toBeVisible();
  });

  test("register form client validation works without creating an account", async ({ page }) => {
    await page.goto("/account");
    await page.locator('[data-account-tab="register"]').click();
    const registerForm = page.locator("#customer-register-form");
    await expect(registerForm).toBeVisible();

    await registerForm.locator('button[type=submit]').click();
    await expect(registerForm.locator('[data-error-for="firstName"]')).not.toHaveText("");
    await expect(registerForm.locator('[data-error-for="email"]')).not.toHaveText("");
    await expect(registerForm.locator('[data-error-for="password"]')).not.toHaveText("");
  });

  test("login form client validation works without a network call", async ({ page }) => {
    await page.goto("/account");
    const loginForm = page.locator("#customer-login-form");
    await loginForm.locator('button[type=submit]').click();
    await expect(loginForm.locator('[data-error-for="email"]')).not.toHaveText("");
    await expect(loginForm.locator('[data-error-for="password"]')).not.toHaveText("");
  });

  test("header My Account link exists and goes to /account", async ({ page }) => {
    await page.goto("/");
    const link = page.locator('.site-header a[href="/account"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveText("My Account");
  });

  test("guest checkout still loads without requiring an account", async ({ page }) => {
    await page.goto("/shop");
    await page.locator('[data-action="add-to-cart"]').first().click();
    await page.goto("/checkout");
    await expect(page.locator("form").first()).toBeVisible();
    // Deliberately stops here — never fills in or submits the form.
  });

  // Version 7, Milestone 121/122: VITE_PAYFAST_ENABLED is correctly
  // unset (defaults false) in this suite's own local build — same as
  // every other local dev build — so PayFast legitimately shows as
  // "Coming Soon" here. Whether it's actually selectable live is
  // already verified against the real backend by safety.spec.js's own
  // "PayFast initiate" check; this test only confirms the option still
  // renders at all (this milestone didn't break checkout's payment
  // method list).
  test("PayFast payment option still present at checkout", async ({ page }) => {
    await page.goto("/shop");
    await page.locator('[data-action="add-to-cart"]').first().click();
    await page.goto("/checkout");

    const payfastOption = page.locator(".payment-method", { hasText: "PayFast" });
    await expect(payfastOption).toBeVisible();
  });

  test("admin login stays separate from the customer account page", async ({ page }) => {
    await page.goto("/account");
    const adminLinks = page.locator('a[href*="/admin"]');
    expect(await adminLinks.count()).toBe(0);
  });
});
