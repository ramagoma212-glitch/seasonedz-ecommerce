// Version 7, Milestone 172B: admin affiliate-product management UI.
// Nothing here is public yet — no /recommended-books page, no
// /go/:trackingSlug redirect (both are Milestone 172C) — this file
// only covers the admin-only foundation this milestone actually
// builds. Every "logged in" scenario is mocked via page.route(),
// exactly like richTextDescription.spec.js's mockAdminCreatePage() and
// productReviews.spec.js's admin-auth tests — this project has no
// precedent for driving a real authenticated admin session in
// Playwright, and this file follows that same established discipline
// rather than inventing a new one.
import { test, expect } from "@playwright/test";

const MOCK_PRODUCT = {
  id: "aff-1",
  title: "The Very Hungry Caterpillar",
  author: "Eric Carle",
  slug: "the-very-hungry-caterpillar",
  trackingSlug: "very-hungry-caterpillar",
  description: "A classic picture book.",
  imageUrl: null,
  category: "Children",
  merchantName: "Amazon",
  affiliateNetwork: "Amazon Associates",
  affiliateUrl: "https://www.amazon.co.za/dp/B0073X8Y5U",
  price: 250,
  currency: "ZAR",
  priceLastCheckedAt: "2026-08-20T00:00:00.000Z",
  discountText: null,
  rating: 4.8,
  isFeatured: false,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

function envelope(data) {
  return JSON.stringify({ success: true, message: "OK", data });
}

async function mockAdminAuth(page) {
  await page.route("**/api/admin/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope({ id: "admin-1", email: "owner@example.invalid" }) })
  );
}

async function mockAffiliateList(page, products = [MOCK_PRODUCT]) {
  await page.route("**/api/admin/affiliate/products?*", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: envelope({ products, total: products.length, page: 1, limit: 20, totalPages: 1 }),
    });
  });
  await page.route("**/api/admin/affiliate/products", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: envelope({ products, total: products.length, page: 1, limit: 20, totalPages: 1 }),
    });
  });
}

