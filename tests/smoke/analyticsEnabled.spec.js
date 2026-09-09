// Milestone 183 — Google Analytics 4: the "events actually fire
// correctly" half of the required test list. Runs ONLY under the
// "analytics" Playwright project (see playwright.config.js), whose own
// throwaway build bakes in an obviously-fake, non-existent Measurement
// ID (VITE_GA_MEASUREMENT_ID=G-TESTNOTREAL01) — never a real Seasonedz
// property. Every test here also intercepts the one real network
// request GA4 would make (loading gtag.js from
// googletagmanager.com) and fulfils it locally, so no request ever
// actually leaves the test runner (Part S: "never send fake ecommerce
// transactions to the real GA4 property") — js/analytics.js defines
// its own window.gtag shim (which only ever pushes to window.dataLayer)
// before that script tag is even appended, so blocking the remote file
// changes nothing about what this file can observe.
//
// Every order placed in this file is a mocked **/api/orders response
// (same established discipline as referralProgramme.spec.js/
// giftWrap.spec.js/deliveryMethods.spec.js) — no real backend order is
// ever created, and no real payment of any kind is ever taken.
import { test, expect } from "@playwright/test";

const PHYSICAL_SLUG = "abc-colouring-book-for-kids-with-fun-facts";

const MOCK_CATEGORIES = [{ id: "cat-1", slug: "kids-colouring-books", name: "Kids Colouring Books", description: "", productCount: 1 }];

const MOCK_PRODUCT = {
  id: "mock-ga4-product",
  name: "Mock GA4 Test Book",
  slug: PHYSICAL_SLUG,
  sku: "MOCK-GA4-1",
  category: { id: "cat-1", name: "Kids Colouring Books", slug: "kids-colouring-books" },
  price: 200,
  oldPrice: null,
  stockQuantity: 20,
  stockStatus: "In Stock",
  image: "/images/product-1.jpg",
  gallery: ["/images/product-1.jpg"],
  shortDescription: "A mock product for GA4 testing.",
  description: "A mock product for GA4 testing.",
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

function buildMockOrder(overrides = {}) {
  return {
    orderNumber: "SZ-TEST-GA4-1",
    createdAt: new Date().toISOString(),
    customer: { firstName: "Thandiwe", lastName: "Nkosi", email: "thandiwe@example.com", phone: "0821234567" },
    deliveryMethod: "COLLECTION",
    deliveryAddress: null,
    collectionCity: "Pretoria",
    status: "PENDING",
    paymentStatus: "PENDING",
    fulfilmentStatus: "NOT_STARTED",
    paymentMethod: "BANK_TRANSFER",
    items: [
      {
        productSlug: PHYSICAL_SLUG,
        productName: "Mock GA4 Test Book",
        sku: "MOCK-GA4-1",
        quantity: 1,
        unitPrice: 200,
        lineTotal: 200,
        productType: "PHYSICAL",
        isGiftWrapped: false,
        giftMessage: null,
        giftWrapFee: 0,
      },
    ],
    subtotal: 200,
    giftWrapTotal: 0,
    deliveryFee: 0,
    discountTotal: 0,
    total: 200,
    payment: null,
    shipping: null,
    containsPreorder: false,
    latestPreorderReleaseAt: null,
    preorderDiscountApplied: false,
    preorderDiscountTotal: 0,
    hasPhysicalItems: true,
    hasDigitalItems: false,
    isDigitalOnly: false,
    ...overrides,
  };
}

// Blocks the one real outbound request GA4 would make — see this
// file's own header comment. Every test needs this, so it's applied
// automatically rather than repeated per test.
test.beforeEach(async ({ page }) => {
  await page.route("**/googletagmanager.com/gtag/js**", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
});

async function mockCatalog(page) {
  await page.route("**/api/products", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { products: [MOCK_PRODUCT] } }) })
  );
  await page.route("**/api/categories", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { categories: MOCK_CATEGORIES } }) })
  );
}

async function grantAnalyticsConsent(page) {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    "seasonedz_cookie_consent",
    JSON.stringify({ version: "1", necessary: true, preferences: true, analytics: true, marketing: false, timestamp: new Date().toISOString(), updatedAt: new Date().toISOString() }),
  ]);
}

async function getGtagEvents(page, eventName) {
  return page.evaluate((name) => {
    const dataLayer = window.dataLayer || [];
    return dataLayer.filter((entry) => Array.isArray(entry) && entry[0] === "event" && entry[1] === name).map((entry) => entry[2]);
  }, eventName);
}

async function getDataLayer(page) {
  return page.evaluate(() => window.dataLayer || []);
}

