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

// A freshly-placed order is always PENDING/PENDING (see buildMockOrder
// above) — that is the real backend state for every payment method at
// creation. This is the same order AFTER its payment has genuinely
// been confirmed: a verified PayFast ITN, or an admin recording a
// received Bank Transfer / Cash on Delivery payment. Milestone 183A:
// a GA4 purchase is only ever this state, never mere order creation.
function buildPaidOrder(overrides = {}) {
  return buildMockOrder({ status: "CONFIRMED", paymentStatus: "PAID", ...overrides });
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
    // GA4 GTAG TRANSMISSION FIX: a real gtag() call now pushes the
    // canonical `arguments` object (Array.isArray === false), not a
    // rest-parameter Array — see analytics.js's own ensureGtagLoaded().
    // This filter must accept either shape, since both are equally
    // valid, array-index-readable command envelopes; it only needs
    // `entry[0]`/`entry[1]` to exist, never Array.isArray(entry).
    return dataLayer.filter((entry) => entry && entry[0] === "event" && entry[1] === name).map((entry) => entry[2]);
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

  // Milestone 185: confirms the Marketing Link Builder's whole reason
  // for existing actually works — a UTM-tagged link landing on the
  // site produces a GA4 page_view whose page_location carries every
  // utm_* parameter intact, exactly like a traditional multi-page
  // site. trackPageView() (js/analytics.js) sends
  // page_location: window.location.href, and nothing in router.js's
  // render pipeline rewrites the URL before that first page_view
  // fires (Milestone 185's own Part A/F audit) — this is the
  // regression test for that finding, not new production code.
  test("a UTM-tagged landing URL sends a page_view whose page_location carries every utm_* parameter intact", async ({ page }) => {
    await grantAnalyticsConsent(page);
    await mockCatalog(page);
    await page.goto("/product/abc-colouring-book-for-kids-with-fun-facts?utm_source=instagram&utm_medium=social&utm_campaign=revised_books_launch_2026&utm_content=abc_video_01");
    await expect.poll(async () => (await getGtagEvents(page, "page_view")).length).toBeGreaterThan(0);

    const pageViews = await getGtagEvents(page, "page_view");
    const landingUrl = new URL(pageViews[0].page_location);
    expect(landingUrl.searchParams.get("utm_source")).toBe("instagram");
    expect(landingUrl.searchParams.get("utm_medium")).toBe("social");
    expect(landingUrl.searchParams.get("utm_campaign")).toBe("revised_books_launch_2026");
    expect(landingUrl.searchParams.get("utm_content")).toBe("abc_video_01");
  });

  // Milestone 186: Metricool Web Analytics was added alongside GA4 —
  // this proves GA4 is genuinely unaffected, not just unchanged in the
  // diff. Same consent gate (js/consent.js), same real gtag.js request
  // interception discipline as every other test in this file, plus a
  // mocked Metricool tracker response so this test never depends on
  // tracker.metricool.com being reachable.
  test("GA4 still loads and fires page_view correctly with Metricool also active on the same page", async ({ page }) => {
    await page.route("**/tracker.metricool.com/resources/be.js", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `window.beTracker = { t: function (opts) { window.__metricoolCalls = window.__metricoolCalls || []; window.__metricoolCalls.push(opts); } };`,
      })
    );
    await grantAnalyticsConsent(page);
    await mockCatalog(page);
    await page.goto("/shop");

    await expect.poll(async () => (await getGtagEvents(page, "page_view")).length).toBeGreaterThan(0);
    const pageViews = await getGtagEvents(page, "page_view");
    expect(pageViews[0].page_path).toBe("/shop");

    await expect.poll(() => page.evaluate(() => (window.__metricoolCalls || []).length)).toBeGreaterThan(0);
    const metricoolCalls = await page.evaluate(() => window.__metricoolCalls);
    expect(metricoolCalls).toEqual([{ hash: "1a4cb5231d8873d12258557dd3fd3c36" }]);
  });
});

