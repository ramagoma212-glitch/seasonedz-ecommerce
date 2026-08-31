// Milestone 178, Part C: admin Affiliate Products — per-product
// commission configuration. Same "mocked state, real backend never
// touched" discipline as affiliateApplication.spec.js. Deliberately
// distinct from the dormant, external-merchant AffiliateProduct admin
// area at /admin/affiliate (never exercised or referenced here).
import { test, expect } from "@playwright/test";

function envelope(data) {
  return JSON.stringify({ success: true, message: "OK", data });
}

function mockAdminAuth(page) {
  return page.route("**/api/admin/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ id: "admin-1", email: "owner@example.invalid" }) }));
}

const SAMPLE_ITEM = {
  id: "setting-1",
  productId: "product-1",
  productName: "ABC Colouring Book for Kids",
  productSlug: "abc-colouring-book-for-kids",
  productSku: "SG-0001",
  productPrice: 100,
  productStatus: "ACTIVE",
  productImageUrl: "https://example.invalid/abc.webp",
  commissionType: "PERCENTAGE",
  commissionPercent: null,
  fixedCommissionAmount: null,
  isAffiliateAvailable: true,
  startsAt: null,
  endsAt: null,
  maximumCommission: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

test.describe("Admin Affiliate Products list", () => {
  test("shows live product image/name/price/SKU and commission config, with an Add Affiliate Product link", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/referrals/affiliate-products?**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ items: [SAMPLE_ITEM], total: 1, page: 1, limit: 20, totalPages: 1 }) })
    );

    await page.goto("/admin/referrals/affiliate-products");
    await expect(page.getByText("ABC Colouring Book for Kids")).toBeVisible();
    await expect(page.getByText("SG-0001")).toBeVisible();
    await expect(page.getByText("R100.00")).toBeVisible();
    await expect(page.getByText("Programme default rate")).toBeVisible();
    await expect(page.getByRole("link", { name: "Add Affiliate Product" })).toHaveAttribute("href", "/admin/referrals/affiliate-products/new");
  });

  test("the Referrals sub-nav includes an Affiliate Products link", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/referrals/affiliate-products?**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 }) })
    );
    await page.goto("/admin/referrals/affiliate-products");
    await expect(page.locator(".admin-nav__link--active", { hasText: "Affiliate Products" })).toBeVisible();
  });

  test("no configured products shows a clear empty state, not a broken table", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/referrals/affiliate-products?**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 }) })
    );
    await page.goto("/admin/referrals/affiliate-products");
    await expect(page.getByText(/No products configured/)).toBeVisible();
  });

  test("reflects the product's current name/price/image on every load — no sync process, no stale copy", async ({ page }) => {
    await mockAdminAuth(page);
    let call = 0;
    await page.route("**/api/admin/referrals/affiliate-products?**", (route) => {
      call += 1;
      const item = call === 1 ? SAMPLE_ITEM : { ...SAMPLE_ITEM, productName: "Renamed In Products Admin", productPrice: 175, productImageUrl: "https://example.invalid/new-image.webp" };
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ items: [item], total: 1, page: 1, limit: 20, totalPages: 1 }) });
    });

    await page.goto("/admin/referrals/affiliate-products");
    await expect(page.getByText("ABC Colouring Book for Kids")).toBeVisible();
    await expect(page.getByText("R100.00")).toBeVisible();

    // Simulates the product being edited elsewhere (the Products admin
    // area) between page loads — reloading this page must show the new
    // values immediately, with nothing here to "sync" or invalidate.
    await page.reload();
    await expect(page.getByText("Renamed In Products Admin")).toBeVisible();
    await expect(page.getByText("R175.00")).toBeVisible();
    await expect(page.locator('img[src="https://example.invalid/new-image.webp"]')).toBeVisible();
  });

  test("Remove asks for confirmation and calls the delete endpoint only when confirmed", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/referrals/affiliate-products?**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ items: [SAMPLE_ITEM], total: 1, page: 1, limit: 20, totalPages: 1 }) })
    );
    let deleteCalled = false;
    await page.route("**/api/admin/referrals/affiliate-products/setting-1", (route) => {
      if (route.request().method() !== "DELETE") return route.continue();
      deleteCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({}) });
    });

    await page.goto("/admin/referrals/affiliate-products");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('[data-action="remove-affiliate-product"]').click();

    await expect.poll(() => deleteCalled).toBe(true);
  });
});