test.describe("GA4 consent gating (Milestone 183)", () => {
  test("no consent decision yet: a real Measurement ID alone never loads GA4", async ({ page }) => {
    await mockCatalog(page);
    await page.goto("/");
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => typeof window.gtag)).toBe("undefined");
  });

  test("consent explicitly rejected: GA4 stays off", async ({ page }) => {
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
      "seasonedz_cookie_consent",
      JSON.stringify({ version: "1", necessary: true, preferences: true, analytics: false, marketing: false, timestamp: new Date().toISOString(), updatedAt: new Date().toISOString() }),
    ]);
    await mockCatalog(page);
    await page.goto("/");
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => typeof window.gtag)).toBe("undefined");
  });

  test("consent granted: GA4 loads and the very first navigation sends exactly one page_view with the real path/title", async ({ page }) => {
    await grantAnalyticsConsent(page);
    await mockCatalog(page);
    await page.goto("/shop");
    await expect.poll(async () => (await getGtagEvents(page, "page_view")).length).toBeGreaterThan(0);

    const pageViews = await getGtagEvents(page, "page_view");
    expect(pageViews).toHaveLength(1);
    expect(pageViews[0].page_path).toBe("/shop");
    expect(typeof pageViews[0].page_title).toBe("string");
    expect(pageViews[0].page_location).toContain("/shop");
  });
});

test.describe("GA4 page_view on SPA navigation (Milestone 183, Part D)", () => {
  test("navigating between real routes sends one additional page_view each time, never duplicated", async ({ page }) => {
    // Deliberately clicks real in-app links rather than calling
    // page.goto() again for the 2nd/3rd navigation — page.goto() is a
    // full browser navigation (a fresh page load, fresh JS module
    // state, fresh empty dataLayer every time), not the SPA client-
    // side pushState transition router.js's own link-interception
    // actually produces for a real customer clicking around the site;
    // only a real link click exercises the single-navigationEpoch
    // dedup path this test means to prove.
    await grantAnalyticsConsent(page);
    await mockCatalog(page);
    await page.goto("/");
    await expect.poll(async () => (await getGtagEvents(page, "page_view")).length).toBe(1);

    await page.locator('a[href="/shop"]').first().click();
    await expect.poll(async () => (await getGtagEvents(page, "page_view")).length).toBe(2);
    await expect(page).toHaveURL(/\/shop/);

    await page.locator(`a[href="/product/${PHYSICAL_SLUG}"]`).first().click();
    await expect.poll(async () => (await getGtagEvents(page, "page_view")).length).toBe(3);
    await expect(page).toHaveURL(new RegExp(`/product/${PHYSICAL_SLUG}`));
  });

  test("re-rendering the same page (cart quantity stepper) never fires an extra page_view or view_cart", async ({ page }) => {
    await grantAnalyticsConsent(page);
    await mockCatalog(page);
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator('[data-action="add-to-cart"]').click();
    await page.goto("/cart");

    await expect.poll(async () => (await getGtagEvents(page, "view_cart")).length).toBe(1);
    const pageViewsBefore = (await getGtagEvents(page, "page_view")).length;

    await page.locator('[data-action="cart-increase"]').first().click();
    await page.waitForTimeout(300);

    expect(await getGtagEvents(page, "view_cart")).toHaveLength(1);
    expect(await getGtagEvents(page, "page_view")).toHaveLength(pageViewsBefore);
  });
});

