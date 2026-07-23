// Version 7, Milestone 103: safety smoke checks — PayFast stays
// disabled, the admin API stays locked, admin has no public entry
// point, and checkout loads without ever being submitted.
//
// The PayFast and admin-API checks call the real live backend
// directly (https://seasonedz-ecommerce.onrender.com), regardless of
// which Playwright project (local/live) is running — this suite only
// ever runs a local *frontend* static server, never a local copy of
// the Express/Prisma backend, so the live backend is the only one
// there is to check against. Both calls are read-only/rejected-by-
// design and need no secret or admin credential:
//  - PayFast initiate: backend/src/services/payfast.service.ts checks
//    `payfastConfig.enabled` and throws before ever looking up an
//    order, so a syntactically-valid-but-nonexistent order number
//    (format "SG-YYYY-XXXX", checked by the controller before this)
//    never touches a real order.
//  - Admin products: intentionally unauthenticated, expecting 401.
import { test, expect } from "@playwright/test";

const API_BASE = "https://seasonedz-ecommerce.onrender.com/api";

test.describe("Safety smoke checks", () => {
  test("PayFast initiate returns its disabled response, not a real payment", async ({ request }) => {
    const resp = await request.post(`${API_BASE}/payments/payfast/initiate`, {
      data: { orderNumber: "SG-2026-ZZZZ" },
    });
    expect(resp.status()).toBe(503);

    const body = await resp.json();
    expect(body.message.toLowerCase()).toContain("not enabled");
  });

  test("admin API returns 401 when unauthenticated", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/admin/products`);
    expect(resp.status()).toBe(401);
  });

  test("admin link is not visible in public navigation", async ({ page }) => {
    await page.goto("/");
    const adminLinks = page.locator('.site-header a[href*="admin"]');
    expect(await adminLinks.count()).toBe(0);
  });

  test("admin login page is noindex", async ({ page }) => {
    await page.goto("/admin/login");
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toContain("noindex");
  });

  test("checkout page loads without submitting an order", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator(".product-card").first()).toBeVisible();
    await page.locator('[data-action="add-to-cart"]').first().click();
    await expect(page.locator('[data-badge="cart"]')).toHaveText("1");

    await page.goto("/checkout");
    await expect(page.locator("form").first()).toBeVisible();
    // Deliberately stops here — never fills in or submits the form.
  });
});
