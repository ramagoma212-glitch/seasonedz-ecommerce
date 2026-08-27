// Version 7, Milestone 174B: notification-integration coverage for
// processPayfastNotification()'s PAYMENT_RECEIVED (COMPLETE) and
// PAYMENT_FAILED (FAILED/CANCELLED) hooks — this file previously had
// zero test coverage of any kind. Signature/source/server-validation
// hardening (Milestones 22/29/35) already has its own dedicated
// coverage in payfastSignature.ts/payfastSourceVerification.ts's own
// logic being pure functions; this file exists specifically to prove
// the notification engine integration behaves correctly: the right
// eventType/dedupeKey/recipient on each real transition, and no
// notification at all on an idempotent duplicate ITN.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma, ProductType } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { payfastConfig } from "../config/payfast.js";
import { generatePayfastSignature } from "../utils/payfastSignature.js";
import { processPayfastNotification, PaymentError } from "./payfast.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

// processPayfastNotification() fires its PAYMENT_RECEIVED/PAYMENT_FAILED
// notification fire-and-forget (`void notificationEngine.enqueueAndSendNow(...).catch(...)`),
// never awaited by the caller — the chain (prisma.notification.create/
// updateMany/findUnique/update) keeps running after the function itself
// has already returned. Restoring prisma stubs synchronously right
// after that await would let it fall through to the REAL (production)
// database mid-flight — the exact leak already confirmed and fixed
// elsewhere this milestone. flushAsync() lets one full microtask queue
// drain before restoring.
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const FAKE_REQ = {} as Request;

const originalConfig = { ...payfastConfig };
function configurePayfastForTest() {
  payfastConfig.enabled = true;
  payfastConfig.merchantId = "test-merchant-id";
  payfastConfig.passphrase = undefined;
}
function restorePayfastConfig() {
  Object.assign(payfastConfig, originalConfig);
}

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNumber: "SZ-2026-0001",
    customerId: null,
    customerFirstName: "Thandiwe",
    customerLastName: "Nkosi",
    customerEmail: "thandiwe@example.com",
    customerPhone: "+27821234567",
    total: new Prisma.Decimal("918.00"),
    paymentStatus: PaymentStatus.PENDING,
    paymentMethod: PaymentMethod.PAYFAST,
    status: OrderStatus.PENDING,
    deliveryMethod: "COURIER_DOOR",
    deliveryFee: new Prisma.Decimal("80.00"),
    collectionCity: null,
    deliveryStreetAddress: "1 Main Street",
    deliverySuburb: "Suburb",
    deliveryCity: "Polokwane",
    deliveryProvince: "Limpopo",
    deliveryPostalCode: "0700",
    deliveryNotes: null,
    payment: { provider: null },
    items: [{ productType: ProductType.PHYSICAL }],
    ...overrides,
  };
}

// Builds a rawBody + valid signature the same way a real PayFast ITN
// would sign it (verifyPayfastSignature recomputes over every posted
// field except "signature" itself, in insertion order, with empty
// values kept) — see payfastSignature.ts's own header comment for why
// this can't be a hardcoded string.
function signedNotifyBody(fields: Record<string, string>): Record<string, string> {
  const withoutSignature = { ...fields };
  const signature = generatePayfastSignature(withoutSignature, payfastConfig.passphrase, { skipEmptyValues: false });
  return { ...withoutSignature, signature };
}

function stubNotificationChain(templateName: string, recipientEmail: string) {
  const notificationCreate = stub(prisma.notification, "create", async () => ({ id: "notif-1" }));
  const notificationUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const notificationFindUnique = stub(prisma.notification, "findUnique", async () => ({
    id: "notif-1",
    eventType: "PAYMENT_RECEIVED",
    templateName,
    recipientEmail,
    orderNumber: "SZ-2026-0001",
    affiliateId: null,
    productId: null,
    renderedSubject: "Subject",
    renderedBody: "Body",
    attemptCount: 1,
    maxAttempts: 3,
  }));
  const notificationUpdate = stub(prisma.notification, "update", async () => ({}));
  return {
    create: notificationCreate,
    restore: async () => {
      await flushAsync();
      notificationCreate.restore();
      notificationUpdateMany.restore();
      notificationFindUnique.restore();
      notificationUpdate.restore();
    },
  };
}

