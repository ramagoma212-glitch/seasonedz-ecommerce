// Version 7, Milestone 171E: out-of-stock cart protection and the
// checkout Order Summary's "no delivery fee before selection" fix.
// Never submits checkout or creates a real order — same discipline as
// giftWrap.spec.js/deliveryMethods.spec.js.
import { test, expect } from "@playwright/test";

const PHYSICAL_SLUG = "abc-colouring-book-for-kids-with-fun-facts";

const MOCK_CATEGORIES = [{ id: "cat-1", slug: "kids-colouring-books", name: "Kids Colouring Books", description: "", productCount: 2 }];

// Shape matching backend/src/services/product.service.ts's public
// ProductOutput (GET /api/products) — same convention established in
// giftWrap.spec.js/digitalDownloads.spec.js.
function mockProduct(overrides = {}) {
  return {
    id: "mock-product-id",
    name: "Mock Out of Stock Book",
    slug: "mock-out-of-stock-book",
    sku: "MOCK-OOS-1",
    category: { id: "cat-1", name: "Kids Colouring Books", slug: "kids-colouring-books" },
    price: 120,
    oldPrice: null,
    stockQuantity: 0,
    stockStatus: "Out of Stock",
    image: "/images/product-1.jpg",
    gallery: ["/images/product-1.jpg"],
    shortDescription: "A mock out-of-stock product for testing.",
    description: "A mock out-of-stock product for testing.",
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

const MOCK_OUT_OF_STOCK_PRODUCT = mockProduct();
const MOCK_IN_STOCK_PRODUCT = mockProduct({ id: "mock-in-stock-id", slug: "mock-in-stock-book", name: "Mock In Stock Book", stockQuantity: 5, stockStatus: "In Stock" });
const MOCK_OUT_OF_STOCK_DIGITAL = mockProduct({
  id: "mock-oos-digital-id",
  slug: "mock-oos-digital-book",
  name: "Mock Digital Book",
  productType: "DIGITAL",
  stockQuantity: 0,
  stockStatus: "Out of Stock",
  digitalDownload: { displayName: "Mock Digital Book.pdf", fileType: "PDF", fileSizeBytes: 51200, pageCount: 8, version: null, termsNote: null },
});

async function mockCatalog(page, products) {
  await page.route("**/api/products", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { products } }) })
  );
  await page.route("**/api/categories", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { categories: MOCK_CATEGORIES } }) })
  );
}