// GA4 GTAG TRANSMISSION FIX: regression test for the exact bug — the
// gtag shim must push the real `arguments` object into dataLayer, the
// same as Google's own canonical snippet (`function gtag(){
// dataLayer.push(arguments); }`), never a rest-parameter Array
// (`function gtag(...args){ dataLayer.push(args); }` or
// `dataLayer.push([...args])` — both produce a genuine Array).
// Deliberately does NOT just check that the right values ended up in
// dataLayer — a rest-parameter Array holds the exact same values at
// the exact same indices, so that kind of test already passed under
// the old, defective implementation while gtag.js sent zero hits.
// Instead this asserts the pushed entry's own real JS type, which is
// the one thing that actually differs between the two forms.
test.describe("GA4 gtag command envelope (Arguments vs Array regression)", () => {
  test("a gtag() call pushes the real Arguments object into dataLayer, never a plain Array", async ({ page }) => {
    await grantAnalyticsConsent(page);
    await mockCatalog(page);
    await page.goto("/shop");
    // Same readiness signal every other test in this file already
    // relies on — a real page_view having fired proves gtag is fully
    // loaded and dataLayer is live, not just that window.gtag exists.
    await expect.poll(async () => (await getGtagEvents(page, "page_view")).length).toBeGreaterThan(0);

    const result = await page.evaluate(() => {
      window.gtag("event", "regression_envelope_test", { probe: 42 });
      const entry = window.dataLayer[window.dataLayer.length - 1];
      return {
        isRealArray: Array.isArray(entry),
        typeTag: Object.prototype.toString.call(entry),
        length: entry.length,
        command: entry[0],
        eventName: entry[1],
        params: entry[2],
      };
    });

    // The one assertion that actually distinguishes the canonical
    // `dataLayer.push(arguments)` shim from the defective
    // `dataLayer.push(args)` / `dataLayer.push([...args])` rest-
    // parameter forms — both of the latter produce Array.isArray ===
    // true and a "[object Array]" tag; only a genuine Arguments object
    // produces "[object Arguments]" and Array.isArray === false.
    expect(result.isRealArray).toBe(false);
    expect(result.typeTag).toBe("[object Arguments]");

    // Still a fully valid, correctly-indexed command envelope either
    // way — proves the fix changed nothing about what gtag.js itself
    // would read out of this entry.
    expect(result.length).toBe(3);
    expect(result.command).toBe("event");
    expect(result.eventName).toBe("regression_envelope_test");
    expect(result.params).toMatchObject({ probe: 42 });
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

test.describe("GA4 purchase event (Milestone 183 / 183A, Part J)", () => {
  // Milestone 183A: the backend creates EVERY order paymentStatus
  // PENDING, of every method — nothing is confirmed at order creation.
  // A GA4 purchase must never be recorded off mere order creation, only
  // off a genuine paymentStatus === "PAID". These tests exercise each
  // method's real lifecycle: placed-but-unpaid (no purchase), then
  // confirmed-paid (exactly one).

  test("Bank Transfer: an order just placed (paymentStatus PENDING) records NO purchase on Order Confirmation", async ({ page }) => {
    const placedOrder = buildMockOrder({ orderNumber: "SZ-TEST-GA4-BT-PENDING" });
    await grantAnalyticsConsent(page);
    await page.route(`**/api/orders/${placedOrder.orderNumber}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: placedOrder }) })
    );

    await page.goto(`/order-confirmation?order=${placedOrder.orderNumber}`);
    await page.waitForTimeout(300);
    expect(await getGtagEvents(page, "purchase")).toHaveLength(0);
  });

  test("Bank Transfer: once an admin has confirmed the payment (paymentStatus PAID), a return to Order Confirmation records exactly one purchase with the real transaction id/value/items and no PII", async ({ page }) => {
    const paidOrder = buildPaidOrder({ orderNumber: "SZ-TEST-GA4-BT-PAID" });
    await grantAnalyticsConsent(page);
    await page.route(`**/api/orders/${paidOrder.orderNumber}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: paidOrder }) })
    );

    await page.goto(`/order-confirmation?order=${paidOrder.orderNumber}`);
    await expect.poll(async () => (await getGtagEvents(page, "purchase")).length).toBe(1);

    const [purchase] = await getGtagEvents(page, "purchase");
    expect(purchase.transaction_id).toBe(paidOrder.orderNumber);
    expect(purchase.currency).toBe("ZAR");
    expect(purchase.value).toBe(200);
    expect(purchase.shipping).toBe(0);
    expect(purchase.items[0]).toMatchObject({ item_id: PHYSICAL_SLUG, item_name: "Mock GA4 Test Book", price: 200, quantity: 1 });

    const dataLayerText = JSON.stringify(await getDataLayer(page));
    expect(dataLayerText).not.toContain("thandiwe@example.com");
    expect(dataLayerText).not.toContain("0821234567");
    expect(dataLayerText).not.toContain("Nkosi");
  });

  test("Bank Transfer: a registered customer opening their account order detail for a since-confirmed order is a reliable place the delayed purchase is finally recorded (once)", async ({ page }) => {
    const orderNumber = "SG-2026-GA4BT";
    const paidOrder = {
      orderNumber,
      status: "CONFIRMED",
      paymentStatus: "PAID",
      paymentMethod: "BANK_TRANSFER",
      subtotal: 200,
      deliveryFee: 0,
      discountTotal: 0,
      total: 200,
      createdAt: new Date().toISOString(),
      customer: { firstName: "Thandiwe", lastName: "Nkosi", email: "thandiwe@example.com", phone: "0821234567" },
      deliveryMethod: "COLLECTION",
      collectionCity: "Pretoria",
      deliveryAddress: null,
      containsPreorder: false,
      latestPreorderReleaseAt: null,
      preorderDiscountTotal: 0,
      isDigitalOnly: false,
      items: [{ productName: "Mock GA4 Test Book", productSlug: PHYSICAL_SLUG, quantity: 1, unitPrice: 200, lineTotal: 200, imageUrl: null }],
      shipping: { status: "NOT_STARTED", courierName: null, trackingNumber: null, trackingUrl: null },
    };
    await grantAnalyticsConsent(page);
    await page.route("**/api/customers/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "OK", data: { customer: { id: "mock-customer-id", email: "thandiwe@example.com", firstName: "Thandiwe", lastName: "Nkosi", phone: "0821234567", type: "REGISTERED" } } }),
      })
    );
    await page.route(`**/api/customers/orders/${orderNumber}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { order: paidOrder } }) })
    );
    // Best-effort side lookups the page also makes — stubbed empty so
    // the test never depends on a real backend for them.
    await page.route(`**/api/customers/orders/${orderNumber}/downloads`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { items: [] } }) })
    );
    await page.route("**/api/customers/reviews/eligible", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { candidates: [] } }) })
    );
    await page.route("**/api/customers/reviews", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { reviews: [] } }) })
    );

    await page.goto(`/account/orders/${orderNumber}`);
    await expect.poll(async () => (await getGtagEvents(page, "purchase")).length).toBe(1);

    const [purchase] = await getGtagEvents(page, "purchase");
    expect(purchase.transaction_id).toBe(orderNumber);
    expect(purchase.value).toBe(200);
    expect(purchase.items[0]).toMatchObject({ item_id: PHYSICAL_SLUG, item_name: "Mock GA4 Test Book", price: 200, quantity: 1 });

    // Re-opening the same order detail must never record a second one.
    await page.reload();
    await page.waitForTimeout(300);
    expect(await getGtagEvents(page, "purchase")).toHaveLength(0);
  });

  test("Cash on Delivery: an order just placed (paymentStatus PENDING) records NO purchase", async ({ page }) => {
    const placedOrder = buildMockOrder({ orderNumber: "SZ-TEST-GA4-COD-PENDING", paymentMethod: "CASH_ON_DELIVERY" });
    await grantAnalyticsConsent(page);
    await page.route(`**/api/orders/${placedOrder.orderNumber}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: placedOrder }) })
    );

    await page.goto(`/order-confirmation?order=${placedOrder.orderNumber}`);
    await page.waitForTimeout(300);
    expect(await getGtagEvents(page, "purchase")).toHaveLength(0);
  });

  test("Cash on Delivery: once delivered and the cash is confirmed (status DELIVERED, paymentStatus PAID), exactly one purchase is recorded", async ({ page }) => {
    // The backend only allows a COD payment to be confirmed after the
    // order is DELIVERED (adminPaymentConfirmation.service.ts) — so a
    // real PAID COD order is always DELIVERED too.
    const codPaidOrder = buildMockOrder({
      orderNumber: "SZ-TEST-GA4-COD-PAID",
      paymentMethod: "CASH_ON_DELIVERY",
      status: "DELIVERED",
      paymentStatus: "PAID",
    });
    await grantAnalyticsConsent(page);
    await page.route(`**/api/orders/${codPaidOrder.orderNumber}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: codPaidOrder }) })
    );

    await page.goto(`/order-confirmation?order=${codPaidOrder.orderNumber}`);
    await expect.poll(async () => (await getGtagEvents(page, "purchase")).length).toBe(1);

    const [purchase] = await getGtagEvents(page, "purchase");
    expect(purchase.transaction_id).toBe(codPaidOrder.orderNumber);
    expect(purchase.value).toBe(200);
  });

  test("a cancelled order (status CANCELLED, paymentStatus CANCELLED) never records a purchase", async ({ page }) => {
    const cancelledOrder = buildMockOrder({
      orderNumber: "SZ-TEST-GA4-CANCELLED",
      paymentMethod: "PAYFAST",
      status: "CANCELLED",
      paymentStatus: "CANCELLED",
    });
    await grantAnalyticsConsent(page);
    await page.route(`**/api/orders/${cancelledOrder.orderNumber}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: cancelledOrder }) })
    );

    await page.goto(`/order-confirmation?order=${cancelledOrder.orderNumber}`);
    await page.waitForTimeout(300);
    expect(await getGtagEvents(page, "purchase")).toHaveLength(0);
  });

  test("refreshing Order Confirmation for the same PAID order never records a duplicate purchase", async ({ page }) => {
    const paidOrder = buildPaidOrder({ orderNumber: "SZ-TEST-GA4-DEDUP" });
    await grantAnalyticsConsent(page);
    await page.route(`**/api/orders/${paidOrder.orderNumber}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: paidOrder }) })
    );

    await page.goto(`/order-confirmation?order=${paidOrder.orderNumber}`);
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
    const paidOrder = buildPaidOrder({ orderNumber: "SZ-TEST-GA4-PF-PAID", paymentMethod: "PAYFAST" });
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
    const discountedOrder = buildPaidOrder({
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

  test("a preorder line item still tracks normally through purchase (Milestone 181 preserved)", async ({ page }) => {
    const preorderOrder = buildPaidOrder({
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
