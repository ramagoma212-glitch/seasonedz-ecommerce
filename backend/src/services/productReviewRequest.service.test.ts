// Version 7, Milestone 174C: product review request scheduling + lazy
// rendering — brief sections 5, 7, 8, 9, 10, 11, 14, 54.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { PaymentStatus, ProductType } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import {
  scheduleProductReviewRequestForDeliveredOrder,
  scheduleProductReviewRequestForDigitalOrder,
  renderProductReviewRequestContent,
  reviewRequestDedupeKey,
  reviewReminderDedupeKey,
} from "./productReviewRequest.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const DELIVERED_AT = new Date("2026-08-01T10:00:00.000Z");
const PAID_AT = new Date("2026-08-01T10:00:00.000Z");

// ---------------------------------------------------------------------------
// scheduleProductReviewRequestForDeliveredOrder
// ---------------------------------------------------------------------------

test("scheduleProductReviewRequestForDeliveredOrder: a guest order (no customerId) is never scheduled", async () => {
  const orderFind = stub(prisma.order, "findUnique", async () => ({ customerId: null, customerEmail: "guest@example.com", paymentStatus: PaymentStatus.PAID }));
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "n1" })));

  await scheduleProductReviewRequestForDeliveredOrder("SZ-1", DELIVERED_AT);
  assert.equal(notificationCreate.fn.mock.callCount(), 0);

  orderFind.restore();
  notificationCreate.restore();
});

test("scheduleProductReviewRequestForDeliveredOrder: an unpaid order is never scheduled", async () => {
  const orderFind = stub(prisma.order, "findUnique", async () => ({ customerId: "cust-1", customerEmail: "a@example.com", paymentStatus: PaymentStatus.PENDING }));
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "n1" })));

  await scheduleProductReviewRequestForDeliveredOrder("SZ-1", DELIVERED_AT);
  assert.equal(notificationCreate.fn.mock.callCount(), 0);

  orderFind.restore();
  notificationCreate.restore();
});

test("scheduleProductReviewRequestForDeliveredOrder: a customer who opted out of review requests is never scheduled", async () => {
  const orderFind = stub(prisma.order, "findUnique", async () => ({ customerId: "cust-1", customerEmail: "a@example.com", paymentStatus: PaymentStatus.PAID }));
  const prefFind = stub(prisma.notificationPreference, "findUnique", async () => ({ reviewRequestsOptOut: true }));
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "n1" })));

  await scheduleProductReviewRequestForDeliveredOrder("SZ-1", DELIVERED_AT);
  assert.equal(notificationCreate.fn.mock.callCount(), 0);

  orderFind.restore();
  prefFind.restore();
  notificationCreate.restore();
});

test("scheduleProductReviewRequestForDeliveredOrder: a real, eligible order is scheduled exactly 7 days after the delivered timestamp", async () => {
  const orderFind = stub(prisma.order, "findUnique", async () => ({ customerId: "cust-1", customerEmail: "thandiwe@example.com", paymentStatus: PaymentStatus.PAID }));
  const prefFind = stub(prisma.notificationPreference, "findUnique", async () => null);
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "n1" })));

  await scheduleProductReviewRequestForDeliveredOrder("SZ-1", DELIVERED_AT);
  assert.equal(notificationCreate.fn.mock.callCount(), 1);
  const data = notificationCreate.fn.mock.calls[0]!.arguments[0].data;
  assert.equal(data.eventType, "PRODUCT_REVIEW_REQUEST");
  assert.equal(data.dedupeKey, reviewRequestDedupeKey("SZ-1"));
  assert.equal(data.recipientCustomerId, "cust-1");
  assert.equal(new Date(data.scheduledAt).toISOString(), new Date(DELIVERED_AT.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString());
  // Never pre-rendered — see notificationEngine.service.ts's own lazy-render comment.
  assert.equal(data.renderedSubject, undefined);

  orderFind.restore();
  prefFind.restore();
  notificationCreate.restore();
});

// ---------------------------------------------------------------------------
// scheduleProductReviewRequestForDigitalOrder
// ---------------------------------------------------------------------------

test("scheduleProductReviewRequestForDigitalOrder: an order with any physical item is never scheduled here — it waits for delivery instead", async () => {
  const orderFind = stub(prisma.order, "findUnique", async () => ({
    customerId: "cust-1",
    customerEmail: "a@example.com",
    items: [{ productType: ProductType.DIGITAL }, { productType: ProductType.PHYSICAL }],
  }));
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "n1" })));

  await scheduleProductReviewRequestForDigitalOrder("SZ-2", PAID_AT);
  assert.equal(notificationCreate.fn.mock.callCount(), 0);

  orderFind.restore();
  notificationCreate.restore();
});

test("scheduleProductReviewRequestForDigitalOrder: a guest order is never scheduled", async () => {
  const orderFind = stub(prisma.order, "findUnique", async () => ({ customerId: null, customerEmail: "guest@example.com", items: [{ productType: ProductType.DIGITAL }] }));
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "n1" })));

  await scheduleProductReviewRequestForDigitalOrder("SZ-2", PAID_AT);
  assert.equal(notificationCreate.fn.mock.callCount(), 0);

  orderFind.restore();
  notificationCreate.restore();
});

