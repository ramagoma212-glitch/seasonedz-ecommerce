// Version 7, Milestone 174C: abandoned checkout recovery — brief
// sections 30-37, 58.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import {
  captureCheckoutIntent,
  markCheckoutIntentRecovered,
  renderAbandonedCheckoutReminderContent,
  getRecoverableCartByToken,
} from "./checkoutIntent.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

// ---------------------------------------------------------------------------
// captureCheckoutIntent
// ---------------------------------------------------------------------------

test("captureCheckoutIntent: an invalid email is a silent no-op — never creates a row", async () => {
  const create = stub(prisma.checkoutIntent, "create", mock.fn(async () => ({ id: "intent-1" })));

  await captureCheckoutIntent({ email: "not-an-email", customerId: null, items: [{ productSlug: "product-1", quantity: 1 }] });
  assert.equal(create.fn.mock.callCount(), 0);

  create.restore();
});

test("captureCheckoutIntent: no genuine cart items is a silent no-op", async () => {
  const create = stub(prisma.checkoutIntent, "create", mock.fn(async () => ({ id: "intent-1" })));

  await captureCheckoutIntent({ email: "thandiwe@example.com", customerId: null, items: [] });
  assert.equal(create.fn.mock.callCount(), 0);

  create.restore();
});

test("captureCheckoutIntent: a genuinely new capture creates an intent and schedules exactly one reminder, 2 hours out", async () => {
  const findFirst = stub(prisma.checkoutIntent, "findFirst", async () => null);
  const create = stub(prisma.checkoutIntent, "create", async () => ({ id: "intent-1" }));
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "notif-1" })));

  const before = Date.now();
  await captureCheckoutIntent({ email: "Thandiwe@Example.com", customerId: null, items: [{ productSlug: "product-1", quantity: 2 }] });

  assert.equal(notificationCreate.fn.mock.callCount(), 1);
  const data = notificationCreate.fn.mock.calls[0]!.arguments[0].data;
  assert.equal(data.eventType, "ABANDONED_CHECKOUT_REMINDER");
  assert.equal(data.dedupeKey, "ABANDONED_CHECKOUT_REMINDER:intent-1");
  const scheduledAt = new Date(data.scheduledAt).getTime();
  assert.ok(scheduledAt >= before + 2 * 60 * 60 * 1000 - 1000 && scheduledAt <= Date.now() + 2 * 60 * 60 * 1000 + 1000);

  findFirst.restore();
  create.restore();
  notificationCreate.restore();
});

test("captureCheckoutIntent: a repeated capture for the same still-ACTIVE intent only updates the snapshot, never a second reminder", async () => {
  const findFirst = stub(prisma.checkoutIntent, "findFirst", async () => ({ id: "intent-1", customerId: null }));
  const update = stub(prisma.checkoutIntent, "update", mock.fn(async () => ({})));
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "notif-1" })));

  await captureCheckoutIntent({ email: "thandiwe@example.com", customerId: null, items: [{ productSlug: "product-2", quantity: 1 }] });

  assert.equal(update.fn.mock.callCount(), 1);
  assert.equal(notificationCreate.fn.mock.callCount(), 0, "no second reminder scheduled for an already-active intent");

  findFirst.restore();
  update.restore();
  notificationCreate.restore();
});

// ---------------------------------------------------------------------------
// markCheckoutIntentRecovered
// ---------------------------------------------------------------------------

test("markCheckoutIntentRecovered: marks matching ACTIVE intents RECOVERED and cancels their pending reminder", async () => {
  const findMany = stub(prisma.checkoutIntent, "findMany", async () => [{ id: "intent-1" }]);
  const updateMany = stub(prisma.checkoutIntent, "updateMany", mock.fn(async () => ({ count: 1 })));
  const notificationUpdateMany = stub(prisma.notification, "updateMany", mock.fn(async () => ({ count: 1 })));

  await markCheckoutIntentRecovered("Thandiwe@Example.com");

  assert.equal(updateMany.fn.mock.callCount(), 1);
  assert.equal(updateMany.fn.mock.calls[0]!.arguments[0].data.status, "RECOVERED");
  assert.equal(notificationUpdateMany.fn.mock.callCount(), 1);
  assert.equal(notificationUpdateMany.fn.mock.calls[0]!.arguments[0].where.dedupeKey, "ABANDONED_CHECKOUT_REMINDER:intent-1");

  findMany.restore();
  updateMany.restore();
  notificationUpdateMany.restore();
});

