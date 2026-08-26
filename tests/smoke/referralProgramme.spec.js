// Version 7, Milestone 172B.4: referral capture, checkout discount
// preview and clearing — the frontend half of the referral discount/
// commission programme. Same "never submit checkout for real"
// discipline as giftWrap.spec.js/deliveryMethods.spec.js: the one test
// that does submit checkout fully intercepts POST /api/orders with a
// fake success response, so no real order is ever created. Every real
// financial calculation (Decimal rounding, self-referral, expiry,
// signature tampering) is covered by backend unit tests instead — this
// file only proves the frontend wires the pieces together correctly:
// capture happens, the token is stored and relayed unchanged, the
// preview renders, and the discount is included/excluded correctly.
import { test, expect } from "@playwright/test";

const PHYSICAL_SLUG = "abc-colouring-book-for-kids-with-fun-facts";

const MOCK_CATEGORIES = [{ id: "cat-1", slug: "kids-colouring-books", name: "Kids Colouring Books", description: "", productCount: 1 }];

// A known, fixed price so this file's own discount-amount assertions
// never depend on the live/fallback catalogue's real price.
const MOCK_PRODUCT = {
  id: "mock-referral-product",
  name: "Mock Referral Test Book",
  slug: PHYSICAL_SLUG,
  sku: "MOCK-REF-1",
  category: { id: "cat-1", name: "Kids Colouring Books", slug: "kids-colouring-books" },
  price: 500,
  oldPrice: null,
  stockQuantity: 20,
  stockStatus: "In Stock",
  image: "/images/product-1.jpg",
  gallery: ["/images/product-1.jpg"],
  shortDescription: "A mock product for referral testing.",
  description: "A mock product for referral testing.",
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
};

async function mockCatalog(page) {
  await page.route("**/api/products", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { products: [MOCK_PRODUCT] } }) })
  );
  await page.route("**/api/categories", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { categories: MOCK_CATEGORIES } }) })
  );
}

function mockCaptureEndpoint(page, { isValid = true, discountRatePercent = 5 } = {}) {
  let captured = null;
  page.route("**/api/referrals/capture*", (route) => {
    const url = new URL(route.request().url());
    captured = url.searchParams.get("code");
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "OK",
        data: { code: captured, capturedAt: new Date().toISOString(), signature: "test-signature-abc123", isValid, discountRatePercent },
      }),
    });
  });
  return () => captured;
}

async function getStoredReferral(page) {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem("seasonedz_referral");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
}

async function seedStoredReferral(page, { code = "alice-1", capturedAt = new Date().toISOString(), signature = "test-signature-abc123" } = {}) {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    ["seasonedz_referral", JSON.stringify({ code, capturedAt, signature })]
  );
}

test.describe("Referral capture from a ?ref= link", () => {
  test("a well-formed ?ref=CODE calls the capture endpoint and stores the returned token verbatim", async ({ page }) => {
    const getCaptured = mockCaptureEndpoint(page);
    await page.goto("/?ref=alice-1");

    await expect.poll(() => getCaptured()).toBe("alice-1");
    const stored = await getStoredReferral(page);
    expect(stored).toMatchObject({ code: "alice-1", signature: "test-signature-abc123" });
    expect(typeof stored.capturedAt).toBe("string");
  });

  test("an uppercase/mixed-case ref value is normalised to lowercase before capture", async ({ page }) => {
    const getCaptured = mockCaptureEndpoint(page);
    await page.goto("/?ref=Alice-1");

    await expect.poll(() => getCaptured()).toBe("alice-1");
  });

  test("a malformed ref value (spaces, symbols) never reaches the capture endpoint", async ({ page }) => {
    let called = false;
    await page.route("**/api/referrals/capture*", (route) => {
      called = true;
      route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ success: false, message: "bad code" }) });
    });

    await page.goto("/?ref=not a valid code!!");
    await page.waitForTimeout(300);
    expect(called).toBe(false);
    expect(await getStoredReferral(page)).toBeNull();
  });

  test("no ?ref= param at all: no capture call, nothing stored", async ({ page }) => {
    let called = false;
    await page.route("**/api/referrals/capture*", (route) => {
      called = true;
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto("/shop");
    await page.waitForTimeout(300);
    expect(called).toBe(false);
    expect(await getStoredReferral(page)).toBeNull();
  });
});