test("COMPLETE on a fresh order marks it PAID and enqueues exactly one PAYMENT_RECEIVED notification", async () => {
  configurePayfastForTest();
  const findUnique = stub(prisma.order, "findUnique", async () => orderRow());
  const transactionStub = stub(prisma, "$transaction", async (ops: unknown[]) => Promise.all(ops));
  const paymentUpdate = stub(prisma.payment, "update", async () => ({}));
  const orderUpdate = stub(prisma.order, "update", async () => ({}));
  const notifications = stubNotificationChain("payment-confirmed", "thandiwe@example.com");

  const body = signedNotifyBody({
    m_payment_id: "SZ-2026-0001",
    payment_status: "COMPLETE",
    amount_gross: "918.00",
    merchant_id: "test-merchant-id",
    pf_payment_id: "pf-123",
  });

  const result = await processPayfastNotification(body, FAKE_REQ);
  assert.equal(result.message, "Payment verified and marked as PAID.");
  assert.equal(notifications.create.fn.mock.callCount(), 1);
  const createArgs = notifications.create.fn.mock.calls[0]!.arguments[0] as { data: Record<string, unknown> };
  assert.equal(createArgs.data.eventType, "PAYMENT_RECEIVED");
  assert.equal(createArgs.data.dedupeKey, "PAYMENT_RECEIVED:SZ-2026-0001");
  assert.equal(createArgs.data.recipientEmail, "thandiwe@example.com");
  assert.equal(createArgs.data.orderNumber, "SZ-2026-0001");

  findUnique.restore();
  transactionStub.restore();
  paymentUpdate.restore();
  orderUpdate.restore();
  await notifications.restore();
  restorePayfastConfig();
});

test("COMPLETE on a 100%-digital order for a logged-in customer also schedules a product review request 3 days out", async () => {
  configurePayfastForTest();
  const digitalOrder = orderRow({ customerId: "cust-1", items: [{ productType: "DIGITAL" }] });
  const findUnique = stub(prisma.order, "findUnique", async () => digitalOrder);
  const transactionStub = stub(prisma, "$transaction", async (ops: unknown[]) => Promise.all(ops));
  const paymentUpdate = stub(prisma.payment, "update", async () => ({}));
  const orderUpdate = stub(prisma.order, "update", async () => ({}));
  const preferenceFindUnique = stub(prisma.notificationPreference, "findUnique", async () => null);
  const notifications = stubNotificationChain("payment-confirmed", "thandiwe@example.com");

  const body = signedNotifyBody({
    m_payment_id: "SZ-2026-0001",
    payment_status: "COMPLETE",
    amount_gross: "918.00",
    merchant_id: "test-merchant-id",
    pf_payment_id: "pf-123",
  });

  await processPayfastNotification(body, FAKE_REQ);
  await flushAsync();

  const calls = notifications.create.fn.mock.calls.map((call) => (call.arguments[0] as { data: Record<string, unknown> }).data);
  const reviewRequest = calls.find((data) => data.eventType === "PRODUCT_REVIEW_REQUEST");
  assert.ok(reviewRequest, "a review request was scheduled for the 100%-digital order");
  assert.equal(reviewRequest!.dedupeKey, "PRODUCT_REVIEW_REQUEST:SZ-2026-0001");

  findUnique.restore();
  transactionStub.restore();
  paymentUpdate.restore();
  orderUpdate.restore();
  preferenceFindUnique.restore();
  await notifications.restore();
  restorePayfastConfig();
});

test("a duplicate COMPLETE ITN on an already-PAID order is acknowledged idempotently — never a second notification", async () => {
  configurePayfastForTest();
  const findUnique = stub(prisma.order, "findUnique", async () => orderRow({ paymentStatus: PaymentStatus.PAID }));
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "notif-1" })));

  const body = signedNotifyBody({
    m_payment_id: "SZ-2026-0001",
    payment_status: "COMPLETE",
    amount_gross: "918.00",
    merchant_id: "test-merchant-id",
    pf_payment_id: "pf-123",
  });

  const result = await processPayfastNotification(body, FAKE_REQ);
  assert.equal(result.message, "Payment already recorded as PAID; duplicate notification acknowledged.");
  await flushAsync();
  assert.equal(notificationCreate.fn.mock.callCount(), 0, "no notification is ever enqueued for an idempotent duplicate");

  findUnique.restore();
  notificationCreate.restore();
  restorePayfastConfig();
});