test("markCheckoutIntentRecovered: no matching intent is a safe no-op", async () => {
  const findMany = stub(prisma.checkoutIntent, "findMany", async () => []);
  const updateMany = stub(prisma.checkoutIntent, "updateMany", mock.fn(async () => ({ count: 0 })));

  await markCheckoutIntentRecovered("nobody@example.com");
  assert.equal(updateMany.fn.mock.callCount(), 0);

  findMany.restore();
  updateMany.restore();
});

// ---------------------------------------------------------------------------
// renderAbandonedCheckoutReminderContent — the lazy renderer
// ---------------------------------------------------------------------------

test("renderAbandonedCheckoutReminderContent: cancels when the intent was already recovered by a completed order", async () => {
  const intentFind = stub(prisma.checkoutIntent, "findUnique", async () => ({ id: "intent-1", status: "RECOVERED" }));

  const outcome = await renderAbandonedCheckoutReminderContent({ dedupeKey: "ABANDONED_CHECKOUT_REMINDER:intent-1", recipientCustomerId: null });
  assert.equal(outcome.kind, "cancel");

  intentFind.restore();
});

test("renderAbandonedCheckoutReminderContent: cancels when the customer opted out between capture and send", async () => {
  const intentFind = stub(prisma.checkoutIntent, "findUnique", async () => ({ id: "intent-1", status: "ACTIVE", customerId: "cust-1", recoveryToken: "tok" }));
  const prefFind = stub(prisma.notificationPreference, "findUnique", async () => ({ abandonedCheckoutOptOut: true }));

  const outcome = await renderAbandonedCheckoutReminderContent({ dedupeKey: "ABANDONED_CHECKOUT_REMINDER:intent-1", recipientCustomerId: "cust-1" });
  assert.equal(outcome.kind, "cancel");

  intentFind.restore();
  prefFind.restore();
});

test("renderAbandonedCheckoutReminderContent: a still-ACTIVE, non-opted-out intent produces a real recovery link and marks the intent REMINDED", async () => {
  const intentFind = stub(prisma.checkoutIntent, "findUnique", async () => ({ id: "intent-1", status: "ACTIVE", customerId: null, recoveryToken: "abc123" }));
  const intentUpdate = stub(prisma.checkoutIntent, "update", mock.fn(async () => ({})));

  const outcome = await renderAbandonedCheckoutReminderContent({ dedupeKey: "ABANDONED_CHECKOUT_REMINDER:intent-1", recipientCustomerId: null });
  assert.equal(outcome.kind, "send");
  if (outcome.kind === "send") {
    assert.match(outcome.rendered.body, /abc123/);
  }
  assert.equal(intentUpdate.fn.mock.calls[0]!.arguments[0].data.status, "REMINDED");

  intentFind.restore();
  intentUpdate.restore();
});

// ---------------------------------------------------------------------------
// getRecoverableCartByToken
// ---------------------------------------------------------------------------

test("getRecoverableCartByToken: returns null for an unknown token", async () => {
  const intentFind = stub(prisma.checkoutIntent, "findUnique", async () => null);

  const result = await getRecoverableCartByToken("does-not-exist");
  assert.equal(result, null);

  intentFind.restore();
});

test("getRecoverableCartByToken: returns null once the intent has already been RECOVERED — never re-servable", async () => {
  const intentFind = stub(prisma.checkoutIntent, "findUnique", async () => ({ status: "RECOVERED", cartSnapshot: [] }));

  const result = await getRecoverableCartByToken("abc123");
  assert.equal(result, null);

  intentFind.restore();
});

test("getRecoverableCartByToken: a product deleted from the catalogue since capture is silently dropped, never a broken line", async () => {
  const intentFind = stub(prisma.checkoutIntent, "findUnique", async () => ({
    status: "ACTIVE",
    cartSnapshot: [{ productSlug: "abc", quantity: 2 }, { productSlug: "deleted-product", quantity: 1 }],
  }));
  const productFindMany = stub(prisma.product, "findMany", async () => [{ slug: "abc", name: "ABC", price: { toNumber: () => 100 }, images: [] }]);

  const result = await getRecoverableCartByToken("abc123");
  assert.equal(result!.length, 1);
  assert.equal(result![0]!.productSlug, "abc");
  assert.equal(result![0]!.price, 100);

  intentFind.restore();
  productFindMany.restore();
});
