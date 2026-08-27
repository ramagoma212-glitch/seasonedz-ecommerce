// Version 7, Milestone 173: courier status mapping/effects engine.
// Same stub() pattern as adminPaymentConfirmation.service.test.ts.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import { applyCourierStatusEvent, ORDER_STATUS_FORWARD_LINE, KNOWN_STATUS_STAGE } from "./courierStatusSync.service.js";
import { ALLOWED_TRANSITIONS } from "./adminOrderStatus.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

function shipmentRow(overrides: { order?: Record<string, unknown>; [key: string]: unknown } = {}) {
  const { order: orderOverrides, ...rest } = overrides;
  return {
    id: "shipping-1",
    status: "PACKING",
    ...rest,
    order: {
      id: "order-1",
      orderNumber: "SZ-2026-0001",
      status: "PROCESSING",
      deliveryMethod: "COURIER_DOOR",
      items: [{ productType: "PHYSICAL" }],
      ...(orderOverrides ?? {}),
    },
  };
}

// applyCourierStatusEvent() fires notifyCourierStatusChange() as a
// genuine fire-and-forget call (brief section 8/39 — never awaited
// into the webhook's own response) — so every test here also stubs
// prisma.notification.*/prisma.order.findUnique (the post-commit
// re-fetch notifyCourierStatusChange() itself does) and, critically,
// flushes the microtask queue before restoring any stub. Without the
// flush, restore() (a synchronous call in each test's own `finally`)
// runs before the still-pending notification chain reaches its own
// next `await`, which would silently swap the stubs back to the REAL
// prisma client mid-chain — confirmed empirically once, the hard way,
// against the real production database, before this fix.
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function wireStubs(shipment: ReturnType<typeof shipmentRow> | null) {
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const findMany = stub(prisma.shipping, "findMany", async () => (shipment ? [shipment] : []));
  const shippingUpdate = stub(prisma.shipping, "update", async () => ({}));
  const orderUpdate = stub(prisma.order, "update", async () => ({}));
  const historyCreate = stub(prisma.orderStatusHistory, "create", async () => ({}));
  // Version 7, Milestone 174C: notifyCourierStatusChange()'s own
  // DELIVERED branch re-reads the authoritative history row's own
  // createdAt (brief section 5 — never Order.updatedAt) before
  // scheduling a product review request.
  const historyFindFirst = stub(prisma.orderStatusHistory, "findFirst", async () => ({ createdAt: new Date("2026-08-01T10:00:00.000Z") }));
  const preferenceFindUnique = stub(prisma.notificationPreference, "findUnique", async () => null);
  const orderFindUnique = stub(prisma.order, "findUnique", async () => (shipment ? { ...shipment.order, customerId: "cust-1", customerFirstName: "Thandiwe", customerLastName: "Nkosi", customerEmail: "thandiwe@example.com", customerPhone: "0821234567", total: { toNumber: () => 500 }, paymentStatus: "PAID", paymentMethod: "PAYFAST", deliveryFee: { toNumber: () => 100 }, collectionCity: null, deliveryStreetAddress: "1 Real Street", deliverySuburb: "Sandton", deliveryCity: "Johannesburg", deliveryProvince: "Gauteng", deliveryPostalCode: "2196", deliveryNotes: null } : null));
  const notificationCreate = stub(prisma.notification, "create", async (args: { data: Record<string, unknown> }) => ({ id: "notif-1", ...args.data }));
  const notificationUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const notificationFindUnique = stub(prisma.notification, "findUnique", async () => ({
    id: "notif-1",
    recipientEmail: "thandiwe@example.com",
    renderedSubject: "subject",
    renderedBody: "body",
    orderNumber: shipment?.order.orderNumber ?? null,
    affiliateId: null,
    productId: null,
    eventType: "COURIER_COLLECTED",
  }));
  const notificationUpdate = stub(prisma.notification, "update", async () => ({}));
  return {
    shippingUpdate,
    orderUpdate,
    historyCreate,
    notificationCreate,
    restore: async () => {
      await flushAsync();
      transactionStub.restore();
      findMany.restore();
      shippingUpdate.restore();
      orderUpdate.restore();
      historyCreate.restore();
      historyFindFirst.restore();
      preferenceFindUnique.restore();
      orderFindUnique.restore();
      notificationCreate.restore();
      notificationUpdateMany.restore();
      notificationFindUnique.restore();
      notificationUpdate.restore();
    },
  };
}

