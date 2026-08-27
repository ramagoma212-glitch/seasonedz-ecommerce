// Version 7, Milestone 174B: notification-integration coverage for
// createOrderHandler()'s ORDER_PLACED (customer) + ADMIN_NEW_ORDER
// (admin) hooks — this controller had zero test coverage of any kind
// before this milestone. orderService is imported as `import * as
// orderService`, a frozen ES module namespace (cannot be monkeypatched
// — see courierWebhook.controller.test.ts's own header comment for the
// same limitation), so createOrder() is left to run for real here,
// with only its own underlying prisma calls stubbed — the same
// low-level approach order.service.test.ts's own stubReferralOrderCreation()
// helper already established for a successful order creation.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { createOrderHandler } from "./order.controller.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

// createOrderHandler() fires both notifications fire-and-forget
// (`void notificationEngine.enqueueAndSendNow(...).catch(...)`), never
// awaited into the response — the chains keep running (through
// prisma.notification.create/updateMany/findUnique/update) after the
// handler itself has already sent its response. Restoring prisma stubs
// synchronously right after that would let them fall through to the
// REAL (production) database mid-flight — the exact leak already
// confirmed and fixed elsewhere this milestone. flushAsync() lets one
// full microtask queue drain before restoring.
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function fakeRes() {
  const res: { statusCode?: number; body?: unknown } & Partial<Response> = {};
  res.status = mock.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as unknown as Response["status"];
  res.json = mock.fn((body: unknown) => {
    res.body = body;
    return res as Response;
  }) as unknown as Response["json"];
  return res;
}

const VALID_BODY = {
  customer: { firstName: "Thandiwe", lastName: "Nkosi", email: "thandiwe@example.com", phone: "+27821234567" },
  deliveryMethod: "COLLECTION",
  deliveryAddress: null,
  collectionCity: "Pretoria",
  paymentMethod: "BANK_TRANSFER",
  items: [{ productSlug: "test-product", quantity: 1, giftWrap: false, giftMessage: null }],
};

function fakeReq(overrides: { body?: unknown; customerUser?: { id: string } } = {}) {
  return {
    body: overrides.body ?? VALID_BODY,
    customerUser: overrides.customerUser,
  } as unknown as Request;
}

const PHYSICAL_PRODUCT = {
  id: "product-1",
  slug: "test-product",
  name: "Test Colouring Book",
  sku: "TCB-1",
  status: "ACTIVE",
  price: new Prisma.Decimal(100),
  productType: "PHYSICAL",
  digitalAsset: null,
  downloadEnabled: true,
  stockQuantity: 10,
};

function fakeOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    orderNumber: "SG-2026-TEST",
    createdAt: new Date(),
    customerFirstName: "Thandiwe",
    customerLastName: "Nkosi",
    customerEmail: "thandiwe@example.com",
    customerPhone: "+27821234567",
    deliveryMethod: "COLLECTION",
    deliveryStreetAddress: null,
    deliverySuburb: null,
    deliveryCity: null,
    deliveryProvince: null,
    deliveryPostalCode: null,
    deliveryCountry: "South Africa",
    deliveryNotes: null,
    collectionCity: "Pretoria",
    status: "PENDING",
    paymentStatus: "PENDING",
    fulfilmentStatus: "NOT_STARTED",
    paymentMethod: "BANK_TRANSFER",
    items: [],
    subtotal: new Prisma.Decimal(100),
    giftWrapTotal: new Prisma.Decimal(0),
    deliveryFee: new Prisma.Decimal(0),
    discountTotal: new Prisma.Decimal(0),
    total: new Prisma.Decimal(100),
    payment: null,
    shipping: null,
    ...overrides,
  };
}

function stubSuccessfulOrderCreation() {
  const productFind = stub(prisma.product, "findUnique", async () => PHYSICAL_PRODUCT);
  // generateOrderNumber()'s own uniqueness check hits this same
  // findUnique — real production read (never a write), same accepted
  // precedent as order.service.test.ts's own createOrder() tests, none
  // of which stub this away either.
  const orderFindUnique = stub(prisma.order, "findUnique", async () => null);
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const updateMany = stub(prisma.product, "updateMany", async () => ({ count: 1 }));
  const orderCreate = stub(prisma.order, "create", async () => fakeOrderRow());
  const notificationCreate = stub(prisma.notification, "create", async () => ({ id: "notif-1" }));
  const notificationUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const notificationFindUnique = stub(prisma.notification, "findUnique", async () => ({
    id: "notif-1",
    eventType: "ORDER_PLACED",
    templateName: "order-created",
    recipientEmail: "thandiwe@example.com",
    orderNumber: "SG-2026-TEST",
    affiliateId: null,
    productId: null,
    renderedSubject: "Subject",
    renderedBody: "Body",
    attemptCount: 1,
    maxAttempts: 3,
  }));
  const notificationUpdate = stub(prisma.notification, "update", async () => ({}));
  return {
    orderCreate,
    notificationCreate,
    restore: async () => {
      productFind.restore();
      orderFindUnique.restore();
      transactionStub.restore();
      updateMany.restore();
      orderCreate.restore();
      await flushAsync();
      notificationCreate.restore();
      notificationUpdateMany.restore();
      notificationFindUnique.restore();
      notificationUpdate.restore();
    },
  };
}

test("a successful order creation enqueues exactly one ORDER_PLACED and one ADMIN_NEW_ORDER notification", async () => {
  const stubs = stubSuccessfulOrderCreation();
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await createOrderHandler(fakeReq(), res as Response, next);

  assert.equal(res.statusCode, 201);
  assert.equal((next as unknown as ReturnType<typeof mock.fn>).mock.callCount(), 0);
  await flushAsync();
  assert.equal(stubs.notificationCreate.fn.mock.callCount(), 2);

  const calls = stubs.notificationCreate.fn.mock.calls.map((call) => (call.arguments[0] as { data: Record<string, unknown> }).data);
  const orderPlaced = calls.find((data) => data.eventType === "ORDER_PLACED");
  const adminNewOrder = calls.find((data) => data.eventType === "ADMIN_NEW_ORDER");

  assert.ok(orderPlaced, "ORDER_PLACED notification was enqueued");
  assert.equal(orderPlaced!.dedupeKey, "ORDER_PLACED:SG-2026-TEST");
  assert.equal(orderPlaced!.recipientEmail, "thandiwe@example.com");
  assert.equal(orderPlaced!.orderNumber, "SG-2026-TEST");

  assert.ok(adminNewOrder, "ADMIN_NEW_ORDER notification was enqueued");
  assert.equal(adminNewOrder!.dedupeKey, "ADMIN_NEW_ORDER:SG-2026-TEST");
  assert.equal(adminNewOrder!.orderNumber, "SG-2026-TEST");

  await stubs.restore();
});

test("an invalid request body is rejected 400 before any order or notification is created", async () => {
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "notif-1" })));
  const orderCreate = stub(prisma.order, "create", mock.fn(async () => {
    throw new Error("must never be called — validation should reject this request first");
  }));
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await createOrderHandler(fakeReq({ body: { customer: {}, items: [] } }), res as Response, next);

  assert.equal(res.statusCode, 400);
  await flushAsync();
  assert.equal(notificationCreate.fn.mock.callCount(), 0);
  assert.equal(orderCreate.fn.mock.callCount(), 0);

  notificationCreate.restore();
  orderCreate.restore();
});