test.describe("Out-of-stock cart protection (Milestone 171E, Part 2-5)", () => {
  test("out-of-stock product card shows an Out of Stock badge, Add to Cart is disabled", async ({ page }) => {
    await mockCatalog(page, [MOCK_OUT_OF_STOCK_PRODUCT, MOCK_IN_STOCK_PRODUCT]);
    await page.goto("/shop");

    const card = page.locator(".product-card", { hasText: MOCK_OUT_OF_STOCK_PRODUCT.name });
    await expect(card.locator(".product-card__stock--out")).toHaveText("Out of Stock");
    const addButton = card.locator('button:has-text("Out of Stock")');
    await expect(addButton).toBeDisabled();
    await expect(card.locator('[data-action="add-to-cart"]')).toHaveCount(0);
  });

  test("in-stock product card still shows a working Add to Cart button", async ({ page }) => {
    await mockCatalog(page, [MOCK_OUT_OF_STOCK_PRODUCT, MOCK_IN_STOCK_PRODUCT]);
    await page.goto("/shop");

    const card = page.locator(".product-card", { hasText: MOCK_IN_STOCK_PRODUCT.name });
    await expect(card.locator('[data-action="add-to-cart"]')).toBeEnabled();
    await card.locator('[data-action="add-to-cart"]').click();
    await expect(page.locator('[data-badge="cart"]')).toHaveText("1");
  });

  test("out-of-stock product detail page shows Out of Stock, Add to Cart and quantity controls are disabled", async ({ page }) => {
    await mockCatalog(page, [MOCK_OUT_OF_STOCK_PRODUCT]);
    await page.goto(`/product/${MOCK_OUT_OF_STOCK_PRODUCT.slug}`);

    await expect(page.locator(".product-details__stock--out")).toHaveText("Out of Stock");
    const addButton = page.locator(".product-details__add-to-cart");
    await expect(addButton).toBeDisabled();
    await expect(addButton).toHaveText("Out of Stock");
    await expect(page.locator('[data-action="qty-increase"]')).toBeDisabled();
    await expect(page.locator('[data-action="qty-decrease"]')).toBeDisabled();
  });

  test("out-of-stock product can still be added to Wishlist from the product card", async ({ page }) => {
    await mockCatalog(page, [MOCK_OUT_OF_STOCK_PRODUCT]);
    await page.goto("/shop");

    const card = page.locator(".product-card", { hasText: MOCK_OUT_OF_STOCK_PRODUCT.name });
    const wishlistButton = card.locator('[data-action="toggle-wishlist"]');
    await expect(wishlistButton).toBeEnabled();
    await wishlistButton.click();
    await expect(page.locator('[data-badge="wishlist"]')).toHaveText("1");
  });

  test("out-of-stock product can still be added to Wishlist from the product detail page", async ({ page }) => {
    await mockCatalog(page, [MOCK_OUT_OF_STOCK_PRODUCT]);
    await page.goto(`/product/${MOCK_OUT_OF_STOCK_PRODUCT.slug}`);

    const wishlistButton = page.locator(".product-details__wishlist-btn");
    await expect(wishlistButton).toBeEnabled();
    await wishlistButton.click();
    await expect(page.locator('[data-badge="wishlist"]')).toHaveText("1");
  });

  test("wishlist page shows Out of Stock and a disabled Add to Cart for an item that's since sold out, Remove still works", async ({ page }) => {
    await mockCatalog(page, [MOCK_OUT_OF_STOCK_PRODUCT]);
    await page.goto("/shop");
    await page.locator('.product-card [data-action="toggle-wishlist"]').click();

    await page.goto("/wishlist");
    const item = page.locator(".wishlist-item", { hasText: MOCK_OUT_OF_STOCK_PRODUCT.name });
    await expect(item.locator(".product-card__stock--out")).toHaveText("Out of Stock");
    const addButton = item.locator('button:has-text("Out of Stock")');
    await expect(addButton).toBeDisabled();

    // Removing still works — being out of stock never auto-removes a
    // wishlist item, and the customer can always remove it themselves.
    await item.locator('[data-action="wishlist-remove"]').click();
    await expect(page.locator(".wishlist-item")).toHaveCount(0);
  });

  test("digital product is never treated as out of stock for cart purposes, even with stockQuantity 0", async ({ page }) => {
    await mockCatalog(page, [MOCK_OUT_OF_STOCK_DIGITAL]);
    await page.goto("/shop");

    const card = page.locator(".product-card", { hasText: MOCK_OUT_OF_STOCK_DIGITAL.name });
    await expect(card.locator('[data-action="add-to-cart"]')).toBeEnabled();
    await expect(card.locator('button:has-text("Out of Stock")')).toHaveCount(0);
  });

  test("a cart item that has since gone out of stock is flagged on the cart page and blocks Proceed to Checkout", async ({ page }) => {
    // Add while in stock...
    await mockCatalog(page, [MOCK_IN_STOCK_PRODUCT]);
    await page.goto("/shop");
    await page.locator('[data-action="add-to-cart"]').click();

    // ...then the same product goes out of stock before the cart page
    // re-fetches live data (simulates the Part 6 scenario exactly).
    await mockCatalog(page, [{ ...MOCK_IN_STOCK_PRODUCT, stockQuantity: 0, stockStatus: "Out of Stock" }]);
    await page.goto("/cart");

    const item = page.locator(".cart-item--unavailable");
    await expect(item).toBeVisible();
    await expect(item.locator(".cart-item__stock-badge")).toHaveText("Out of Stock");
    await expect(item.locator('[data-action="cart-increase"]')).toBeDisabled();
    await expect(item.locator('[data-action="cart-decrease"]')).toBeDisabled();

    // Checkout is blocked from the cart page...
    await expect(page.locator(".order-summary button:has-text(\"Proceed to Checkout\")")).toBeDisabled();
    await expect(page.locator(".order-summary a:has-text(\"Proceed to Checkout\")")).toHaveCount(0);

    // ...and independently blocked on the checkout page itself, with a
    // clear explanation, even if reached directly.
    await page.goto("/checkout");
    await expect(page.locator("[data-checkout-unavailable-notice]")).toContainText("no longer available");
    await expect(page.locator("[data-checkout-unavailable-notice]")).toContainText(MOCK_IN_STOCK_PRODUCT.name);
    await expect(page.locator("[data-checkout-submit]")).toBeDisabled();

    // Removing it (back on the cart page) clears the blocker.
    await page.goto("/cart");
    await page.locator(".cart-item--unavailable [data-action=\"cart-remove\"]").click();
    await expect(page.locator(".cart-item")).toHaveCount(0);
  });
});

