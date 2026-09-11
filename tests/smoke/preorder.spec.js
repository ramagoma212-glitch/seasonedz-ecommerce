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

// Milestone 181A: `minimum` defaults to the real owner-approved R200.00.
async function mockPublicPreorderSettings(page, { enabled = true, percent = 10, minimum = 200 } = {}) {
  await page.route("**/api/preorder/settings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "OK",
        data: { firstRegisteredPreorderDiscountEnabled: enabled, firstRegisteredPreorderDiscountPercent: percent, minimumEligiblePreorderSubtotal: minimum },
      }),
    })
  );
}

async function mockGuestCustomer(page) {
  await page.route("**/api/customers/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Not authenticated." }) })
  );
}

async function mockLoggedInCustomer(page) {
  await page.route("**/api/customers/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "OK",
        data: { customer: { id: "mock-customer-id", email: "mock-smoke-test@example.com", firstName: "Mock", lastName: "Smoke", phone: "0821234567", type: "REGISTERED" } },
      }),
    })
  );
}

// Milestone 181A: `data` must always be a full PreorderDiscountPreviewResult
// shape (see backend's order.service.ts) — eligibleSubtotal/
// minimumEligibleSubtotal defaulted here so every existing call site
// that only cares about qualifies/discountPercent/alreadyUsed doesn't
// have to repeat them, but a test asserting the "add RXX more" message
// must still pass its own eligibleSubtotal explicitly.
async function mockPreorderDiscountPreview(page, data) {
  await page.route("**/api/orders/preorder-discount-preview", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, message: "OK", data: { eligibleSubtotal: 0, minimumEligibleSubtotal: 200, ...data } }),
    })
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
    // Milestone 181A: states the real, currently-configured minimum spend.
    await expect(page.locator(".product-details__preorder-offer")).toContainText("Get 10% off your first qualifying preorder when eligible preorder items total R200.00 or more.");

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

  test("a guest sees a professional invitation to sign in for the first-preorder discount, stating the R200 minimum, never applied", async ({ page }) => {
    await mockCatalog(page, [PREORDER_PRODUCT]);
    await mockGuestCustomer(page);
    await mockPreorderDiscountPreview(page, { qualifies: false, discountPercent: 10, discountAmount: 0, alreadyUsed: false });

    await page.goto(`/product/${PREORDER_PRODUCT.slug}`);
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/checkout");
    await expect(page.locator("[data-checkout-preorder-discount-notice]")).toContainText(
      "Create an account or sign in to get 10% off your first qualifying preorder of R200.00 or more."
    );
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

// ---------------------------------------------------------------------------
// Milestone 181A: owner rule change — the first-preorder discount now only
// applies once the eligible preorder subtotal reaches R200.00 (a programme-
// level minimum). Real qualification/reservation math is covered by
// backend/src/services/order.service.test.ts — these tests only prove the
// frontend correctly displays whatever the (mocked) backend preview says,
// on both Cart (new this milestone) and Checkout.
// ---------------------------------------------------------------------------

test.describe("Milestone 181A: R200 minimum — Cart page messaging", () => {
  test("registered customer below the R200 minimum sees a dynamic 'add RXX more' notice on Cart", async ({ page }) => {
    await mockCatalog(page, [PREORDER_PRODUCT]); // R120
    await mockLoggedInCustomer(page);
    await mockPreorderDiscountPreview(page, { qualifies: false, discountPercent: 10, discountAmount: 0, alreadyUsed: false, eligibleSubtotal: 120, minimumEligibleSubtotal: 200 });

    await page.goto(`/product/${PREORDER_PRODUCT.slug}`);
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/cart");
    await expect(page.locator("[data-cart-preorder-discount-notice]")).toContainText("Add R80.00 more in eligible preorder items to qualify for 10% off your first preorder.");
  });

  test("guest sees a sign-in invitation stating the R200 minimum on Cart", async ({ page }) => {
    await mockCatalog(page, [PREORDER_PRODUCT]);
    await mockGuestCustomer(page);
    await mockPreorderDiscountPreview(page, { qualifies: false, discountPercent: 10, discountAmount: 0, alreadyUsed: false });

    await page.goto(`/product/${PREORDER_PRODUCT.slug}`);
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/cart");
    await expect(page.locator("[data-cart-preorder-discount-notice]")).toContainText("Create an account or sign in to get 10% off your first qualifying preorder of R200.00 or more.");
  });

  test("a registered customer who already used the benefit sees that message on Cart, never a misleading 'add RXX more'", async ({ page }) => {
    await mockCatalog(page, [PREORDER_PRODUCT]);
    await mockLoggedInCustomer(page);
    await mockPreorderDiscountPreview(page, { qualifies: false, discountPercent: 10, discountAmount: 0, alreadyUsed: true, eligibleSubtotal: 120, minimumEligibleSubtotal: 200 });

    await page.goto(`/product/${PREORDER_PRODUCT.slug}`);
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/cart");
    await expect(page.locator("[data-cart-preorder-discount-notice]")).toContainText("You have already used your first-preorder discount on a previous order.");
  });

  test("a cart with no eligible preorder items never shows the discount notice on Cart (regression)", async ({ page }) => {
    await mockCatalog(page, [ORDINARY_PRODUCT]);
    await mockLoggedInCustomer(page);

    await page.goto(`/product/${ORDINARY_PRODUCT.slug}`);
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/cart");
    await expect(page.locator("[data-cart-preorder-discount-notice]")).toHaveCount(0);
  });
});

test.describe("Milestone 181A: R200 minimum — Checkout order summary", () => {
  test("below the minimum: the 'add RXX more' notice shows and the First Preorder Discount row stays hidden (Part H, never -R0.00)", async ({ page }) => {
    await mockCatalog(page, [PREORDER_PRODUCT]); // R120
    await mockLoggedInCustomer(page);
    await mockPreorderDiscountPreview(page, { qualifies: false, discountPercent: 10, discountAmount: 0, alreadyUsed: false, eligibleSubtotal: 120, minimumEligibleSubtotal: 200 });

    await page.goto(`/product/${PREORDER_PRODUCT.slug}`);
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/checkout");
    await expect(page.locator("[data-checkout-preorder-discount-notice]")).toContainText("Add R80.00 more in eligible preorder items to qualify for 10% off your first preorder.");
    await expect(page.locator("[data-order-summary-preorder-discount-row]")).toHaveCount(0);
  });

  test("at exactly the R200 minimum: the First Preorder Discount row shows the real 10% amount, and no progress notice", async ({ page }) => {
    await mockCatalog(page, [PREORDER_PRODUCT]);
    await mockLoggedInCustomer(page);
    await mockPreorderDiscountPreview(page, { qualifies: true, discountPercent: 10, discountAmount: 20, alreadyUsed: false, eligibleSubtotal: 200, minimumEligibleSubtotal: 200 });

    await page.goto(`/product/${PREORDER_PRODUCT.slug}`);
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/checkout");
    await expect(page.locator("[data-order-summary-preorder-discount-row]")).toContainText("-R20.00");
    await expect(page.locator("[data-checkout-preorder-discount-notice]")).toHaveCount(0);
  });
});
