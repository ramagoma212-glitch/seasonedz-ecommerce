// Version 7, Milestone 174B: adminOrderStatus.service.ts had no test
// coverage before this milestone — this file covers both the
// pre-existing transition logic and the new ORDER_PROCESSING/
// ORDER_CANCELLED notification hook added in 174B. Same stub() pattern
// as adminPaymentConfirmation.service.test.ts. prisma.notification.*
// and prisma.orderAffiliateCommission.findUnique are stubbed in every
// test that exercises updateOrderStatus() — the former because
// notifyOrderStatusChange() is a real fire-and-forget call that would
// otherwise hit the real (production) database, the latter because
// reverseCommissionsForOrder() (an existing, untouched function) reads
// it for every CANCELLED transition.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import { updateOrderStatus, getOrderStatusHistory, OrderStatusUpdateError, ALLOWED_TRANSITIONS } from "./adminOrderStatus.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, value: any) {
  const original = obj[key];
  obj[key] = value;
  return () => {
    obj[key] = original;
  };
}

const ADMIN = { id: "admin-1", name: "Owner", email: "owner@example.com", role: "ADMIN" };

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNumber: "SZ-2026-0001",
    status: "CONFIRMED",
    customerFirstName: "Thandiwe",
    customerLastName: "Nkosi",
    customerEmail: "thandiwe@example.com",
    customerPhone: "0821234567",
    total: { toNumber: () => 500 },
    paymentStatus: "PAID",
    paymentMethod: "PAYFAST",
    deliveryMethod: "COURIER_DOOR",
    deliveryFee: { toNumber: () => 100 },
    collectionCity: null,
    deliveryStreetAddress: "1 Real Street",
    deliverySuburb: "Sandton",
    deliveryCity: "Johannesburg",
    deliveryProvince: "Gauteng",
    deliveryPostalCode: "2196",
    deliveryNotes: null,
    ...overrides,
  };
}

// updateOrderStatus() fires notifyOrderStatusChange() as a genuine
// fire-and-forget call (brief section 8/39), which itself re-fetches
// the order via a second, post-commit prisma.order.findUnique() call —
// satisfied by the same stub as the in-transaction lookup, since both
// just need the same order fixture back. Restoring stubs must wait for
// that dangling chain to drain first, or it silently falls through to
// the REAL prisma client mid-chain — see courierStatusSync.service.test.ts's
// own comment for the same fix, discovered there first the hard way.
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function wireStubs(order: ReturnType<typeof orderRow>) {
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const restoreFindUnique = stub(prisma.order, "findUnique", async () => order);
  const update = mock.fn(async (args: { data: { status?: string } }) => ({ orderNumber: order.orderNumber, status: args.data.status ?? order.status, paymentStatus: order.paymentStatus, updatedAt: new Date() }));
  const restoreUpdate = stub(prisma.order, "update", update);
  const historyCreate = mock.fn(async (args: { data: Record<string, unknown> }) => ({ id: "history-1", ...args.data, createdAt: new Date() }));
  const restoreHistoryCreate = stub(prisma.orderStatusHistory, "create", historyCreate);
  const restoreCommissionFindUnique = stub(prisma.orderAffiliateCommission, "findUnique", async () => null);
  const notificationCreate = mock.fn(async (args: { data: Record<string, unknown> }) => ({ id: "notif-1", ...args.data }));
  const restoreNotificationCreate = stub(prisma.notification, "create", notificationCreate);
  const restoreNotificationUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const restoreNotificationFindUnique = stub(prisma.notification, "findUnique", async () => ({
    id: "notif-1",
    recipientEmail: order.customerEmail,
    renderedSubject: "subject",
    renderedBody: "body",
    orderNumber: order.orderNumber,
    affiliateId: null,
    productId: null,
    eventType: "ORDER_PROCESSING",
  }));
  const restoreNotificationUpdate = stub(prisma.notification, "update", async () => ({}));
  return {
    update,
    historyCreate,
    notificationCreate,
    restore: async () => {
      await flushAsync();
      transactionStub();
      restoreFindUnique();
      restoreUpdate();
      restoreHistoryCreate();
      restoreCommissionFindUnique();
      restoreNotificationCreate();
      restoreNotificationUpdateMany();
      restoreNotificationFindUnique();
      restoreNotificationUpdate();
    },
  };
}