test("FAILED marks the order FAILED and enqueues one PAYMENT_FAILED notification, dedupeKey scoped to this attempt", async () => {
  configurePayfastForTest();
  const findUnique = stub(prisma.order, "findUnique", async () => orderRow());
  const paymentUpdate = stub(prisma.payment, "update", async () => ({}));
  const orderUpdate = stub(prisma.order, "update", async () => ({}));
  const notifications = stubNotificationChain("payment-failed-or-cancelled", "thandiwe@example.com");

  const body = signedNotifyBody({
    m_payment_id: "SZ-2026-0001",
    payment_status: "FAILED",
    amount_gross: "918.00",
    merchant_id: "test-merchant-id",
    pf_payment_id: "pf-attempt-1",
  });

  const result = await processPayfastNotification(body, FAKE_REQ);
  assert.equal(result.message, "Payment marked as FAILED.");
  assert.equal(notifications.create.fn.mock.callCount(), 1);
  const createArgs = notifications.create.fn.mock.calls[0]!.arguments[0] as { data: Record<string, unknown> };
  assert.equal(createArgs.data.eventType, "PAYMENT_FAILED");
  assert.equal(createArgs.data.dedupeKey, "PAYMENT_FAILED:SZ-2026-0001:pf-attempt-1");

  findUnique.restore();
  paymentUpdate.restore();
  orderUpdate.restore();
  await notifications.restore();
  restorePayfastConfig();
});

test("CANCELLED marks the order CANCELLED and enqueues one PAYMENT_FAILED notification with its own dedupeKey", async () => {
  configurePayfastForTest();
  const findUnique = stub(prisma.order, "findUnique", async () => orderRow());
  const paymentUpdate = stub(prisma.payment, "update", async () => ({}));
  const orderUpdate = stub(prisma.order, "update", async () => ({}));
  const notifications = stubNotificationChain("payment-failed-or-cancelled", "thandiwe@example.com");

  const body = signedNotifyBody({
    m_payment_id: "SZ-2026-0001",
    payment_status: "CANCELLED",
    amount_gross: "918.00",
    merchant_id: "test-merchant-id",
    pf_payment_id: "pf-attempt-2",
  });

  const result = await processPayfastNotification(body, FAKE_REQ);
  assert.equal(result.message, "Payment marked as CANCELLED.");
  assert.equal(notifications.create.fn.mock.callCount(), 1);
  const createArgs = notifications.create.fn.mock.calls[0]!.arguments[0] as { data: Record<string, unknown> };
  assert.equal(createArgs.data.eventType, "PAYMENT_FAILED");
  assert.equal(createArgs.data.dedupeKey, "PAYMENT_FAILED:SZ-2026-0001:pf-attempt-2");

  findUnique.restore();
  paymentUpdate.restore();
  orderUpdate.restore();
  await notifications.restore();
  restorePayfastConfig();
});

test("a second, later retry (a different PayFast payment id) for the same order gets its own distinct FAILED dedupeKey", async () => {
  configurePayfastForTest();
  const findUnique = stub(prisma.order, "findUnique", async () => orderRow());
  const paymentUpdate = stub(prisma.payment, "update", async () => ({}));
  const orderUpdate = stub(prisma.order, "update", async () => ({}));
  const notifications = stubNotificationChain("payment-failed-or-cancelled", "thandiwe@example.com");

  const firstAttempt = signedNotifyBody({
    m_payment_id: "SZ-2026-0001",
    payment_status: "FAILED",
    amount_gross: "918.00",
    merchant_id: "test-merchant-id",
    pf_payment_id: "pf-attempt-1",
  });
  const secondAttempt = signedNotifyBody({
    m_payment_id: "SZ-2026-0001",
    payment_status: "FAILED",
    amount_gross: "918.00",
    merchant_id: "test-merchant-id",
    pf_payment_id: "pf-attempt-2",
  });

  await processPayfastNotification(firstAttempt, FAKE_REQ);
  await processPayfastNotification(secondAttempt, FAKE_REQ);

  assert.equal(notifications.create.fn.mock.callCount(), 2);
  const firstKey = (notifications.create.fn.mock.calls[0]!.arguments[0] as { data: Record<string, unknown> }).data.dedupeKey;
  const secondKey = (notifications.create.fn.mock.calls[1]!.arguments[0] as { data: Record<string, unknown> }).data.dedupeKey;
  assert.notEqual(firstKey, secondKey);

  findUnique.restore();
  paymentUpdate.restore();
  orderUpdate.restore();
  await notifications.restore();
  restorePayfastConfig();
});

test("an invalid signature is rejected with 403 before any notification work happens", async () => {
  configurePayfastForTest();
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "notif-1" })));

  const body = {
    m_payment_id: "SZ-2026-0001",
    payment_status: "COMPLETE",
    amount_gross: "918.00",
    merchant_id: "test-merchant-id",
    pf_payment_id: "pf-123",
    signature: "0000000000000000000000000000000",
  };

  await assert.rejects(
    () => processPayfastNotification(body, FAKE_REQ),
    (error: unknown) => error instanceof PaymentError && error.statusCode === 403
  );
  assert.equal(notificationCreate.fn.mock.callCount(), 0);

  notificationCreate.restore();
  restorePayfastConfig();
});
