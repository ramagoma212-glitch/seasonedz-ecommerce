// Version 7, Milestone 103: safety smoke checks — PayFast never
// touches a real order on a bad/nonexistent request, the admin API
// stays locked, admin has no public entry point, and checkout loads
// without ever being submitted.
//
// The PayFast and admin-API checks call the real live backend
// directly (https://seasonedz-ecommerce.onrender.com), regardless of
// which Playwright project (local/live) is running — this suite only
// ever runs a local *frontend* static server, never a local copy of
// the Express/Prisma backend, so the live backend is the only one
// there is to check against. Both calls are read-only/rejected-by-
// design and need no secret or admin credential:
//  - PayFast initiate: Version 7, Milestone 124 enabled PayFast on the
//    live backend (`payfastConfig.enabled`), so a syntactically-valid-
//    but-nonexistent order number (format "SG-YYYY-XXXX", checked by
//    the controller first) no longer short-circuits on the disabled
//    check — it now reaches backend/src/services/payfast.service.ts's
//    real order lookup, which throws a 404 since no such order exists.
//    Either way (503 while disabled, 404 once enabled) this proves the
//    same thing: a fake order number can never reach a real order or
//    create a real payment.
//  - Admin products: intentionally unauthenticated, expecting 401.
import { test, expect } from "@playwright/test";

const API_BASE = "https://seasonedz-ecommerce.onrender.com/api";

test.describe("Safety smoke checks", () => {
  test("PayFast initiate rejects a nonexistent order, never a real payment", async ({ request }) => {
    const resp = await request.post(`${API_BASE}/payments/payfast/initiate`, {
      data: { orderNumber: "SG-2026-ZZZZ" },
    });
    // 503 = PayFast disabled; 404 = enabled but this order doesn't
    // exist. Both are safe — never a real payment/redirect.
    expect([503, 404]).toContain(resp.status());

    const body = await resp.json();
    expect(body.success).toBe(false);
    if (resp.status() === 503) {
      expect(body.message.toLowerCase()).toContain("not enabled");
    } else {
      expect(body.message.toLowerCase()).toContain("not found");
    }
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