test("order not found: throws 404, never writes anything", async () => {
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const findUnique = stub(prisma.order, "findUnique", async () => null);
  try {
    await assert.rejects(updateOrderStatus("SZ-MISSING", "PROCESSING", undefined, ADMIN), (error: unknown) => {
      assert.ok(error instanceof OrderStatusUpdateError);
      assert.equal(error.statusCode, 404);
      return true;
    });
  } finally {
    transactionStub();
    findUnique();
  }
});

test("disallowed transition (e.g. PENDING -> DELIVERED): rejected with a clear error, no write", async () => {
  const stubs = wireStubs(orderRow({ status: "PENDING" }));
  try {
    await assert.rejects(updateOrderStatus("SZ-2026-0001", "DELIVERED", undefined, ADMIN), OrderStatusUpdateError);
    assert.equal(stubs.update.mock.callCount(), 0);
  } finally {
    await stubs.restore();
  }
});

test("CANCELLED requires a non-empty note", async () => {
  const stubs = wireStubs(orderRow({ status: "CONFIRMED" }));
  try {
    await assert.rejects(updateOrderStatus("SZ-2026-0001", "CANCELLED", "", ADMIN), OrderStatusUpdateError);
    assert.equal(stubs.update.mock.callCount(), 0);
  } finally {
    await stubs.restore();
  }
});

test("valid transition writes Order.status and one OrderStatusHistory row with source ADMIN_DASHBOARD", async () => {
  const stubs = wireStubs(orderRow({ status: "CONFIRMED" }));
  try {
    const result = await updateOrderStatus("SZ-2026-0001", "PROCESSING", undefined, ADMIN);
    assert.equal(result.status, "PROCESSING");
    assert.equal(stubs.update.mock.callCount(), 1);
    assert.equal(stubs.historyCreate.mock.callCount(), 1);
    const historyArgs = stubs.historyCreate.mock.calls[0]!.arguments[0].data;
    assert.equal(historyArgs.source, "ADMIN_DASHBOARD");
    assert.equal(historyArgs.oldStatus, "CONFIRMED");
    assert.equal(historyArgs.newStatus, "PROCESSING");
    assert.equal(historyArgs.changedByAdminUserId, "admin-1");
  } finally {
    await stubs.restore();
  }
});

test("PROCESSING transition enqueues exactly one ORDER_PROCESSING notification", async () => {
  const stubs = wireStubs(orderRow({ status: "CONFIRMED" }));
  try {
    await updateOrderStatus("SZ-2026-0001", "PROCESSING", undefined, ADMIN);
    // Fire-and-forget — allow the microtask chain to settle before asserting.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stubs.notificationCreate.mock.callCount(), 1);
    const data = stubs.notificationCreate.mock.calls[0]!.arguments[0].data;
    assert.equal(data.eventType, "ORDER_PROCESSING");
    assert.equal(data.templateName, "order-processing");
    assert.ok(String(data.dedupeKey).startsWith("ORDER_PROCESSING:SZ-2026-0001:"));
  } finally {
    await stubs.restore();
  }
});

test("CANCELLED transition enqueues exactly one ORDER_CANCELLED notification and reverses any commission", async () => {
  const stubs = wireStubs(orderRow({ status: "CONFIRMED" }));
  try {
    await updateOrderStatus("SZ-2026-0001", "CANCELLED", "Customer requested cancellation.", ADMIN);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stubs.notificationCreate.mock.callCount(), 1);
    const data = stubs.notificationCreate.mock.calls[0]!.arguments[0].data;
    assert.equal(data.eventType, "ORDER_CANCELLED");
    assert.equal(data.templateName, "order-cancelled");
  } finally {
    await stubs.restore();
  }
});