test.describe("GA4 ecommerce events (Milestone 183, Part E/F)", () => {
  test("view_item fires on a Product page with the real product's id/name/price and currency ZAR", async ({ page }) => {
    await grantAnalyticsConsent(page);
    await mockCatalog(page);
    await page.goto(`/product/${PHYSICAL_SLUG}`);

    await expect.poll(async () => (await getGtagEvents(page, "view_item")).length).toBe(1);
    const [viewItem] = await getGtagEvents(page, "view_item");
    expect(viewItem.currency).toBe("ZAR");
    expect(viewItem.items[0]).toMatchObject({ item_id: PHYSICAL_SLUG, item_name: "Mock GA4 Test Book", price: 200 });
  });

  test("add_to_cart fires exactly once per click, never merely from opening the Product page", async ({ page }) => {
    await grantAnalyticsConsent(page);
    await mockCatalog(page);
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    expect(await getGtagEvents(page, "add_to_cart")).toHaveLength(0);

    await page.locator('[data-action="add-to-cart"]').click();
    await expect.poll(async () => (await getGtagEvents(page, "add_to_cart")).length).toBe(1);

    const [addToCart] = await getGtagEvents(page, "add_to_cart");
    expect(addToCart.currency).toBe("ZAR");
    expect(addToCart.items[0]).toMatchObject({ item_id: PHYSICAL_SLUG, item_name: "Mock GA4 Test Book", price: 200, quantity: 1 });
  });

  test("remove_from_cart fires with the real removed item's data", async ({ page }) => {
    await grantAnalyticsConsent(page);
    await mockCatalog(page);
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator('[data-action="add-to-cart"]').click();
    await page.goto("/cart");

    await page.locator('[data-action="cart-remove"]').first().click();
    await expect.poll(async () => (await getGtagEvents(page, "remove_from_cart")).length).toBe(1);

    const [removeEvent] = await getGtagEvents(page, "remove_from_cart");
    expect(removeEvent.items[0]).toMatchObject({ item_id: PHYSICAL_SLUG, price: 200, quantity: 1 });
  });

  test("view_cart fires once with the real cart items and subtotal value", async ({ page }) => {
    await grantAnalyticsConsent(page);
    await mockCatalog(page);
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator('[data-action="add-to-cart"]').click();
    await page.goto("/cart");

    await expect.poll(async () => (await getGtagEvents(page, "view_cart")).length).toBe(1);
    const [viewCart] = await getGtagEvents(page, "view_cart");
    expect(viewCart.currency).toBe("ZAR");
    expect(viewCart.value).toBe(200);
    expect(viewCart.items[0]).toMatchObject({ item_id: PHYSICAL_SLUG, price: 200 });
  });

  test("begin_checkout fires once with the real cart items and subtotal value on reaching Checkout", async ({ page }) => {
    await grantAnalyticsConsent(page);
    await mockCatalog(page);
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator('[data-action="add-to-cart"]').click();
    await page.goto("/checkout");

    await expect.poll(async () => (await getGtagEvents(page, "begin_checkout")).length).toBe(1);
    const [beginCheckout] = await getGtagEvents(page, "begin_checkout");
    expect(beginCheckout.currency).toBe("ZAR");
    expect(beginCheckout.value).toBe(200);
  });
});