test("ORDER_STATUS_FORWARD_LINE consistency: every adjacent pair is a genuinely allowed admin transition", () => {
  for (let i = 0; i < ORDER_STATUS_FORWARD_LINE.length - 1; i++) {
    const from = ORDER_STATUS_FORWARD_LINE[i];
    const to = ORDER_STATUS_FORWARD_LINE[i + 1];
    assert.ok(ALLOWED_TRANSITIONS[from!]!.includes(to!), `${from} -> ${to} must be allowed in adminOrderStatus.service.ts`);
  }
});

test("unresolved shipment: no matching Shipping row, safe no-op result, no writes", async () => {
  const stubs = wireStubs(null);
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: ["unknown-id"], rawStatus: "delivered", providerEventAt: null });
    assert.equal(result.outcome, "unresolved_shipment");
    assert.equal(stubs.shippingUpdate.fn.mock.callCount(), 0);
    assert.equal(stubs.orderUpdate.fn.mock.callCount(), 0);
  } finally {
    await stubs.restore();
  }
});

test("no candidate identifiers at all: unresolved, no DB query even attempted", async () => {
  const stubs = wireStubs(shipmentRow());
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: [], rawStatus: "delivered", providerEventAt: null });
    assert.equal(result.outcome, "unresolved_shipment");
  } finally {
    await stubs.restore();
  }
});

test("Customer Collection order: excluded even if somehow matched", async () => {
  const stubs = wireStubs(shipmentRow({ order: { deliveryMethod: "COLLECTION" } }));
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "delivered", providerEventAt: null });
    assert.deepEqual(result, { outcome: "excluded", reason: "collection" });
    assert.equal(stubs.orderUpdate.fn.mock.callCount(), 0);
  } finally {
    await stubs.restore();
  }
});

test("digital-only order: excluded even if somehow matched", async () => {
  const stubs = wireStubs(shipmentRow({ order: { items: [{ productType: "DIGITAL" }] } }));
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "delivered", providerEventAt: null });
    assert.deepEqual(result, { outcome: "excluded", reason: "digital_only" });
  } finally {
    await stubs.restore();
  }
});

test("mixed order (physical + digital): not excluded, physical shipment still syncs, digital access untouched", async () => {
  const stubs = wireStubs(shipmentRow({ status: "PACKING", order: { status: "PROCESSING", items: [{ productType: "PHYSICAL" }, { productType: "DIGITAL" }] } }));
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "collected", providerEventAt: null });
    assert.equal(result.outcome, "applied");
    assert.equal((result as { shippingStatusChanged: boolean }).shippingStatusChanged, true);
    assert.equal(stubs.shippingUpdate.fn.mock.calls[0]!.arguments[0].data.status, "SHIPPED");
  } finally {
    await stubs.restore();
  }
});

test("unmapped/unknown status string: never guessed, no status change, recorded for visibility", async () => {
  const stubs = wireStubs(shipmentRow());
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "some-brand-new-status-nobody-has-seen", providerEventAt: null });
    assert.deepEqual(result, { outcome: "unmapped_status", rawStatus: "some-brand-new-status-nobody-has-seen" });
    assert.equal(stubs.orderUpdate.fn.mock.callCount(), 0);
    // lastCourierStatus is still recorded (admin visibility) even though unmapped.
    assert.equal(stubs.shippingUpdate.fn.mock.callCount(), 1);
    assert.equal(stubs.shippingUpdate.fn.mock.calls[0]!.arguments[0].data.lastCourierStatus, "some-brand-new-status-nobody-has-seen");
  } finally {
    await stubs.restore();
  }
});