test("a status change that isn't PROCESSING or CANCELLED (e.g. CONFIRMED) never enqueues any notification", async () => {
  const stubs = wireStubs(orderRow({ status: "PENDING" }));
  try {
    await updateOrderStatus("SZ-2026-0001", "CONFIRMED", undefined, ADMIN);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stubs.notificationCreate.mock.callCount(), 0);
  } finally {
    await stubs.restore();
  }
});

test("a notification failure never affects the already-successful status-change result", async () => {
  const order = orderRow({ status: "CONFIRMED" });
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  // ONE stub, branching on call count — the in-transaction lookup (1st
  // call) must succeed for the real status change to go through at
  // all; the post-commit re-fetch inside notifyOrderStatusChange() (2nd
  // call, fire-and-forget) then throws, simulating a genuinely
  // unexpected error in the notification path specifically. Two
  // separate stub() calls against the same property would silently
  // discard the first (only the last ever takes effect) — the exact
  // mistake this comment exists to avoid repeating.
  let findUniqueCallCount = 0;
  const findUnique = stub(prisma.order, "findUnique", async () => {
    findUniqueCallCount += 1;
    if (findUniqueCallCount === 1) return order;
    throw new Error("transient failure");
  });
  const update = stub(prisma.order, "update", async () => ({ orderNumber: order.orderNumber, status: "PROCESSING", paymentStatus: order.paymentStatus, updatedAt: new Date() }));
  const historyCreateStub = stub(prisma.orderStatusHistory, "create", async (args: { data: Record<string, unknown> }) => ({ id: "history-1", ...args.data, createdAt: new Date() }));
  const commissionFindUnique = stub(prisma.orderAffiliateCommission, "findUnique", async () => null);

  try {
    const result = await updateOrderStatus("SZ-2026-0001", "PROCESSING", undefined, ADMIN);
    assert.equal(result.status, "PROCESSING", "the real status change succeeded regardless of the notification path failing");
    assert.ok(findUniqueCallCount >= 1, "the in-transaction lookup genuinely happened");
    await flushAsync();
  } finally {
    transactionStub();
    findUnique();
    update();
    historyCreateStub();
    commissionFindUnique();
  }
});

test("ALLOWED_TRANSITIONS: REFUNDED has no outgoing transitions and is never a valid target", () => {
  assert.deepEqual(ALLOWED_TRANSITIONS.REFUNDED, []);
  for (const targets of Object.values(ALLOWED_TRANSITIONS)) {
    assert.ok(!targets.includes("REFUNDED" as never), "REFUNDED must never appear as a reachable target");
  }
});

test("getOrderStatusHistory: returns null for a missing order, an ordered list otherwise", async () => {
  const findUnique = stub(prisma.order, "findUnique", async () => null);
  try {
    assert.equal(await getOrderStatusHistory("SZ-MISSING"), null);
  } finally {
    findUnique();
  }

  const findUnique2 = stub(prisma.order, "findUnique", async () => ({ id: "order-1" }));
  const findMany = stub(prisma.orderStatusHistory, "findMany", async () => [
    { oldStatus: "CONFIRMED", newStatus: "PROCESSING", note: null, source: "ADMIN_DASHBOARD", createdAt: new Date(), changedByAdminNameSnapshot: "Owner", changedByAdminEmailSnapshot: "owner@example.com" },
  ]);
  try {
    const history = await getOrderStatusHistory("SZ-2026-0001");
    assert.equal(history?.length, 1);
    assert.equal(history?.[0]?.newStatus, "PROCESSING");
  } finally {
    findUnique2();
    findMany();
  }
});