test.describe("Checkout: referral discount preview and submission", () => {
  async function addToCartAndGoToCheckout(page) {
    await mockCatalog(page);
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator('[data-action="add-to-cart"]').click();
    await page.goto("/checkout");
  }

  test("a valid stored referral shows a Referral discount row on checkout, computed from the previewed rate", async ({ page }) => {
    await seedStoredReferral(page);
    await page.route("**/api/referrals/preview*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { isValid: true, discountRatePercent: 5 } }) })
    );

    await addToCartAndGoToCheckout(page);

    const discountRow = page.locator("[data-order-summary-discount-row]");
    await expect(discountRow).toBeVisible();
    await expect(discountRow).toContainText("-R25.00");
  });

  test("an invalid/expired stored referral shows no discount row on checkout", async ({ page }) => {
    await seedStoredReferral(page);
    await page.route("**/api/referrals/preview*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { isValid: false, discountRatePercent: 5 } }) })
    );

    await addToCartAndGoToCheckout(page);
    await expect(page.locator("[data-order-summary-discount-row]")).toHaveCount(0);
  });

  test("no stored referral: checkout never calls the preview endpoint, and shows no discount row", async ({ page }) => {
    let previewCalled = false;
    await page.route("**/api/referrals/preview*", (route) => {
      previewCalled = true;
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await addToCartAndGoToCheckout(page);
    expect(previewCalled).toBe(false);
    await expect(page.locator("[data-order-summary-discount-row]")).toHaveCount(0);
  });

  test("checkout submission relays the stored referralAttribution to the backend unchanged, and clears it from Local Storage on success", async ({ page }) => {
    await seedStoredReferral(page, { code: "alice-1", capturedAt: "2026-08-01T00:00:00.000Z", signature: "test-signature-abc123" });
    await page.route("**/api/referrals/preview*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { isValid: true, discountRatePercent: 5 } }) })
    );

    await addToCartAndGoToCheckout(page);

    let capturedPayload = null;
    await page.route("**/api/orders", (route) => {
      capturedPayload = route.request().postDataJSON();
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { orderNumber: "SZ-TEST-REF-1" } }) });
    });

    await page.locator("#firstName").fill("Thandiwe");
    await page.locator("#lastName").fill("Nkosi");
    await page.locator("#email").fill("thandiwe@example.com");
    await page.locator("#phone").fill("0821234567");
    await page.locator('input[name="deliveryMethod"][value="COLLECTION"]').check();
    await page.locator("#collectionCity").selectOption({ index: 1 });
    await page.locator('input[name="paymentMethod"][value="bank-transfer"]').check();

    await page.locator('#checkout-form button[type="submit"]').click();
    await expect(page).toHaveURL(/order-confirmation/);

    expect(capturedPayload.referralAttribution).toEqual({ code: "alice-1", capturedAt: "2026-08-01T00:00:00.000Z", signature: "test-signature-abc123" });
    // Bank Transfer has no separate payment-confirmation step — the
    // referral clears immediately on a successful order, same moment
    // the cart itself clears.
    expect(await getStoredReferral(page)).toBeNull();
  });
});

test.describe("Order confirmation: real discount display", () => {
  test("a backend order with discountTotal > 0 shows the Referral discount row with the correct amount and total", async ({ page }) => {
    const mockOrder = {
      orderNumber: "SZ-TEST-REF-2",
      createdAt: new Date().toISOString(),
      customer: { firstName: "Thandiwe", lastName: "Nkosi", email: "thandiwe@example.com", phone: "0821234567" },
      deliveryMethod: "COLLECTION",
      deliveryAddress: null,
      collectionCity: "Pretoria",
      status: "PENDING",
      paymentStatus: "PENDING",
      fulfilmentStatus: "NOT_STARTED",
      paymentMethod: "BANK_TRANSFER",
      items: [{ productSlug: PHYSICAL_SLUG, productName: "Mock Referral Test Book", sku: "MOCK-REF-1", quantity: 1, unitPrice: 500, lineTotal: 500, productType: "PHYSICAL", isGiftWrapped: false, giftMessage: null, giftWrapFee: 0 }],
      subtotal: 500,
      giftWrapTotal: 0,
      deliveryFee: 0,
      discountTotal: 25,
      total: 475,
      payment: null,
      shipping: null,
      hasPhysicalItems: true,
      hasDigitalItems: false,
      isDigitalOnly: false,
    };

    await page.route(`**/api/orders/${mockOrder.orderNumber}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: mockOrder }) })
    );

    await page.goto(`/order-confirmation?order=${mockOrder.orderNumber}`);

    const discountRow = page.locator("[data-order-summary-discount-row]");
    await expect(discountRow).toBeVisible();
    await expect(discountRow).toContainText("-R25.00");
    await expect(page.locator("[data-order-summary-total-value]")).toHaveText("R475.00");
    // Never exposes affiliate identity/commission to the customer.
    await expect(page.locator("body")).not.toContainText("commission");
  });
});

test.describe("Canonical URLs never carry a ?ref= query parameter", () => {
  test("visiting a product page with ?ref= still produces a canonical tag with no query string", async ({ page }) => {
    const getCaptured = mockCaptureEndpoint(page);
    await page.goto(`/product/${PHYSICAL_SLUG}?ref=alice-1`);
    await expect.poll(() => getCaptured()).toBe("alice-1");

    const canonicalHref = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonicalHref).not.toContain("ref=");
    expect(canonicalHref).toBe(`https://www.seasonedzgroup.co.za/product/${PHYSICAL_SLUG}/`);
  });
});