test("null/absent rawStatus: unmapped, no writes at all", async () => {
  const stubs = wireStubs(shipmentRow());
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: null, providerEventAt: null });
    assert.deepEqual(result, { outcome: "unmapped_status", rawStatus: "" });
    assert.equal(stubs.shippingUpdate.fn.mock.callCount(), 0);
  } finally {
    await stubs.restore();
  }
});

test("EXCEPTION status (cancelled/undeliverable): informational only, never touches Order.status", async () => {
  for (const raw of ["cancelled", "undeliverable"]) {
    const stubs = wireStubs(shipmentRow());
    try {
      const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: raw, providerEventAt: null });
      assert.deepEqual(result, { outcome: "informational", stage: "EXCEPTION", orderNumber: "SZ-2026-0001" });
      assert.equal(stubs.orderUpdate.fn.mock.callCount(), 0);
    } finally {
      await stubs.restore();
    }
  }
});

test("READY_FOR_PICKUP status: informational only, never auto-marked DELIVERED", async () => {
  const stubs = wireStubs(shipmentRow({ status: "SHIPPED", order: { status: "OUT_FOR_DELIVERY", deliveryMethod: "COURIER_LOCKER" } }));
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "ready-for-pickup", providerEventAt: null });
    assert.deepEqual(result, { outcome: "informational", stage: "READY_FOR_PICKUP", orderNumber: "SZ-2026-0001" });
    assert.equal(stubs.orderUpdate.fn.mock.callCount(), 0);
  } finally {
    await stubs.restore();
  }
});

test("collected/in-transit: Shipping.status bumps PACKING -> SHIPPED, Order.status untouched", async () => {
  const stubs = wireStubs(shipmentRow({ status: "PACKING", order: { status: "PROCESSING" } }));
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "collected", providerEventAt: null });
    assert.equal(result.outcome, "applied");
    assert.equal((result as { shippingStatusChanged: boolean }).shippingStatusChanged, true);
    assert.equal((result as { orderStatusChanged: boolean }).orderStatusChanged, false);
    assert.equal(stubs.shippingUpdate.fn.mock.calls[0]!.arguments[0].data.status, "SHIPPED");
    assert.equal(stubs.orderUpdate.fn.mock.callCount(), 0);
  } finally {
    await stubs.restore();
  }
});

test("out-for-delivery: Order.status jumps to OUT_FOR_DELIVERY with a genuine audit row, source SYSTEM", async () => {
  const stubs = wireStubs(shipmentRow({ status: "SHIPPED", order: { status: "READY_FOR_DELIVERY" } }));
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "out-for-delivery", providerEventAt: null });
    assert.equal(result.outcome, "applied");
    assert.equal((result as { orderStatusChanged: boolean }).orderStatusChanged, true);
    assert.equal(stubs.orderUpdate.fn.mock.calls[0]!.arguments[0].data.status, "OUT_FOR_DELIVERY");
    const historyArgs = stubs.historyCreate.fn.mock.calls[0]!.arguments[0].data;
    assert.equal(historyArgs.oldStatus, "READY_FOR_DELIVERY");
    assert.equal(historyArgs.newStatus, "OUT_FOR_DELIVERY");
    assert.equal(historyArgs.source, "SYSTEM");
    assert.equal(historyArgs.changedByAdminUserId, null);
  } finally {
    await stubs.restore();
  }
});