test.describe("GA4 purchase event (Milestone 183, Part J)", () => {
  test("Bank Transfer: purchase fires on Order Confirmation with the real transaction id/value/items, and carries no PII", async ({ page }) => {
    const mockOrder = buildMockOrder();
    await grantAnalyticsConsent(page);
    await page.route(`**/api/orders/${mockOrder.orderNumber}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: mockOrder }) })
    );

    await page.goto(`/order-confirmation?order=${mockOrder.orderNumber}`);
    await expect.poll(async () => (await getGtagEvents(page, "purchase")).length).toBe(1);

    const [purchase] = await getGtagEvents(page, "purchase");
    expect(purchase.transaction_id).toBe(mockOrder.orderNumber);
    expect(purchase.currency).toBe("ZAR");
    expect(purchase.value).toBe(200);
    expect(purchase.shipping).toBe(0);
    expect(purchase.items[0]).toMatchObject({ item_id: PHYSICAL_SLUG, item_name: "Mock GA4 Test Book", price: 200, quantity: 1 });

    const dataLayerText = JSON.stringify(await getDataLayer(page));
    expect(dataLayerText).not.toContain("thandiwe@example.com");
    expect(dataLayerText).not.toContain("0821234567");
    expect(dataLayerText).not.toContain("Nkosi");
  });

  test("refreshing Order Confirmation for the same order never records a duplicate purchase", async ({ page }) => {
    const mockOrder = buildMockOrder({ orderNumber: "SZ-TEST-GA4-DEDUP" });
    await grantAnalyticsConsent(page);
    await page.route(`**/api/orders/${mockOrder.orderNumber}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: mockOrder }) })
    );

    await page.goto(`/order-confirmation?order=${mockOrder.orderNumber}`);
    await expect.poll(async () => (await getGtagEvents(page, "purchase")).length).toBe(1);

    // A real page.reload() is a hard reload, not an SPA route change —
    // window.dataLayer itself resets to empty on the fresh page load,
    // so the real proof of dedup is that it STAYS empty (the
    // persisted, localStorage-backed guard — keyed by the real
    // orderNumber, surviving the reload exactly because it's real
    // storage, not a module variable — correctly blocks a second
    // send), never that the old array magically survives the reload.
    await page.reload();
    await page.waitForTimeout(300);
    expect(await getGtagEvents(page, "purchase")).toHaveLength(0);
  });

  test("PayFast: a PENDING order shows no purchase on Order Confirmation until paymentStatus is PAID", async ({ page }) => {
    const pendingOrder = buildMockOrder({ orderNumber: "SZ-TEST-GA4-PF-PENDING", paymentMethod: "PAYFAST", paymentStatus: "PENDING" });
    await grantAnalyticsConsent(page);
    await page.route(`**/api/orders/${pendingOrder.orderNumber}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: pendingOrder }) })
    );

    await page.goto(`/order-confirmation?order=${pendingOrder.orderNumber}`);
    await page.waitForTimeout(300);
    expect(await getGtagEvents(page, "purchase")).toHaveLength(0);
  });

  test("PayFast: purchase fires once paymentStatus is genuinely PAID, seen via the Payment Success page", async ({ page }) => {
    const paidOrder = buildMockOrder({ orderNumber: "SZ-TEST-GA4-PF-PAID", paymentMethod: "PAYFAST", paymentStatus: "PAID" });
    await grantAnalyticsConsent(page);
    await page.route(`**/api/orders/${paidOrder.orderNumber}/tracking`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "OK", data: { orderNumber: paidOrder.orderNumber, createdAt: paidOrder.createdAt, status: paidOrder.status, paymentStatus: "PAID" } }),
      })
    );
    await page.route(`**/api/orders/${paidOrder.orderNumber}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: paidOrder }) })
    );

    await page.goto(`/payment-success?orderNumber=${paidOrder.orderNumber}`);
    await expect.poll(async () => (await getGtagEvents(page, "purchase")).length).toBe(1);

    const [purchase] = await getGtagEvents(page, "purchase");
    expect(purchase.transaction_id).toBe(paidOrder.orderNumber);

    // Visiting the full Order Confirmation for the same PayFast order
    // afterwards must never record a second purchase — one shared,
    // persisted dedup guard across both pages (Part J). page.goto() is
    // a full reload, so window.dataLayer itself resets to empty first
    // (same as the dedicated refresh-dedup test above) — the real
    // proof is that it STAYS empty here, i.e. the guard (keyed by the
    // real orderNumber in localStorage, which does survive the reload)
    // correctly blocks this second page from sending one at all.
    await page.goto(`/order-confirmation?order=${paidOrder.orderNumber}`);
    await page.waitForTimeout(300);
    expect(await getGtagEvents(page, "purchase")).toHaveLength(0);
  });

  test("purchase value/shipping reflect the backend's own final total/delivery fee, never a client-side recalculation", async ({ page }) => {
    // R200 subtotal - R20 discount + R120 delivery = R300 total. If
    // this file recalculated the value itself instead of trusting
    // order.total, a bug in that arithmetic could silently pass this
    // test by coincidence — asserting against a total that does NOT
    // equal a naive subtotal+delivery sum (R320) rules that out.
    const discountedOrder = buildMockOrder({
      orderNumber: "SZ-TEST-GA4-DISCOUNT",
      deliveryMethod: "COURIER_DOOR",
      deliveryFee: 120,
      discountTotal: 20,
      total: 300,
    });
    await grantAnalyticsConsent(page);
    await page.route(`**/api/orders/${discountedOrder.orderNumber}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: discountedOrder }) })
    );

    await page.goto(`/order-confirmation?order=${discountedOrder.orderNumber}`);
    await expect.poll(async () => (await getGtagEvents(page, "purchase")).length).toBe(1);

    const [purchase] = await getGtagEvents(page, "purchase");
    expect(purchase.value).toBe(300);
    expect(purchase.shipping).toBe(120);
  });

  test("a preorder line item still tracks normally through add_to_cart and purchase (Milestone 181 preserved)", async ({ page }) => {
    const preorderOrder = buildMockOrder({
      orderNumber: "SZ-TEST-GA4-PREORDER",
      items: [
        {
          productSlug: PHYSICAL_SLUG,
          productName: "Mock GA4 Test Book",
          sku: "MOCK-GA4-1",
          quantity: 1,
          unitPrice: 200,
          lineTotal: 200,
          productType: "PHYSICAL",
          isGiftWrapped: false,
          giftMessage: null,
          giftWrapFee: 0,
          isPreorder: true,
          preorderReleaseAt: "2026-12-01T00:00:00.000Z",
        },
      ],
      containsPreorder: true,
      latestPreorderReleaseAt: "2026-12-01T00:00:00.000Z",
    });
    await grantAnalyticsConsent(page);
    await page.route(`**/api/orders/${preorderOrder.orderNumber}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: preorderOrder }) })
    );

    await page.goto(`/order-confirmation?order=${preorderOrder.orderNumber}`);
    await expect.poll(async () => (await getGtagEvents(page, "purchase")).length).toBe(1);

    const [purchase] = await getGtagEvents(page, "purchase");
    expect(purchase.items[0]).toMatchObject({ item_id: PHYSICAL_SLUG, quantity: 1, price: 200 });
  });
});
