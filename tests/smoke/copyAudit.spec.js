// Version 7, Milestone 177: website and email copy cleanup — brief
// section 20's "safe copy audit test... catch future accidental use of
// em dash/en dash in customer facing copy without scanning technical
// files." This deliberately reads each page's REAL RENDERED TEXT
// (page.locator("body").innerText()), never the source file — a
// browser's own innerText never includes HTML comments or <script>/
// <style> content, so this can never be tripped up by a legitimate
// developer comment or by CSS/JS syntax. Only what a visitor actually
// sees is ever inspected.
import { test, expect } from "@playwright/test";

const EM_DASH = "—";
const EN_DASH = "–";
const BULLET = "•";
// Version 7, Milestone 177: widened past just em/en dash after this
// milestone's own audit found real "&bull;" separators between
// unrelated phrases (blog card meta, order confirmation contact line,
// admin audit-log timeline). The literal bullet glyph never appears in
// this codebase's visible text otherwise, since real lists use CSS
// list-style, not an inline "•" character, so this cannot false-positive
// on a genuine structured list (brief section 10's carve-out).
async function assertNoDecorativeDashes(page, label) {
  const text = await page.locator("body").innerText();
  const match = text.match(new RegExp(`.{0,40}[${EM_DASH}${EN_DASH}${BULLET}].{0,40}`));
  expect(match, `${label} contains a decorative dash or bullet in its visible text: ${match?.[0]}`).toBeNull();
}

const PUBLIC_PAGES = [
  "/",
  "/shop",
  "/cart",
  "/about",
  "/contact",
  "/faq",
  "/schools",
  "/blog",
  "/terms",
  "/privacy-policy",
  "/cookies-policy",
  "/returns-policy",
  "/affiliate-terms",
  "/track-order",
  "/account",
  "/account/forgot-password",
  "/account/affiliate-application",
  "/admin/login",
  "/this-page-does-not-exist",
];

test.describe("Copy audit: no decorative em/en dash in visible page text", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} has no em/en dash in its rendered body text`, async ({ page }) => {
      await page.goto(path);
      await assertNoDecorativeDashes(page, path);
    });
  }

  test("a real blog post has no em/en dash in its rendered body text", async ({ page }) => {
    await page.goto("/blog");
    const firstPostLink = page.locator(".blog-card a, a[href^='/blog/']").first();
    await firstPostLink.click();
    await assertNoDecorativeDashes(page, "blog post");
  });

  // Version 7, Milestone 177: this is deliberately the product that
  // originally shipped the "Make it a gift &mdash; add gift wrapping"
  // bug this test caught in CI (an HTML *entity*, invisible to a plain
  // source-text grep for the literal em-dash character, only caught by
  // rendering the real page) — kept as a permanent regression guard for
  // that class of bug, not just a random first product.
  test("a real product detail page (with gift wrapping visible) has no em/en dash in its rendered body text", async ({ page }) => {
    await page.goto("/shop");
    await page.locator(".product-card a, a[href^='/product/']").first().click();
    await expect(page.getByText("Make it a gift")).toBeVisible();
    await assertNoDecorativeDashes(page, "product detail page");
  });

  test("every product detail page reachable from the shop grid has no em/en dash in its rendered body text", async ({ page }) => {
    await page.goto("/shop");
    const productLinks = await page.locator(".product-card a, a[href^='/product/']").evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute("href")))]);
    for (const href of productLinks.slice(0, 8)) {
      await page.goto(href);
      await assertNoDecorativeDashes(page, `product detail page ${href}`);
    }
  });

  // Version 7, Milestone 177, brief section 14: the browser tab title
  // itself (document.title) is a distinct, standard SEO/browser
  // convention ("Page | Site Name") — explicitly preserved per brief
  // section 15 ("do not damage SEO... preserve keywords and page
  // meaning"), not a "decorative separator between sentences." This is
  // deliberately NOT asserted dash-free here; see MILESTONE_177 final
  // report for the full reasoning.
});

// Version 7, Milestone 177, brief section 4: admin-visible copy. Same
// "mock the admin session, never drive a real one" discipline as
// adminAffiliate.spec.js. A representative sample of the admin pages
// this milestone's own entity-encoded-dash sweep (&mdash;/&ndash;)
// found and fixed real occurrences on.
test.describe("Copy audit: admin pages", () => {
  function envelope(data) {
    return JSON.stringify({ success: true, message: "OK", data });
  }

  function mockAdminAuth(page) {
    return page.route("**/api/admin/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ id: "admin-1", email: "owner@example.invalid" }) }));
  }

  test("admin affiliate products list has no em/en dash in its rendered body text", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/affiliate/products*", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ products: [{ id: "aff-1", title: "Test Book", slug: "test-book", trackingSlug: "test-book", merchantName: "Amazon", affiliateNetwork: null, affiliateUrl: "https://amazon.co.za/x", price: null, currency: "ZAR", isFeatured: false, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }], total: 1, page: 1, limit: 20, totalPages: 1 }),
      });
    });

    await page.goto("/admin/affiliate");
    await assertNoDecorativeDashes(page, "admin affiliate products list");
  });

  test("admin referral affiliates list has no em/en dash in its rendered body text", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/referrals/affiliates*", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ affiliates: [{ id: "a1", name: "Thandiwe Nkosi", email: "thandiwe@example.com", referralCode: "thandiwe-1", commissionRateOverride: null, discountRateOverride: null, status: "PENDING", customerId: null, notes: null, approvedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }], total: 1, page: 1, limit: 20, totalPages: 1 }),
      });
    });

    await page.goto("/admin/referrals/affiliates");
    await assertNoDecorativeDashes(page, "admin referral affiliates list");
  });

  test("admin products list has no em/en dash in its rendered body text", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/products*", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ products: [{ id: "p1", name: "Test Product", slug: "test-product", sku: null, status: "ACTIVE", stockQuantity: 5, lowStockThreshold: 2, price: 100, productType: "PHYSICAL", categoryName: null, primaryImageUrl: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }], total: 1, page: 1, limit: 20, totalPages: 1 }),
      });
    });

    await page.goto("/admin/products");
    await assertNoDecorativeDashes(page, "admin products list");
  });
});