test("scheduleProductReviewRequestForDigitalOrder: a 100%-digital order is scheduled exactly 3 days after payment", async () => {
  const orderFind = stub(prisma.order, "findUnique", async () => ({
    customerId: "cust-1",
    customerEmail: "thandiwe@example.com",
    items: [{ productType: ProductType.DIGITAL }, { productType: ProductType.DIGITAL }],
  }));
  const prefFind = stub(prisma.notificationPreference, "findUnique", async () => null);
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "n1" })));

  await scheduleProductReviewRequestForDigitalOrder("SZ-2", PAID_AT);
  assert.equal(notificationCreate.fn.mock.callCount(), 1);
  const data = notificationCreate.fn.mock.calls[0]!.arguments[0].data;
  assert.equal(data.dedupeKey, reviewRequestDedupeKey("SZ-2"));
  assert.equal(new Date(data.scheduledAt).toISOString(), new Date(PAID_AT.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString());

  orderFind.restore();
  prefFind.restore();
  notificationCreate.restore();
});

// ---------------------------------------------------------------------------
// renderProductReviewRequestContent — the lazy renderer
// ---------------------------------------------------------------------------

const ORDER_WITH_ITEMS = {
  paymentStatus: PaymentStatus.PAID,
  items: [
    { productId: "prod-1", productName: "ABC Colouring Book" },
    { productId: "prod-2", productName: "123 Activity Book" },
  ],
};

test("renderProductReviewRequestContent: cancels when orderNumber/recipientCustomerId is missing", async () => {
  const outcome = await renderProductReviewRequestContent({ id: "n1", eventType: "PRODUCT_REVIEW_REQUEST", orderNumber: null, recipientCustomerId: "cust-1" });
  assert.equal(outcome.kind, "cancel");
});

test("renderProductReviewRequestContent: cancels when the customer opted out between scheduling and sending", async () => {
  const prefFind = stub(prisma.notificationPreference, "findUnique", async () => ({ reviewRequestsOptOut: true }));

  const outcome = await renderProductReviewRequestContent({ id: "n1", eventType: "PRODUCT_REVIEW_REQUEST", orderNumber: "SZ-1", recipientCustomerId: "cust-1" });
  assert.equal(outcome.kind, "cancel");

  prefFind.restore();
});

test("renderProductReviewRequestContent: cancels when every purchased product has already been reviewed", async () => {
  const prefFind = stub(prisma.notificationPreference, "findUnique", async () => null);
  const orderFind = stub(prisma.order, "findUnique", async () => ORDER_WITH_ITEMS);
  const customerFind = stub(prisma.customer, "findUnique", async () => ({ firstName: "Thandiwe" }));
  const reviewFindMany = stub(prisma.productReview, "findMany", async () => [{ productId: "prod-1" }, { productId: "prod-2" }]);
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "n2" })));

  const outcome = await renderProductReviewRequestContent({ id: "n1", eventType: "PRODUCT_REVIEW_REQUEST", orderNumber: "SZ-1", recipientCustomerId: "cust-1" });
  assert.equal(outcome.kind, "cancel");
  await flushAsync();
  assert.equal(notificationCreate.fn.mock.callCount(), 0, "no reminder is scheduled off the back of a cancelled request");

  prefFind.restore();
  orderFind.restore();
  customerFind.restore();
  reviewFindMany.restore();
  notificationCreate.restore();
});

test("renderProductReviewRequestContent: lists only the still-unreviewed product when one of two has already been reviewed", async () => {
  const prefFind = stub(prisma.notificationPreference, "findUnique", async () => null);
  const orderFind = stub(prisma.order, "findUnique", async () => ORDER_WITH_ITEMS);
  const customerFind = stub(prisma.customer, "findUnique", async () => ({ firstName: "Thandiwe" }));
  const reviewFindMany = stub(prisma.productReview, "findMany", async () => [{ productId: "prod-1" }]);
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "n2" })));

  const outcome = await renderProductReviewRequestContent({ id: "n1", eventType: "PRODUCT_REVIEW_REQUEST", orderNumber: "SZ-1", recipientCustomerId: "cust-1" });
  assert.equal(outcome.kind, "send");
  if (outcome.kind === "send") {
    assert.match(outcome.rendered.body, /123 Activity Book/);
    assert.doesNotMatch(outcome.rendered.body, /ABC Colouring Book/);
    assert.match(outcome.rendered.body, /account\/orders\/SZ-1/);
  }

  await flushAsync();
  assert.equal(notificationCreate.fn.mock.callCount(), 1, "the initial request schedules exactly one reminder");
  const reminderData = notificationCreate.fn.mock.calls[0]!.arguments[0].data;
  assert.equal(reminderData.eventType, "PRODUCT_REVIEW_REMINDER");
  assert.equal(reminderData.dedupeKey, reviewReminderDedupeKey("SZ-1"));

  prefFind.restore();
  orderFind.restore();
  customerFind.restore();
  reviewFindMany.restore();
  notificationCreate.restore();
});

test("renderProductReviewRequestContent: the reminder itself never schedules a further, third reminder", async () => {
  const prefFind = stub(prisma.notificationPreference, "findUnique", async () => null);
  const orderFind = stub(prisma.order, "findUnique", async () => ORDER_WITH_ITEMS);
  const customerFind = stub(prisma.customer, "findUnique", async () => ({ firstName: "Thandiwe" }));
  const reviewFindMany = stub(prisma.productReview, "findMany", async () => []);
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "n2" })));

  const outcome = await renderProductReviewRequestContent({ id: "n1", eventType: "PRODUCT_REVIEW_REMINDER", orderNumber: "SZ-1", recipientCustomerId: "cust-1" });
  assert.equal(outcome.kind, "send");

  await flushAsync();
  assert.equal(notificationCreate.fn.mock.callCount(), 0, "a reminder never spawns another reminder");

  prefFind.restore();
  orderFind.restore();
  customerFind.restore();
  reviewFindMany.restore();
  notificationCreate.restore();
});
