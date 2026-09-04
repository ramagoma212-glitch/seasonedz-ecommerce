// Milestone 181: Product Preorder System + First Registered Customer
// Preorder Discount — frontend display layer. Never submits checkout or
// creates a real order/payment, same discipline as
// tests/smoke/giftWrap.spec.js/stockAndDelivery.spec.js — every test
// here only adds items to the (localStorage) cart and views cart/
// checkout/product pages. Real discount computation, reservation/
// consumption/release, and stock-bypass logic are covered by
// backend/src/services/order.service.test.ts and
// backend/src/services/preorder.service.test.ts — reaching those same
// code paths here would require a real backend + a real Order row,
// which this project's test-safety rules forbid.
import { test, expect } from "@playwright/test";

const MOCK_CATEGORIES = [{ id: "cat-1", slug: "kids-colouring-books", name: "Kids Colouring Books", description: "", productCount: 2 }];

// Shape matching backend/src/services/product.service.ts's public
// ProductOutput (GET /api/products), extended with Milestone 181's own
// isPreorder/isPreorderDiscountEligible/preorderReleaseAt fields — same
// convention established in giftWrap.spec.js/stockAndDelivery.spec.js.
function mockProduct(overrides = {}) {
  return {
    id: "mock-product-id",
    name: "Mock Preorder Book",
    slug: "mock-preorder-book",
    sku: "MOCK-PREORDER-1",
    category: { id: "cat-1", name: "Kids Colouring Books", slug: "kids-colouring-books" },
    price: 120,
    oldPrice: null,
    stockQuantity: 0,
    stockStatus: "Out of Stock",
    image: "/images/product-1.jpg",
    gallery: ["/images/product-1.jpg"],
    shortDescription: "A mock preorder product for testing.",
    description: "A mock preorder product for testing.",
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
    isPreorder: true,
    isPreorderDiscountEligible: true,
    preorderReleaseAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

const PREORDER_PRODUCT = mockProduct();
const ORDINARY_PRODUCT = mockProduct({
  id: "mock-ordinary-id",
  slug: "mock-ordinary-book",
  name: "Mock Ordinary Book",
  stockQuantity: 5,
  stockStatus: "In Stock",
  isPreorder: false,
  isPreorderDiscountEligible: false,
  preorderReleaseAt: null,
});

async function mockCatalog(page, products) {
  await page.route("**/api/products", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { products } }) })
  );
  await page.route("**/api/categories", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { categories: MOCK_CATEGORIES } }) })
  );
}

async function mockPublicPreorderSettings(page, { enabled = true, percent = 10 } = {}) {
  await page.route("**/api/preorder/settings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, message: "OK", data: { firstRegisteredPreorderDiscountEnabled: enabled, firstRegisteredPreorderDiscountPercent: percent } }),
    })
  );
}

async function mockGuestCustomer(page) {
  await page.route("**/api/customers/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Not authenticated." }) })
  );
}

async function mockPreorderDiscountPreview(page, data) {
  await page.route("**/api/orders/preorder-discount-preview", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data }) })
  );
}

test.describe("Preorder Product: card and page display (Part J)", () => {
  test("product card shows a Preorder badge, availability text, and an enabled 'Add Preorder to Cart' button despite zero stock", async ({ page }) => {
    await mockCatalog(page, [PREORDER_PRODUCT, ORDINARY_PRODUCT]);
    await page.goto("/shop");

    const card = page.locator(".product-card", { hasText: PREORDER_PRODUCT.name });
    await expect(card.locator(".product-card__badge--preorder")).toHaveText("Preorder");
    await expect(card.locator(".product-card__preorder-note")).toContainText("Available from");
    const addButton = card.locator('[data-action="add-to-cart"]');
    await expect(addButton).toBeVisible();
    await expect(addButton).toBeEnabled();
    await expect(addButton).toHaveText("Add Preorder to Cart");
    // Never the ordinary "Out of Stock" block, even though stockQuantity is 0.
    await expect(card.locator('button:has-text("Out of Stock")')).toHaveCount(0);
  });

  test("ordinary in-stock product card never shows a Preorder badge (regression)", async ({ page }) => {
    await mockCatalog(page, [PREORDER_PRODUCT, ORDINARY_PRODUCT]);
    await page.goto("/shop");

    const card = page.locator(".product-card", { hasText: ORDINARY_PRODUCT.name });
    await expect(card.locator(".product-card__badge--preorder")).toHaveCount(0);
    await expect(card.locator('[data-action="add-to-cart"]')).toHaveText("Add to Cart");
  });

  test("product page shows Preorder badge, availability text, and the registered-customer offer note", async ({ page }) => {
    await mockCatalog(page, [PREORDER_PRODUCT]);
    await mockPublicPreorderSettings(page, { enabled: true, percent: 10 });
    await page.goto(`/product/${PREORDER_PRODUCT.slug}`);

    await expect(page.locator(".product-details__info .product-card__badge--preorder")).toHaveText("Preorder");
    await expect(page.locator(".product-details__preorder-note")).toContainText("Available from");
    await expect(page.locator(".product-details__preorder-offer")).toContainText("10% off your first qualifying preorder");

    const addButton = page.locator('[data-action="add-to-cart"]');
    await expect(addButton).toBeEnabled();
    await expect(addButton).toHaveText(/Add Preorder to Cart/);
  });

  test("product page never shows the registered-customer offer note when the Product is not discount-eligible", async ({ page }) => {
    await mockCatalog(page, [mockProduct({ isPreorderDiscountEligible: false })]);
    await mockPublicPreorderSettings(page, { enabled: true, percent: 10 });
    await page.goto(`/product/${PREORDER_PRODUCT.slug}`);

    await expect(page.locator(".product-details__preorder-offer")).toHaveCount(0);
  });
});