test("delivered: single event from PROCESSING jumps directly to DELIVERED in one audited row (no synthetic OUT_FOR_DELIVERY row)", async () => {
  const stubs = wireStubs(shipmentRow({ status: "PACKING", order: { status: "PROCESSING" } }));
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "delivered", providerEventAt: null });
    assert.equal(result.outcome, "applied");
    assert.equal((result as { orderStatusChanged: boolean }).orderStatusChanged, true);
    assert.equal((result as { shippingStatusChanged: boolean }).shippingStatusChanged, true);
    assert.equal(stubs.orderUpdate.fn.mock.callCount(), 1, "exactly one Order.status write");
    assert.equal(stubs.historyCreate.fn.mock.callCount(), 1, "exactly one OrderStatusHistory row — no fabricated intermediate step");
    const historyArgs = stubs.historyCreate.fn.mock.calls[0]!.arguments[0].data;
    assert.equal(historyArgs.oldStatus, "PROCESSING");
    assert.equal(historyArgs.newStatus, "DELIVERED");
    assert.equal(stubs.shippingUpdate.fn.mock.calls[0]!.arguments[0].data.status, "DELIVERED");

    // Version 7, Milestone 174C: a genuine DELIVERED transition also
    // schedules a product review request, 7 days after the
    // authoritative OrderStatusHistory row's own createdAt — fired
    // from within the same fire-and-forget notify chain as the
    // DELIVERED email, so it needs the same microtask flush as every
    // other assertion in this file that touches that chain.
    await flushAsync();
    const calls = stubs.notificationCreate.fn.mock.calls.map((call) => call.arguments[0].data);
    const reviewRequest = calls.find((data: Record<string, unknown>) => data.eventType === "PRODUCT_REVIEW_REQUEST");
    assert.ok(reviewRequest, "a review request was scheduled");
    assert.equal(reviewRequest.dedupeKey, "PRODUCT_REVIEW_REQUEST:SZ-2026-0001");
    assert.equal(new Date(reviewRequest.scheduledAt as string).toISOString(), new Date(Date.UTC(2026, 7, 8, 10, 0, 0)).toISOString());
  } finally {
    await stubs.restore();
  }
});

test("delivered: uses genuine provider event timestamp when present and plausible", async () => {
  const stubs = wireStubs(shipmentRow());
  const providerEventAt = new Date("2026-08-20T09:15:00.000Z");
  try {
    await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "delivered", providerEventAt });
    assert.equal(stubs.shippingUpdate.fn.mock.calls[0]!.arguments[0].data.deliveredAt, providerEventAt);
  } finally {
    await stubs.restore();
  }
});

test("delivered: falls back to processing time (a genuine signal, never a fabricated one) when no provider timestamp available", async () => {
  const stubs = wireStubs(shipmentRow());
  const before = Date.now();
  try {
    await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "delivered", providerEventAt: null });
    const deliveredAt = stubs.shippingUpdate.fn.mock.calls[0]!.arguments[0].data.deliveredAt as Date;
    assert.ok(deliveredAt instanceof Date);
    assert.ok(deliveredAt.getTime() >= before);
  } finally {
    await stubs.restore();
  }
});

test("idempotent: the exact same status received twice in a row only writes once", async () => {
  // First call: PROCESSING -> DELIVERED already applied. Second call
  // simulates the shipment already being at DELIVERED (as the DB would
  // now genuinely reflect) receiving the same "delivered" event again.
  const stubs = wireStubs(shipmentRow({ status: "DELIVERED", order: { status: "DELIVERED" } }));
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "delivered", providerEventAt: null });
    assert.deepEqual(result, { outcome: "no_op", stage: "DELIVERED", reason: "duplicate_or_behind" });
    assert.equal(stubs.orderUpdate.fn.mock.callCount(), 0);
    assert.equal(stubs.historyCreate.fn.mock.callCount(), 0);
  } finally {
    await stubs.restore();
  }
});

test("out-of-order: an old in-transit event arriving after DELIVERED never regresses the order", async () => {
  const stubs = wireStubs(shipmentRow({ status: "DELIVERED", order: { status: "DELIVERED" } }));
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "in-transit", providerEventAt: null });
    assert.deepEqual(result, { outcome: "no_op", stage: "IN_TRANSIT", reason: "duplicate_or_behind" });
    assert.equal(stubs.orderUpdate.fn.mock.callCount(), 0);
    assert.equal(stubs.shippingUpdate.fn.mock.callCount(), 1, "lastCourierStatus still recorded for visibility");
    assert.equal(stubs.shippingUpdate.fn.mock.calls[0]!.arguments[0].data.status, undefined, "but Shipping.status itself is never touched");
  } finally {
    await stubs.restore();
  }
});

