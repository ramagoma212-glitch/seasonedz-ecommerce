// Version 7, Milestone 159: paid gift wrapping. Never submits checkout
// or creates a real order/payment — every test here only ever adds
// items to the (localStorage) cart, views the cart/checkout pages, and
// removes them, same discipline as tests/smoke/shop.spec.js. Backend
// eligibility re-derivation, R30/wrapped-item pricing math and
// tampering-resistance (a client cannot even express a price/fee in
// the request shape) are covered separately by direct code review and
// backend/prisma/scripts/verify-gift-wrap-159.mjs, documented in this
// milestone's own final report — reaching those same code paths here
// would require a real backend + a real Order row, which this
// milestone's rules explicitly forbid.
import { test, expect } from "@playwright/test";

const PHYSICAL_SLUG = "abc-colouring-book-for-kids-with-fun-facts";

const MOCK_CATEGORIES = [{ id: "cat-1", slug: "kids-colouring-books", name: "Kids Colouring Books", description: "", productCount: 1 }];

// Shape matching backend/src/services/product.service.ts's public
// ProductOutput (GET /api/products) — same convention
// tests/smoke/digitalDownloads.spec.js already established.
const MOCK_DIGITAL_PRODUCT = {
  id: "mock-digital-book",
  name: "Mock Digital Colouring Book",
  slug: "mock-digital-book",
  sku: "MOCK-DIGITAL-1",
  category: { id: "cat-1", name: "Kids Colouring Books", slug: "kids-colouring-books" },
  price: 49.99,
  oldPrice: null,
  stockQuantity: 0,
  stockStatus: "In Stock",
  image: "/images/product-1.jpg",
  gallery: ["/images/product-1.jpg"],
  shortDescription: "A mock digital product for testing.",
  description: "A mock digital product for testing.",
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
  productType: "DIGITAL",
  digitalDownload: { displayName: "Mock Digital Colouring Book (PDF)", fileType: "PDF", fileSizeBytes: 51200, pageCount: 8, version: null, termsNote: null },
};

async function mockDigitalCatalog(page) {
  await page.route("**/api/products", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { products: [MOCK_DIGITAL_PRODUCT] } }) })
  );
  await page.route("**/api/categories", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { categories: MOCK_CATEGORIES } }) })
  );
}

test.describe("Gift wrapping: product page eligibility and display", () => {
  test("physical product shows gift wrap option, unchecked, price visible before selection", async ({ page }) => {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    const section = page.locator("[data-gift-wrap-section]");
    await expect(section).toBeVisible();
    await expect(section).toContainText("R30");

    const checkbox = page.locator("#giftWrapCheckbox");
    await expect(checkbox).not.toBeChecked();
    await expect(page.locator("[data-gift-message-field]")).toBeHidden();
  });

  test("digital product does NOT show gift wrap option", async ({ page }) => {
    await mockDigitalCatalog(page);
    await page.goto(`/product/${MOCK_DIGITAL_PRODUCT.slug}`);
    await expect(page.locator(".product-details__digital-badge")).toBeVisible();
    await expect(page.locator("[data-gift-wrap-section]")).toHaveCount(0);
  });

  test("selecting the checkbox reveals the gift message field; unchecking hides it again", async ({ page }) => {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    const checkbox = page.locator("#giftWrapCheckbox");
    const messageField = page.locator("[data-gift-message-field]");

    await checkbox.check();
    await expect(messageField).toBeVisible();
    await expect(checkbox).toHaveAttribute("aria-expanded", "true");

    await checkbox.uncheck();
    await expect(messageField).toBeHidden();
    await expect(checkbox).toHaveAttribute("aria-expanded", "false");
  });

  test("gift message field enforces the 150 character limit", async ({ page }) => {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator("#giftWrapCheckbox").check();

    const textarea = page.locator("#giftMessageInput");
    await expect(textarea).toHaveAttribute("maxlength", "150");

    await textarea.fill("x".repeat(200));
    const value = await textarea.inputValue();
    expect(value.length).toBe(150);
  });
});