test.describe("Preorder Product: cart (Part K)", () => {
  test("an active preorder product with zero stock can be added to cart, labelled Preorder with its release date", async ({ page }) => {
    await mockCatalog(page, [PREORDER_PRODUCT]);
    await page.goto(`/product/${PREORDER_PRODUCT.slug}`);
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/cart");
    await expect(page.locator(".cart-item")).toHaveCount(1);
    await expect(page.locator(".cart-item .product-card__badge--preorder")).toHaveText("Preorder");
    await expect(page.locator(".cart-item__preorder-note")).toContainText("Available from");
  });

  test("a cart containing a preorder item shows the ship-together fulfilment notice", async ({ page }) => {
    await mockCatalog(page, [PREORDER_PRODUCT]);
    await page.goto(`/product/${PREORDER_PRODUCT.slug}`);
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/cart");
    await expect(page.locator("[data-cart-preorder-notice]")).toContainText("dispatched together once the preorder item becomes available");
  });

  test("a cart with no preorder items never shows the ship-together notice (regression)", async ({ page }) => {
    await mockCatalog(page, [ORDINARY_PRODUCT]);
    await page.goto(`/product/${ORDINARY_PRODUCT.slug}`);
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/cart");
    await expect(page.locator("[data-cart-preorder-notice]")).toHaveCount(0);
  });
});

test.describe("Preorder Product: checkout (Part L)", () => {
  test("checkout shows the ship-together fulfilment notice for a cart containing a preorder item", async ({ page }) => {
    await mockCatalog(page, [PREORDER_PRODUCT]);
    await mockGuestCustomer(page);
    await mockPreorderDiscountPreview(page, { qualifies: false, discountPercent: 10, discountAmount: 0, alreadyUsed: false });

    await page.goto(`/product/${PREORDER_PRODUCT.slug}`);
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/checkout");
    await expect(page.locator("[data-checkout-preorder-notice]")).toContainText("dispatched together once the preorder item becomes available");
  });

  test("a guest sees a professional invitation to sign in for the first-preorder discount, never applied", async ({ page }) => {
    await mockCatalog(page, [PREORDER_PRODUCT]);
    await mockGuestCustomer(page);
    await mockPreorderDiscountPreview(page, { qualifies: false, discountPercent: 10, discountAmount: 0, alreadyUsed: false });

    await page.goto(`/product/${PREORDER_PRODUCT.slug}`);
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/checkout");
    await expect(page.locator("[data-checkout-preorder-discount-notice]")).toContainText("Create an account or sign in to get 10% off your first qualifying preorder");
    await expect(page.locator("[data-order-summary-preorder-discount-row]")).toHaveCount(0);
  });

  test("checkout never shows a preorder notice for an ordinary cart (regression)", async ({ page }) => {
    await mockCatalog(page, [ORDINARY_PRODUCT]);
    await mockGuestCustomer(page);

    await page.goto(`/product/${ORDINARY_PRODUCT.slug}`);
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/checkout");
    await expect(page.locator("[data-checkout-preorder-notice]")).toHaveCount(0);
    await expect(page.locator("[data-checkout-preorder-discount-notice]")).toHaveCount(0);
  });
});