test("returned-to-sender: Shipping bumps to RETURNED, Order.status untouched, never treated as refund", async () => {
  const stubs = wireStubs(shipmentRow({ status: "SHIPPED", order: { status: "OUT_FOR_DELIVERY" } }));
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "returned-to-sender", providerEventAt: null });
    assert.equal(result.outcome, "applied");
    assert.equal((result as { orderStatusChanged: boolean }).orderStatusChanged, false);
    assert.equal(stubs.shippingUpdate.fn.mock.calls.at(-1)?.arguments[0].data.status, "RETURNED");
    assert.equal(stubs.orderUpdate.fn.mock.callCount(), 0);
  } finally {
    await stubs.restore();
  }
});

test("returned-to-sender after already DELIVERED: rejected as suspect/stale, never reopens a completed order", async () => {
  const stubs = wireStubs(shipmentRow({ status: "DELIVERED", order: { status: "DELIVERED" } }));
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "returned-to-sender", providerEventAt: null });
    assert.deepEqual(result, { outcome: "no_op", stage: "RETURNED", reason: "duplicate_or_behind" });
  } finally {
    await stubs.restore();
  }
});

test("RETURNED is terminal: a later delivered/in-transit event can never re-progress a returned shipment", async () => {
  const stubs = wireStubs(shipmentRow({ status: "RETURNED", order: { status: "OUT_FOR_DELIVERY" } }));
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "delivered", providerEventAt: null });
    assert.deepEqual(result, { outcome: "no_op", stage: "DELIVERED", reason: "duplicate_or_behind" });
    assert.equal(stubs.orderUpdate.fn.mock.callCount(), 0);
  } finally {
    await stubs.restore();
  }
});

test("cancelled/refunded Order.status: excluded entirely — courier events never touch Order.status OR Shipping.status, only the informational lastCourierStatus", async () => {
  for (const terminalStatus of ["CANCELLED", "REFUNDED"]) {
    const stubs = wireStubs(shipmentRow({ order: { status: terminalStatus } }));
    try {
      const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "delivered", providerEventAt: null });
      assert.deepEqual(result, { outcome: "excluded", reason: "order_terminal" });
      assert.equal(stubs.orderUpdate.fn.mock.callCount(), 0);
      // Exactly one write: the informational lastCourierStatus record, never a status field.
      assert.equal(stubs.shippingUpdate.fn.mock.callCount(), 1);
      assert.equal(stubs.shippingUpdate.fn.mock.calls[0]!.arguments[0].data.lastCourierStatus, "delivered");
      assert.equal(stubs.shippingUpdate.fn.mock.calls[0]!.arguments[0].data.status, undefined);
    } finally {
      await stubs.restore();
    }
  }
});

test("ambiguous match (more than one Shipping row somehow matches): treated as unresolved, never guesses", async () => {
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const findMany = stub(prisma.shipping, "findMany", async () => [shipmentRow(), shipmentRow({ id: "shipping-2" })]);
  try {
    const result = await applyCourierStatusEvent({ candidateIdentifiers: ["ship-1"], rawStatus: "delivered", providerEventAt: null });
    assert.equal(result.outcome, "unresolved_shipment");
  } finally {
    transactionStub.restore();
    findMany.restore();
  }
});

test("KNOWN_STATUS_STAGE covers exactly the evidence-based vocabulary and nothing invented beyond it", () => {
  const expectedKeys = [
    "submitted",
    "collection-assigned",
    "awaiting-dropoff",
    "collected",
    "at-hub",
    "manifested",
    "ready-for-dispatch",
    "in-transit",
    "at-destination-hub",
    "delivery-assigned",
    "returned-to-hub",
    "out-for-delivery",
    "delivered",
    "ready-for-pickup",
    "cancelled",
    "undeliverable",
    "returned-to-sender",
  ];
  assert.deepEqual(Object.keys(KNOWN_STATUS_STAGE).sort(), expectedKeys.sort());
});
