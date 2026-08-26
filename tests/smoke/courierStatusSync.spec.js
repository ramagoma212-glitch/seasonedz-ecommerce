// Version 7, Milestone 173: admin-visible "Latest Courier Guy Status"
// row on the order detail page. The actual mapping/effects engine
// (courierStatusSync.service.ts) is fully covered by backend unit
// tests (courierStatusSync.service.test.ts) — this file only checks
// the small, new frontend display of Shipping.lastCourierStatus/
// lastCourierStatusAt, mocked exactly like
// affiliatePortalAndPaymentConfirmation.spec.js's own admin order
// detail tests.
import { test, expect } from "@playwright/test";

function envelope(data) {
  return JSON.stringify({ success: true, message: "OK", data });
}

function mockAdminAuth(page) {
  return page.route("**/api/admin/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ id: "admin-1", email: "owner@example.invalid" }) }));
}

const BASE_ORDER = {
  orderNumber: "SZ-2026-0003",
  createdAt: "2026-07-01T00:00:00.000Z",
  customer: { firstName: "Thandiwe", lastName: "Nkosi", email: "thandiwe@example.com", phone: "0821234567" },
  deliveryMethod: "COURIER_DOOR",
  deliveryAddress: { streetAddress: "1 Real Street", suburb: "Sandton", city: "Johannesburg", province: "Gauteng", postalCode: "2196", country: "South Africa", deliveryNotes: null },
  collectionCity: null,
  status: "OUT_FOR_DELIVERY",
  paymentStatus: "PAID",
  fulfilmentStatus: "SHIPPED",
  paymentMethod: "PAYFAST",
  items: [],
  subtotal: 500,
  giftWrapTotal: 0,
  deliveryFee: 100,
  discountTotal: 0,
  total: 600,
  payment: { method: "PAYFAST", status: "PAID", amount: 600, provider: "PayFast", paidAt: "2026-07-01T01:00:00.000Z" },
  shipping: {
    status: "SHIPPED",
    courierName: "The Courier Guy",
    trackingNumber: "TRK-000123",
    trackingUrl: null,
    estimatedDelivery: null,
    shippedAt: null,
    deliveredAt: null,
    courierProvider: "courier-guy",
    courierShipmentId: "ship-abc-123",
    courierServiceCode: "LOF",
    courierServiceName: "Local Overnight",
    courierCost: 117,
    courierBookedAt: "2026-07-01T02:00:00.000Z",
    courierBookingAttemptedAt: null,
    courierBookingError: null,
    lastCourierStatus: null,
    lastCourierStatusAt: null,
  },
  hasPhysicalItems: true,
  hasDigitalItems: false,
  isDigitalOnly: false,
};

function mockOrder(page, order) {
  return page.route(`**/api/admin/orders/${order.orderNumber}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope(order) }));
}

function mockStatusHistory(page, orderNumber) {
  return page.route(`**/api/admin/orders/${orderNumber}/status-history`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ statusHistory: [] }) }));
}

test.describe("Admin order detail — automatic courier status visibility (Milestone 173)", () => {
  test("no lastCourierStatus yet: no status row shown, no fabricated data", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOrder(page, BASE_ORDER);
    await mockStatusHistory(page, BASE_ORDER.orderNumber);

    await page.goto(`/admin/orders/${BASE_ORDER.orderNumber}`);
    await expect(page.getByText("Latest Courier Guy Status")).toHaveCount(0);
  });

  test("in-transit status: shown as a neutral badge with a timestamp, no attention warning", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOrder(page, { ...BASE_ORDER, shipping: { ...BASE_ORDER.shipping, lastCourierStatus: "in-transit", lastCourierStatusAt: "2026-07-02T09:00:00.000Z" } });
    await mockStatusHistory(page, BASE_ORDER.orderNumber);

    await page.goto(`/admin/orders/${BASE_ORDER.orderNumber}`);
    const row = page.getByText("Latest Courier Guy Status").locator("..");
    await expect(row).toContainText("In Transit");
    await expect(row.locator(".admin-badge--danger")).toHaveCount(0);
    await expect(page.getByText("may need admin attention")).toHaveCount(0);
  });

  test("undeliverable status: shown with a danger badge and an admin-attention hint", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOrder(page, { ...BASE_ORDER, shipping: { ...BASE_ORDER.shipping, lastCourierStatus: "undeliverable", lastCourierStatusAt: "2026-07-02T09:00:00.000Z" } });
    await mockStatusHistory(page, BASE_ORDER.orderNumber);

    await page.goto(`/admin/orders/${BASE_ORDER.orderNumber}`);
    const row = page.getByText("Latest Courier Guy Status").locator("..");
    await expect(row).toContainText("Undeliverable");
    await expect(row.locator(".admin-badge--danger")).toHaveCount(1);
    await expect(page.getByText("may need admin attention")).toBeVisible();
  });

  test("delivered order: real Order.status/Shipping.status reflected, never a fabricated delivered date", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOrder(page, {
      ...BASE_ORDER,
      status: "DELIVERED",
      shipping: { ...BASE_ORDER.shipping, status: "DELIVERED", deliveredAt: "2026-07-03T14:22:00.000Z", lastCourierStatus: "delivered", lastCourierStatusAt: "2026-07-03T14:22:05.000Z" },
    });
    await mockStatusHistory(page, BASE_ORDER.orderNumber);

    await page.goto(`/admin/orders/${BASE_ORDER.orderNumber}`);
    await expect(page.getByText("Latest Courier Guy Status")).toBeVisible();
    const row = page.getByText("Latest Courier Guy Status").locator("..");
    await expect(row).toContainText("Delivered");
  });

  test("Customer Collection order (no real courier shipment): no courier status row rendered", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOrder(page, { ...BASE_ORDER, deliveryMethod: "COLLECTION", deliveryAddress: null, collectionCity: "Pretoria", shipping: null });
    await mockStatusHistory(page, BASE_ORDER.orderNumber);

    await page.goto(`/admin/orders/${BASE_ORDER.orderNumber}`);
    await expect(page.getByText("Latest Courier Guy Status")).toHaveCount(0);
  });
});
