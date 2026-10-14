// Milestone 197.1: coupon free-delivery benefit. Never submits a real
// checkout/order and never applies a real admin coupon change — every
// backend call is mocked, same discipline as the rest of this suite
// (stockAndDelivery.spec.js, adminAffiliateProducts.spec.js).
import { test, expect } from "@playwright/test";

function envelope(data) {
  return JSON.stringify({ success: true, message: "OK", data });
}

function mockAdminAuth(page) {
  return page.route("**/api/admin/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ id: "admin-1", email: "owner@example.invalid" }) }));
}

const MOCK_CATEGORIES = [{ id: "cat-1", slug: "kids-colouring-books", name: "Kids Colouring Books", description: "", productCount: 1 }];

function mockProduct(overrides = {}) {
  return {
    id: "mock-product-id",
    name: "Mock Colouring Book",
    slug: "mock-colouring-book",
    sku: "MOCK-FD-1",
    category: { id: "cat-1", name: "Kids Colouring Books", slug: "kids-colouring-books" },
    price: 300,
    oldPrice: null,
    stockQuantity: 10,
    stockStatus: "In Stock",
    image: "/images/product-1.jpg",
    gallery: ["/images/product-1.jpg"],
    shortDescription: "A mock product for free-delivery coupon testing.",
    description: "A mock product for free-delivery coupon testing.",
    features: [],
    ageRange: "3-8 years",
    tags: [],
    ratingAverage: 0,
    reviewCount: 0,
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    discountLabel: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    productType: "PHYSICAL",
    digitalDownload: null,
    ...overrides,
  };
}

const MOCK_PRODUCT = mockProduct();

async function mockCatalog(page) {
  await page.route("**/api/products", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { products: [MOCK_PRODUCT] } }) })
  );
  await page.route("**/api/categories", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { categories: MOCK_CATEGORIES } }) })
  );
}

async function addItemAndGoToCheckout(page) {
  await mockCatalog(page);
  await page.goto(`/product/${MOCK_PRODUCT.slug}`);
  await page.locator('[data-action="add-to-cart"]').click();
  await page.goto("/checkout");
  await page.locator('input[name="deliveryMethod"][value="COURIER_DOOR"]').check();
}

test.describe("Admin coupon form: free delivery (Milestone 197.1)", () => {
  test("the Include free delivery checkbox exists, defaults off, and is included on create", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/products?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ products: [], total: 0, page: 1, limit: 50, totalPages: 1 }) }));
    await page.route("**/api/categories", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ categories: [] }) }));

    let submittedBody = null;
    await page.route("**/api/admin/coupons", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      submittedBody = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: envelope({ id: "coupon-1", code: "FESTIVECUP", discountType: "PERCENTAGE", discountValue: 10, freeDelivery: true, isActive: true, timesRedeemed: 0, maxTotalUses: null }),
      });
    });

    await page.goto("/admin/coupons/new");
    const checkbox = page.locator("#couponFreeDelivery");
    await expect(checkbox).not.toBeChecked();

    await page.locator("#couponCode").fill("FESTIVECUP");
    await page.locator("#couponDiscountValue").fill("10");
    await checkbox.check();
    await page.locator('[data-admin-coupon-form] button[type="submit"]').click();

    await expect.poll(() => submittedBody).toBeTruthy();
    expect(submittedBody.freeDelivery).toBe(true);
  });

  test("editing an existing free-delivery coupon shows the checkbox already checked", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/products?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ products: [], total: 0, page: 1, limit: 50, totalPages: 1 }) }));
    await page.route("**/api/categories", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ categories: [] }) }));
    await page.route("**/api/admin/coupons/coupon-1", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({
          id: "coupon-1",
          code: "FESTIVECUP",
          description: null,
          isActive: true,
          discountType: "PERCENTAGE",
          discountValue: 10,
          minimumOrderSubtotal: null,
          maximumDiscountAmount: null,
          startsAt: null,
          expiresAt: null,
          maxTotalUses: null,
          maxUsesPerCustomer: null,
          timesRedeemed: 0,
          customerEligibility: "ALL",
          freeDelivery: true,
          includedProducts: [],
          includedCategories: [],
          excludedProducts: [],
        }),
      })
    );

    await page.goto("/admin/coupons/coupon-1/edit");
    await expect(page.locator("#couponFreeDelivery")).toBeChecked();
  });
});

test.describe("Admin coupon list: free delivery indicator (Milestone 197.1)", () => {
  test("a free-delivery coupon shows '+ free delivery' next to its discount", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/coupons", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope([
          {
            id: "coupon-1",
            code: "FESTIVECUP",
            isActive: true,
            discountType: "PERCENTAGE",
            discountValue: 10,
            maximumDiscountAmount: null,
            freeDelivery: true,
            timesRedeemed: 0,
            maxTotalUses: null,
            startsAt: null,
            expiresAt: null,
            totalDiscountGranted: 0,
          },
        ]),
      });
    });

    await page.goto("/admin/coupons");
    await expect(page.getByText("10% off + free delivery")).toBeVisible();
  });
});