test.describe("Gift wrapping: cart behaviour", () => {
  test("unwrapped add to cart has no gift wrap fee or message", async ({ page }) => {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/cart");
    await expect(page.locator(".cart-item")).toHaveCount(1);
    await expect(page.locator(".cart-item__gift-wrap")).toHaveCount(0);
    await expect(page.locator(".order-summary__row", { hasText: "Gift wrapping" })).toHaveCount(0);
  });

  test("wrapped add to cart shows gift wrap line and quantity scales the fee (R30/R60/R90)", async ({ page }) => {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator("#giftWrapCheckbox").check();
    await page.locator("#giftMessageInput").fill("Happy Birthday, Naledi!");
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/cart");
    await expect(page.locator(".cart-item__gift-wrap")).toContainText("R30 each");
    await expect(page.locator(".cart-item__gift-message")).toContainText("Happy Birthday, Naledi!");
    await expect(page.locator(".order-summary__row", { hasText: "Gift wrapping" })).toContainText("R30.00");

    // qty 2 => R60 gift wrap total.
    await page.locator('[data-action="cart-increase"]').click();
    await expect(page.locator(".order-summary__row", { hasText: "Gift wrapping" })).toContainText("R60.00");

    // qty 3 => R90 gift wrap total.
    await page.locator('[data-action="cart-increase"]').click();
    await expect(page.locator(".order-summary__row", { hasText: "Gift wrapping" })).toContainText("R90.00");
  });

  test("wrapped and unwrapped copies of the same product coexist as separate cart lines", async ({ page }) => {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator('[data-action="add-to-cart"]').click(); // unwrapped

    await page.locator("#giftWrapCheckbox").check();
    await page.locator("#giftMessageInput").fill("For you!");
    await page.locator('[data-action="add-to-cart"]').click(); // wrapped

    await expect(page.locator('[data-badge="cart"]')).toHaveText("2");

    await page.goto("/cart");
    await expect(page.locator(".cart-item")).toHaveCount(2);
    await expect(page.locator(".cart-item__gift-wrap")).toHaveCount(1);
  });

  test("two wrapped adds with different messages do not merge (no message is lost)", async ({ page }) => {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator("#giftWrapCheckbox").check();
    await page.locator("#giftMessageInput").fill("Message A");
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator("#giftWrapCheckbox").check();
    await page.locator("#giftMessageInput").fill("Message B");
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/cart");
    await expect(page.locator(".cart-item")).toHaveCount(2);
    await expect(page.locator(".cart-item__gift-message").nth(0)).toContainText("Message A");
    await expect(page.locator(".cart-item__gift-message").nth(1)).toContainText("Message B");
  });

  test("two wrapped adds with the SAME message merge into one line (quantity increments)", async ({ page }) => {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator("#giftWrapCheckbox").check();
    await page.locator("#giftMessageInput").fill("Same message");
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator("#giftWrapCheckbox").check();
    await page.locator("#giftMessageInput").fill("Same message");
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/cart");
    await expect(page.locator(".cart-item")).toHaveCount(1);
    await expect(page.locator(".quantity-selector__input")).toHaveValue("2");
  });

  test("gift message renders safely (HTML/script in a message is never executed or rendered as markup)", async ({ page }) => {
    let dialogFired = false;
    page.on("dialog", (dialog) => {
      dialogFired = true;
      dialog.dismiss();
    });

    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator("#giftWrapCheckbox").check();
    await page.locator("#giftMessageInput").fill('<img src=x onerror="alert(1)">');
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/cart");
    await expect(page.locator(".cart-item__gift-message")).toContainText("<img src=x onerror=\"alert(1)\">");
    expect(await page.locator(".cart-item__gift-message img").count()).toBe(0);
    expect(dialogFired).toBe(false);
  });

  test("gift message survives navigation (persisted in the cart, not lost on reload)", async ({ page }) => {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator("#giftWrapCheckbox").check();
    await page.locator("#giftMessageInput").fill("Persisted message");
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/");
    await page.goto("/cart");
    await expect(page.locator(".cart-item__gift-message")).toContainText("Persisted message");
  });

  test("removing a wrapped line removes only that line", async ({ page }) => {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator('[data-action="add-to-cart"]').click(); // unwrapped

    await page.locator("#giftWrapCheckbox").check();
    await page.locator("#giftMessageInput").fill("Remove me");
    await page.locator('[data-action="add-to-cart"]').click(); // wrapped

    await page.goto("/cart");
    await expect(page.locator(".cart-item")).toHaveCount(2);

    const wrappedRow = page.locator(".cart-item", { has: page.locator(".cart-item__gift-wrap") });
    await wrappedRow.locator('[data-action="cart-remove"]').click();

    await expect(page.locator(".cart-item")).toHaveCount(1);
    await expect(page.locator(".cart-item__gift-wrap")).toHaveCount(0);
  });
});