test.describe("Checkout Order Summary: no delivery fee before selection (Milestone 171E, Part 11-21)", () => {
  async function addPhysicalItemAndGoToCheckout(page) {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator('[data-action="add-to-cart"]').click();
    await page.goto("/checkout");
  }

  test("before any delivery method is selected: no R100/R120 fee, Total excludes delivery, neutral row text, nothing pre-checked", async ({ page }) => {
    await addPhysicalItemAndGoToCheckout(page);

    const deliveryRow = page.locator(".order-summary__row", { hasText: "Delivery" });
    await expect(deliveryRow.getByText("Select a delivery option")).toBeVisible();
    await expect(deliveryRow.getByText("R100.00")).toHaveCount(0);
    await expect(deliveryRow.getByText("R120.00")).toHaveCount(0);
    // Never a misleading "already free" either.
    await expect(deliveryRow.getByText("FREE")).toHaveCount(0);

    const subtotalText = await page.locator(".order-summary__row", { hasText: "Subtotal" }).locator("span").nth(1).textContent();
    const totalText = await page.locator(".order-summary__row--total span").nth(1).textContent();
    expect(totalText?.trim()).toBe(subtotalText?.trim());

    await expect(page.locator('input[name="deliveryMethod"]:checked')).toHaveCount(0);
    await expect(page.locator("[data-delivery-address-fields]")).toBeHidden();
    await expect(page.locator("[data-collection-fields]")).toBeHidden();
  });

  test("selecting Courier Guy Locker to Locker below R600 adds exactly R100", async ({ page }) => {
    await addPhysicalItemAndGoToCheckout(page);
    await page.locator('input[name="deliveryMethod"][value="COURIER_LOCKER"]').check();

    await expect(page.locator(".order-summary__row", { hasText: "Courier Guy Locker to Locker" }).getByText("R100.00")).toBeVisible();
  });

  test("selecting Courier Guy Door to Door below R600 adds exactly R120", async ({ page }) => {
    await addPhysicalItemAndGoToCheckout(page);
    await page.locator('input[name="deliveryMethod"][value="COURIER_DOOR"]').check();

    await expect(page.locator(".order-summary__row", { hasText: "Courier Guy Door to Door" }).getByText("R120.00")).toBeVisible();
  });

  test("selecting Customer Collection is always FREE, regardless of subtotal", async ({ page }) => {
    await addPhysicalItemAndGoToCheckout(page);
    await page.locator('input[name="deliveryMethod"][value="COLLECTION"]').check();

    await expect(page.locator(".order-summary__row", { hasText: "Customer Collection" }).getByText("FREE")).toBeVisible();
  });

  test("physical checkout cannot submit without a delivery method — clear validation message, never a silent default", async ({ page }) => {
    await addPhysicalItemAndGoToCheckout(page);

    await page.locator("#firstName").fill("Thandiwe");
    await page.locator("#lastName").fill("Nkosi");
    await page.locator("#email").fill("thandiwe@example.com");
    await page.locator("#phone").fill("0821234567");
    // Deliberately never selects a delivery method.
    await page.locator('input[name="paymentMethod"][value="bank-transfer"]').check();

    let orderRequestSent = false;
    await page.route("**/api/orders", (route) => {
      orderRequestSent = true;
      route.continue();
    });

    await page.locator('#checkout-form button[type="submit"]').click();
    await expect(page.locator('[data-error-for="deliveryMethod"]')).toHaveText("Please select a delivery method.");
    await expect(page).toHaveURL(/\/checkout/);
    expect(orderRequestSent).toBe(false);
  });

  test("digital-only cart shows R0/no-delivery-required immediately, regardless of any delivery method selection", async ({ page }) => {
    await mockCatalog(page, [MOCK_OUT_OF_STOCK_DIGITAL]);
    // The digital product itself is out of stock in name only — DIGITAL
    // availability is never governed by stockQuantity (see the stock
    // section above), so it's still addable to cart here.
    await page.goto("/shop");
    await page.locator('[data-action="add-to-cart"]').click();
    await page.goto("/checkout");

    // Version 7, Milestone 168C (preserved, unchanged by this
    // milestone): the delivery-method fieldset itself isn't
    // conditionally hidden for a digital-only cart — only the FEE
    // calculation is (getCartSummary() returns 0 whenever
    // composition.hasPhysical is false, regardless of method or even
    // no method at all). This milestone's own scope is the fee/Total
    // display, not restructuring the fieldset's visibility.
    await expect(page.locator(".order-summary__row", { hasText: "Delivery" }).getByText("FREE")).toBeVisible();
    await expect(page.locator('[data-checkout-submit]')).not.toBeDisabled();
  });

  test("mixed cart (physical + digital): delivery threshold is judged on the physical subtotal only, and still requires an explicit method", async ({ page }) => {
    const physicalProduct = mockProduct({ id: "mock-mixed-physical", slug: "mock-mixed-physical", name: "Mixed Physical Book", price: 100, stockQuantity: 5, stockStatus: "In Stock" });
    const digitalProduct = mockProduct({
      id: "mock-mixed-digital",
      slug: "mock-mixed-digital",
      name: "Mixed Digital Book",
      price: 600,
      productType: "DIGITAL",
      digitalDownload: { displayName: "Mixed Digital Book.pdf", fileType: "PDF", fileSizeBytes: 51200, pageCount: 8, version: null, termsNote: null },
    });
    await mockCatalog(page, [physicalProduct, digitalProduct]);

    await page.goto("/shop");
    const addButtons = page.locator('[data-action="add-to-cart"]');
    await addButtons.nth(0).click();
    await addButtons.nth(1).click();
    await page.goto("/checkout");

    // Combined subtotal is R700 (>= R600), but the qualifying PHYSICAL
    // subtotal alone is only R100 — the R600-priced digital item must
    // never help the physical delivery qualify for free shipping.
    await expect(page.locator(".order-summary__row", { hasText: "Delivery" }).getByText("Select a delivery option")).toBeVisible();
    await page.locator('input[name="deliveryMethod"][value="COURIER_DOOR"]').check();
    await expect(page.locator(".order-summary__row", { hasText: "Courier Guy Door to Door" }).getByText("R120.00")).toBeVisible();
  });

  test("switching between delivery methods updates the fee and Total live, never keeping a stale amount", async ({ page }) => {
    await addPhysicalItemAndGoToCheckout(page);

    await page.locator('input[name="deliveryMethod"][value="COURIER_LOCKER"]').check();
    await expect(page.locator(".order-summary__row", { hasText: "Courier Guy Locker to Locker" }).getByText("R100.00")).toBeVisible();

    await page.locator('input[name="deliveryMethod"][value="COURIER_DOOR"]').check();
    await expect(page.locator(".order-summary__row", { hasText: "Courier Guy Door to Door" }).getByText("R120.00")).toBeVisible();
    // The old Locker fee row is gone — replaced, not appended.
    await expect(page.locator(".order-summary__row", { hasText: "Courier Guy Locker to Locker" })).toHaveCount(0);

    await page.locator('input[name="deliveryMethod"][value="COLLECTION"]').check();
    await expect(page.locator(".order-summary__row", { hasText: "Customer Collection" }).getByText("FREE")).toBeVisible();
    await expect(page.locator(".order-summary__row", { hasText: "Courier Guy Door to Door" })).toHaveCount(0);
  });
});
