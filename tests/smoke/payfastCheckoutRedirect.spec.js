// Milestone 204.1: checkout must hand PayFast orders to PayFast. Every
// order/initiate call is mocked with the backend's REAL response shape
// ({ orderNumber, order }) and the sandbox process URL is intercepted,
// so no real order or payment is ever created.
import { test, expect } from "@playwright/test";

const SLUG = "abc-colouring-book-for-kids-with-fun-facts";
const ORDER_NUMBER = "SG-2026-PFTS";
const PROCESS_URL = "https://sandbox.payfast.co.za/eng/process";

function orderResponse(paymentMethod, total = 160) {
  return {
    success: true,
    message: "Order created successfully",
    data: {
      orderNumber: ORDER_NUMBER,
      order: { orderNumber: ORDER_NUMBER, paymentMethod, paymentStatus: paymentMethod === "MANUAL" ? "PAID" : "PENDING", status: "PENDING", total },
    },
  };
}

const INITIATE_OK = {
  success: true,
  message: "PayFast payment prepared successfully",
  data: {
    processUrl: PROCESS_URL,
    method: "POST",
    fields: { merchant_id: "10000100", merchant_key: "46f0cd694581a", m_payment_id: ORDER_NUMBER, amount: "160.00", item_name: `Seasonedz Group Order ${ORDER_NUMBER}`, signature: "testsignature" },
  },
};

async function setup(page, { orderPaymentMethod = "PAYFAST", initiate = [INITIATE_OK] } = {}) {
  const calls = { orders: [], initiate: [], payfastPost: null };
  await page.route("**/api/orders", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    calls.orders.push(route.request().postDataJSON());
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(orderResponse(orderPaymentMethod)) });
  });
  await page.route("**/api/payments/payfast/initiate", async (route) => {
    calls.initiate.push(route.request().postDataJSON());
    const next = initiate[Math.min(calls.initiate.length - 1, initiate.length - 1)];
    if (next.status) {
      await route.fulfill({ status: next.status, contentType: "application/json", body: JSON.stringify({ success: false, message: next.message }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(next) });
    }
  });
  await page.route(`${PROCESS_URL}**`, async (route) => {
    calls.payfastPost = { method: route.request().method(), body: route.request().postData() };
    await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>PayFast sandbox stub</body></html>" });
  });
  return calls;
}

async function fillCheckout(page, { delivery = "COLLECTION", payment = "payfast" } = {}) {
  await page.goto(`/product/${SLUG}`);
  await page.locator('[data-action="add-to-cart"]').click();
  await page.goto("/checkout");
  await page.locator("#firstName").fill("Thandiwe");
  await page.locator("#lastName").fill("Nkosi");
  await page.locator("#email").fill("thandiwe@example.com");
  await page.locator("#phone").fill("0821234567");
  await page.locator(`input[name="deliveryMethod"][value="${delivery}"]`).check();
  if (delivery === "COLLECTION") {
    const city = page.locator('select[name="collectionCity"]');
    if (await city.count()) await city.selectOption({ index: 1 });
    else await page.locator('input[name="collectionCity"]').first().check();
  } else {
    await page.locator("#city").fill("Pretoria");
    await page.locator("#province").selectOption("Gauteng");
    if (delivery === "COURIER_DOOR") {
      await page.locator("#street").fill("12 Church Street");
      await page.locator("#suburb").fill("Arcadia");
      await page.locator("#postalCode").fill("0083");
    }
  }
  const radio = page.locator(`input[name="paymentMethod"][value="${payment}"]`);
  // Local/CI smoke builds set VITE_PAYFAST_ENABLED=false (only the final
  // production build enables it), which is why this path went untested.
  await radio.evaluate((el) => { el.disabled = false; });
  await radio.check();
}

const submit = (page) => page.locator('#checkout-form button[type="submit"]').click();