test.describe("Gift wrapping: checkout summary and backwards compatibility", () => {
  test("checkout order summary includes the gift wrapping line and correct total", async ({ page }) => {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator("#giftWrapCheckbox").check();
    await page.locator('[data-action="add-to-cart"]').click();

    await page.goto("/checkout");
    await expect(page.locator(".order-summary__row", { hasText: "Gift wrapping" })).toContainText("R30.00");
  });

  test("digital product cannot acquire a gift-wrap fee via a manipulated cart payload", async ({ page }) => {
    await mockDigitalCatalog(page);
    await page.goto(`/product/${MOCK_DIGITAL_PRODUCT.slug}`);

    // No gift-wrap UI exists for this product at all (see the
    // eligibility test above), so this simulates a customer directly
    // editing Local Storage to force giftWrap:true onto a DIGITAL
    // line — cart.js's normalizeCartItem() must re-enforce the
    // physical-only rule on every read, the same authoritative check
    // order.service.ts's verifyItems() independently makes server-side.
    await page.evaluate(
      (product) => {
        localStorage.setItem(
          "seasonedz_cart",
          JSON.stringify([{ productId: product.id, slug: product.slug, name: product.name, price: product.price, image: product.image, productType: "DIGITAL", giftWrap: true, giftMessage: "Should never apply", quantity: 1 }])
        );
      },
      { id: MOCK_DIGITAL_PRODUCT.id, slug: MOCK_DIGITAL_PRODUCT.slug, name: MOCK_DIGITAL_PRODUCT.name, price: MOCK_DIGITAL_PRODUCT.price, image: MOCK_DIGITAL_PRODUCT.image }
    );

    await page.goto("/cart");
    await expect(page.locator(".cart-item__gift-wrap")).toHaveCount(0);
    await expect(page.locator(".order-summary__row", { hasText: "Gift wrapping" })).toHaveCount(0);
  });

  test("a pre-existing (old-style) cart entry with no lineId/giftWrap fields still works", async ({ page }) => {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.evaluate(() => {
      // Simulates a cart saved before Milestone 159 existed — no
      // lineId, no giftWrap, no giftMessage fields at all.
      localStorage.setItem(
        "seasonedz_cart",
        JSON.stringify([{ productId: "legacy-product", slug: "legacy-product", name: "Legacy Product", price: 75, image: "/images/product-1.jpg", quantity: 2 }])
      );
    });

    await page.goto("/cart");
    await expect(page.locator(".cart-item")).toHaveCount(1);
    await expect(page.locator(".cart-item__gift-wrap")).toHaveCount(0);
    await expect(page.locator(".cart-item__line-total")).toContainText("150.00");

    // Still fully mutable via the normal quantity/remove controls.
    await page.locator('[data-action="cart-increase"]').click();
    await expect(page.locator(".quantity-selector__input")).toHaveValue("3");
    await page.locator('[data-action="cart-remove"]').click();
    await expect(page.locator(".cart-item")).toHaveCount(0);
  });
});