test.describe("Admin nav (Milestone 172B)", () => {
  test("the Affiliate nav link is present and points at /admin/affiliate", async ({ page }) => {
    await mockAdminAuth(page);
    await mockAffiliateList(page, []);
    await page.goto("/admin/affiliate");
    const link = page.locator(".admin-nav a", { hasText: "Affiliate" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/admin/affiliate");
  });
});

test.describe("Admin affiliate routes are noindex and not publicly reachable (Milestone 172B)", () => {
  test("/admin/affiliate is noindex", async ({ page }) => {
    await mockAdminAuth(page);
    await mockAffiliateList(page, []);
    await page.goto("/admin/affiliate");
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toContain("noindex");
  });

  test("/admin/affiliate requires admin auth — a 401 redirects to admin login", async ({ page }) => {
    await page.route("**/api/admin/affiliate/products*", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Authentication required." }) })
    );
    await page.goto("/admin/affiliate");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("/admin/affiliate/new requires admin auth — a 401 redirects to admin login", async ({ page }) => {
    await page.route("**/api/admin/auth/me", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Authentication required." }) })
    );
    await page.goto("/admin/affiliate/new");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe("Admin affiliate products list (Milestone 172B)", () => {
  test("renders the mocked product with its labelled fields", async ({ page }) => {
    await mockAdminAuth(page);
    await mockAffiliateList(page, [MOCK_PRODUCT]);
    await page.goto("/admin/affiliate");

    const row = page.locator('[data-affiliate-product-row="aff-1"]');
    await expect(row).toContainText("The Very Hungry Caterpillar");
    await expect(row).toContainText("Amazon");
    await expect(row).toContainText("Amazon Associates");
    await expect(row).toContainText("250.00");
    await expect(row.getByText("Deactivate")).toBeVisible();
    await expect(row.getByText("Feature")).toBeVisible();
  });

  test("shows an empty state with zero affiliate products", async ({ page }) => {
    await mockAdminAuth(page);
    await mockAffiliateList(page, []);
    await page.goto("/admin/affiliate");
    await expect(page.locator(".admin-empty")).toContainText("No affiliate products yet");
  });

  test("deactivating a product calls the deactivate endpoint", async ({ page }) => {
    await mockAdminAuth(page);
    await mockAffiliateList(page, [MOCK_PRODUCT]);
    let deactivateCalled = false;
    await page.route("**/api/admin/affiliate/products/aff-1/deactivate", (route) => {
      deactivateCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ...MOCK_PRODUCT, isActive: false }) });
    });

    await page.goto("/admin/affiliate");
    await page.locator('[data-action="deactivate-affiliate-product"]').click();
    await page.waitForTimeout(300);
    expect(deactivateCalled).toBe(true);
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await mockAdminAuth(page);
    await mockAffiliateList(page, [MOCK_PRODUCT]);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/admin/affiliate");
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasOverflow).toBe(false);
  });
});

test.describe("Admin affiliate product create form (Milestone 172B)", () => {
  test("shows every labelled field the brief requires", async ({ page }) => {
    await mockAdminAuth(page);
    await page.goto("/admin/affiliate/new");

    await expect(page.locator('label[for="affiliateMerchantName"]')).toContainText("Merchant");
    await expect(page.locator('label[for="affiliateNetwork"]')).toContainText("Affiliate Network");
    await expect(page.locator('label[for="affiliateUrl"]')).toContainText("Affiliate URL");
    await expect(page.locator('label[for="affiliateTrackingSlug"]')).toContainText("Tracking Slug");
    await expect(page.locator('label[for="affiliatePrice"]')).toContainText("Price");
    await expect(page.locator("#affiliateIsActive")).toBeVisible();
    await expect(page.locator("#affiliateIsFeatured")).toBeVisible();
  });

  test("rejects an http:// affiliate URL client-side before ever calling the API", async ({ page }) => {
    await mockAdminAuth(page);
    let createCalled = false;
    await page.route("**/api/admin/affiliate/products", (route) => {
      if (route.request().method() === "POST") createCalled = true;
      return route.continue();
    });

    await page.goto("/admin/affiliate/new");
    await page.locator("#affiliateTitle").fill("A Test Book");
    await page.locator("#affiliateMerchantName").fill("Amazon");
    await page.locator("#affiliateUrl").fill("http://example.com/not-https");
    await page.locator("[data-admin-affiliate-form] button[type=\"submit\"]").click();
    await page.waitForTimeout(200);

    await expect(page.locator("[data-admin-affiliate-form-banner]")).toContainText("https");
    expect(createCalled).toBe(false);
  });

  test("a valid submission creates the product and navigates to its edit page", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/affiliate/products", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({ status: 201, contentType: "application/json", body: envelope(MOCK_PRODUCT) });
    });
    await page.route("**/api/admin/affiliate/products/aff-1", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope(MOCK_PRODUCT) });
    });

    await page.goto("/admin/affiliate/new");
    await page.locator("#affiliateTitle").fill("The Very Hungry Caterpillar");
    await page.locator("#affiliateMerchantName").fill("Amazon");
    await page.locator("#affiliateUrl").fill("https://www.amazon.co.za/dp/B0073X8Y5U");
    await page.locator("[data-admin-affiliate-form] button[type=\"submit\"]").click();

    await expect(page).toHaveURL(/\/admin\/affiliate\/aff-1\/edit/);
  });
});

test.describe("Admin affiliate product edit form (Milestone 172B)", () => {
  test("loads the existing product's fields, including price-last-checked context", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/affiliate/products/aff-1", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope(MOCK_PRODUCT) });
    });

    await page.goto("/admin/affiliate/aff-1/edit");
    await expect(page.locator("#affiliateTitle")).toHaveValue("The Very Hungry Caterpillar");
    await expect(page.locator("#affiliateMerchantName")).toHaveValue("Amazon");
    await expect(page.locator("#affiliateUrl")).toHaveValue("https://www.amazon.co.za/dp/B0073X8Y5U");
    await expect(page.locator("#affiliateTrackingSlug")).toHaveValue("very-hungry-caterpillar");
    await expect(page.locator("#affiliatePrice")).toHaveValue("250");
    await expect(page.locator(".admin-product-form__hint", { hasText: "External merchant prices can change" })).toBeVisible();
  });

  test("a 404 shows a clear not-found message, never a blank or broken page", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/affiliate/products/does-not-exist", (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, message: "Affiliate product not found: does-not-exist" }) })
    );

    await page.goto("/admin/affiliate/does-not-exist/edit");
    await expect(page.locator("h1")).toContainText("Not Found");
  });
});