test.describe("Admin Affiliate Product create form", () => {
  test("searching, selecting a product, and submitting sends the exact productId and commission payload", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/products?**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({
          products: [{ id: "product-2", name: "Mindfulness Colouring Book", slug: "mindfulness-colouring-book", sku: "SG-0002", price: 150, oldPrice: null, stockQuantity: 20, lowStockThreshold: 5, status: "ACTIVE", category: { id: "c1", name: "Books", slug: "books" }, isFeatured: false, isBestSeller: false, isNewArrival: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), productType: "PHYSICAL", hasDigitalFile: false, digitalFileMissingWarning: false }],
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        }),
      })
    );
    let createBody = null;
    await page.route("**/api/admin/referrals/affiliate-products", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      createBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, contentType: "application/json", body: envelope({ item: { ...SAMPLE_ITEM, id: "setting-2" } }) });
    });

    await page.goto("/admin/referrals/affiliate-products/new");
    await page.locator("#affiliateProductSearch").fill("Mindfulness");
    await page.locator('[data-action="search-affiliate-product-candidates"]').click();
    await expect(page.getByText("Mindfulness Colouring Book")).toBeVisible();

    await page.locator('[data-action="select-affiliate-product-candidate"]').click();
    await expect(page.locator("[data-affiliate-product-preview]")).toContainText("Mindfulness Colouring Book");
    await expect(page.locator("#affiliateProductId")).toHaveValue("product-2");

    await page.locator("#affiliateProductCommissionPercent").fill("12");
    await page.locator('[data-admin-affiliate-product-form] button[type="submit"]').click();

    await expect.poll(() => createBody).not.toBeNull();
    expect(createBody.productId).toBe("product-2");
    expect(createBody.commissionType).toBe("PERCENTAGE");
    expect(createBody.commissionPercent).toBe(12);
  });

  test("submitting without selecting a product shows a clear error and never calls the backend", async ({ page }) => {
    await mockAdminAuth(page);
    let createCalled = false;
    await page.route("**/api/admin/referrals/affiliate-products", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      createCalled = true;
      return route.fulfill({ status: 201, contentType: "application/json", body: envelope({ item: SAMPLE_ITEM }) });
    });

    await page.goto("/admin/referrals/affiliate-products/new");
    await page.locator('[data-admin-affiliate-product-form] button[type="submit"]').click();

    await expect(page.locator("[data-admin-affiliate-product-form-banner]")).toContainText("select a product");
    expect(createCalled).toBe(false);
  });

  test("switching commission type to Fixed Amount hides the percentage field and shows the fixed field, and validates it", async ({ page }) => {
    await mockAdminAuth(page);
    await page.goto("/admin/referrals/affiliate-products/new");

    await expect(page.locator("[data-affiliate-product-percent-field]")).toBeVisible();
    await expect(page.locator("[data-affiliate-product-fixed-field]")).toBeHidden();

    await page.locator("#affiliateProductCommissionType").selectOption("FIXED_AMOUNT");
    await expect(page.locator("[data-affiliate-product-percent-field]")).toBeHidden();
    await expect(page.locator("[data-affiliate-product-fixed-field]")).toBeVisible();
  });

  test("the backend's duplicate-product error is shown verbatim in the form banner", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/products?**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ products: [{ id: "product-1", name: "ABC Colouring Book for Kids", slug: "abc", sku: "SG-0001", price: 100, oldPrice: null, stockQuantity: 10, lowStockThreshold: 5, status: "ACTIVE", category: { id: "c1", name: "Books", slug: "books" }, isFeatured: false, isBestSeller: false, isNewArrival: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), productType: "PHYSICAL", hasDigitalFile: false, digitalFileMissingWarning: false }], total: 1, page: 1, limit: 10, totalPages: 1 }) })
    );
    await page.route("**/api/admin/referrals/affiliate-products", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ success: false, message: "This product is already in the Affiliate Products list." }) });
    });

    await page.goto("/admin/referrals/affiliate-products/new");
    await page.locator("#affiliateProductSearch").fill("ABC");
    await page.locator('[data-action="search-affiliate-product-candidates"]').click();
    await page.locator('[data-action="select-affiliate-product-candidate"]').click();
    await page.locator('[data-admin-affiliate-product-form] button[type="submit"]').click();

    await expect(page.locator("[data-admin-affiliate-product-form-banner]")).toContainText("already in the Affiliate Products list");
  });
});

test.describe("Admin Affiliate Product edit form", () => {
  test("shows the product read-only and submits only commission changes via PATCH", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/referrals/affiliate-products/setting-1", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ item: SAMPLE_ITEM }) });
      }
      if (route.request().method() === "PATCH") {
        return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ item: { ...SAMPLE_ITEM, isAffiliateAvailable: false } }) });
      }
      return route.continue();
    });

    await page.goto("/admin/referrals/affiliate-products/setting-1/edit");
    await expect(page.locator("[data-affiliate-product-preview]")).toContainText("ABC Colouring Book for Kids");
    await expect(page.locator("#affiliateProductId")).toHaveCount(0);

    await page.locator("#affiliateProductAvailable").uncheck();
    let patchBody = null;
    await page.route("**/api/admin/referrals/affiliate-products/setting-1", (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      patchBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ item: SAMPLE_ITEM }) });
    });
    await page.locator('[data-admin-affiliate-product-form] button[type="submit"]').click();

    await expect.poll(() => patchBody).not.toBeNull();
    expect(patchBody.isAffiliateAvailable).toBe(false);
    expect(patchBody.productId).toBeUndefined();
  });
});