test.describe("Checkout: applying a free-delivery coupon (Milestone 197.1)", () => {
  test("a valid freeDelivery coupon zeroes the delivery row and shows the benefit, matching the brief's own worked example", async ({ page }) => {
    await addItemAndGoToCheckout(page);
    await expect(page.locator(".order-summary__row", { hasText: "Courier Guy Door to Door" }).getByText("R120.00")).toBeVisible();

    await page.route("**/api/coupons/preview", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ valid: true, message: "Coupon applied.", code: "FESTIVECUP", discountAmount: 30, freeDelivery: true }) })
    );

    await page.locator("#couponCodeInput").fill("FESTIVECUP");
    await page.locator('[data-coupon-apply-form] button[type="submit"]').click();

    const deliveryRow = page.locator(".order-summary__row", { hasText: "Courier Guy Door to Door" });
    await expect(deliveryRow.getByText("FREE")).toBeVisible();
    await expect(page.locator("[data-coupon-applied-benefits]")).toHaveText("R30.00 discount + free delivery");
    await expect(page.locator("[data-order-summary-total-value]")).toHaveText("R270.00");
    await expect(page.locator("[data-order-summary-delivery-note]")).toHaveText("Free delivery applied with FESTIVECUP.");
  });

  test("removing the coupon restores the normal paid delivery fee and the normal total", async ({ page }) => {
    await addItemAndGoToCheckout(page);

    await page.route("**/api/coupons/preview", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ valid: true, message: "Coupon applied.", code: "FESTIVECUP", discountAmount: 30, freeDelivery: true }) })
    );
    await page.locator("#couponCodeInput").fill("FESTIVECUP");
    await page.locator('[data-coupon-apply-form] button[type="submit"]').click();
    await expect(page.locator(".order-summary__row", { hasText: "Courier Guy Door to Door" }).getByText("FREE")).toBeVisible();

    await page.locator('[data-action="remove-coupon"]').click();

    const deliveryRow = page.locator(".order-summary__row", { hasText: "Courier Guy Door to Door" });
    await expect(deliveryRow.getByText("R120.00")).toBeVisible();
    // R300 subtotal + R120 delivery, no discount — both benefits gone together.
    await expect(page.locator("[data-order-summary-total-value]")).toHaveText("R420.00");
  });

  test("a coupon WITHOUT the free-delivery benefit never shows FREE and never says so", async ({ page }) => {
    await addItemAndGoToCheckout(page);

    await page.route("**/api/coupons/preview", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ valid: true, message: "Coupon applied.", code: "WELCOME10", discountAmount: 30, freeDelivery: false }) })
    );
    await page.locator("#couponCodeInput").fill("WELCOME10");
    await page.locator('[data-coupon-apply-form] button[type="submit"]').click();

    const deliveryRow = page.locator(".order-summary__row", { hasText: "Courier Guy Door to Door" });
    await expect(deliveryRow.getByText("R120.00")).toBeVisible();
    await expect(page.locator("[data-coupon-applied-benefits]")).toHaveText("R30.00 discount");
    await expect(page.locator("[data-coupon-applied-benefits]")).not.toContainText("free delivery");
  });

  test("an invalid coupon code never grants free delivery — the error shows and delivery stays unchanged", async ({ page }) => {
    await addItemAndGoToCheckout(page);

    await page.route("**/api/coupons/preview", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ valid: false, message: "Coupon code not found.", code: "NOTREAL", discountAmount: 0, freeDelivery: false }) })
    );
    await page.locator("#couponCodeInput").fill("NOTREAL");
    await page.locator('[data-coupon-apply-form] button[type="submit"]').click();

    await expect(page.locator("[data-coupon-error]")).toHaveText("Coupon code not found.");
    await expect(page.locator(".order-summary__row", { hasText: "Courier Guy Door to Door" }).getByText("R120.00")).toBeVisible();
  });

  test("a free-delivery coupon on Customer Collection leaves it at FREE, never a negative amount shown", async ({ page }) => {
    await mockCatalog(page);
    await page.goto(`/product/${MOCK_PRODUCT.slug}`);
    await page.locator('[data-action="add-to-cart"]').click();
    await page.goto("/checkout");
    await page.locator('input[name="deliveryMethod"][value="COLLECTION"]').check();

    await page.route("**/api/coupons/preview", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ valid: true, message: "Coupon applied.", code: "FESTIVECUP", discountAmount: 30, freeDelivery: true }) })
    );
    await page.locator("#couponCodeInput").fill("FESTIVECUP");
    await page.locator('[data-coupon-apply-form] button[type="submit"]').click();

    await expect(page.locator(".order-summary__row", { hasText: "Customer Collection" }).getByText("FREE")).toBeVisible();
    await expect(page.locator("[data-order-summary-delivery-note]")).toHaveText("Customer Collection is free, with no minimum order.");
  });
});