test.describe("PayFast checkout redirect (Milestone 204.1)", () => {
  for (const delivery of ["COLLECTION", "COURIER_LOCKER", "COURIER_DOOR"]) {
    test(`PayFast order with ${delivery} initiates payment and posts to PayFast`, async ({ page }) => {
      const calls = await setup(page);
      await fillCheckout(page, { delivery });
      await submit(page);
      await expect.poll(() => calls.payfastPost).not.toBeNull();
      expect(calls.orders).toHaveLength(1);
      expect(calls.orders[0].paymentMethod).toBe("PAYFAST");
      expect(calls.initiate).toEqual([{ orderNumber: ORDER_NUMBER, context: "checkout" }]);
      expect(calls.payfastPost.method).toBe("POST");
      expect(calls.payfastPost.body).toContain(`m_payment_id=${ORDER_NUMBER}`);
      expect(calls.payfastPost.body).toContain("amount=160.00");
      expect(calls.payfastPost.body).toContain("signature=testsignature");
    });
  }

  test("server-converted zero-total order (MANUAL) skips PayFast and shows confirmation", async ({ page }) => {
    const calls = await setup(page, { orderPaymentMethod: "MANUAL" });
    await fillCheckout(page);
    await submit(page);
    await expect(page).toHaveURL(/order-confirmation\?order=SG-2026-PFTS/);
    expect(calls.initiate).toHaveLength(0);
    expect(calls.payfastPost).toBeNull();
  });

  test("Bank Transfer never calls PayFast initiation", async ({ page }) => {
    const calls = await setup(page, { orderPaymentMethod: "BANK_TRANSFER" });
    await fillCheckout(page, { payment: "bank-transfer" });
    await submit(page);
    await expect(page).toHaveURL(/order-confirmation/);
    expect(calls.initiate).toHaveLength(0);
  });

  test("failed initiation shows a clear error, and retry reuses the same order", async ({ page }) => {
    const calls = await setup(page, { initiate: [{ status: 503, message: "PayFast payments are not enabled." }, INITIATE_OK] });
    await fillCheckout(page);
    await submit(page);
    const panel = page.locator("[data-checkout-payfast-error]");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(`Your order ${ORDER_NUMBER} was created, but we could not open PayFast`);
    await expect(panel).toContainText("You have not been charged");
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.locator("#checkout-form")).toHaveCount(0);

    await panel.locator('[data-action="retry-payfast"]').click();
    await expect.poll(() => calls.payfastPost).not.toBeNull();
    expect(calls.orders).toHaveLength(1);
    expect(calls.initiate).toEqual([
      { orderNumber: ORDER_NUMBER, context: "checkout" },
      { orderNumber: ORDER_NUMBER, context: "checkout" },
    ]);
  });

  test("retry that fails again keeps the error visible and the button usable", async ({ page }) => {
    const calls = await setup(page, { initiate: [{ status: 503, message: "PayFast payments are not enabled." }] });
    await fillCheckout(page);
    await submit(page);
    const panel = page.locator("[data-checkout-payfast-error]");
    await panel.locator('[data-action="retry-payfast"]').click();
    await expect(panel.locator("[data-retry-error]")).toHaveText("PayFast payments are not enabled.");
    await expect(panel.locator('[data-action="retry-payfast"]')).toBeEnabled();
    expect(calls.orders).toHaveLength(1);
  });

  test("double-clicking Place Order creates only one order", async ({ page }) => {
    const calls = await setup(page);
    await fillCheckout(page);
    const button = page.locator('#checkout-form button[type="submit"]');
    await button.dblclick();
    await expect.poll(() => calls.payfastPost).not.toBeNull();
    expect(calls.orders).toHaveLength(1);
    expect(calls.initiate).toHaveLength(1);
  });

  test("mobile viewport redirects to PayFast", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    const calls = await setup(page);
    await fillCheckout(page);
    await submit(page);
    await expect.poll(() => calls.payfastPost).not.toBeNull();
    expect(calls.orders).toHaveLength(1);
  });
});
