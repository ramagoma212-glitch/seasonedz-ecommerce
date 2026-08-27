// Version 7, Milestone 174C: back-in-stock subscriptions — brief
// sections 23-25, 56.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import { StockAlertError, subscribeToStockAlert, notifyStockAlertSubscribersForProduct } from "./stockAlert.service.js";

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

test("subscribeToStockAlert: rejects a product that is currently in stock", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1", stockQuantity: 5 }));

  await assert.rejects(
    () => subscribeToStockAlert("cust-1", "product-1"),
    (error: unknown) => error instanceof StockAlertError && error.statusCode === 409
  );

  productFind.restore();
});

test("subscribeToStockAlert: rejects a nonexistent product with 404", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => null);

  await assert.rejects(
    () => subscribeToStockAlert("cust-1", "does-not-exist"),
    (error: unknown) => error instanceof StockAlertError && error.statusCode === 404
  );

  productFind.restore();
});

test("subscribeToStockAlert: re-subscribing while a PENDING subscription already exists returns that same row, never a duplicate", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1", stockQuantity: 0 }));
  const existing = { id: "alert-1", productId: "product-1", status: "PENDING", createdAt: new Date() };
  const alertFind = stub(prisma.stockAlertSubscription, "findFirst", async () => existing);
  const create = mock.fn(async () => {
    throw new Error("must never be called — a PENDING subscription already exists");
  });
  const alertCreate = stub(prisma.stockAlertSubscription, "create", create);

  const result = await subscribeToStockAlert("cust-1", "product-1");
  assert.equal(result.id, "alert-1");
  assert.equal(create.mock.callCount(), 0);

  productFind.restore();
  alertFind.restore();
  alertCreate.restore();
});

test("subscribeToStockAlert: a genuinely new subscription is created when no PENDING one exists (covers re-subscribing after being NOTIFIED)", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1", stockQuantity: 0 }));
  const alertFind = stub(prisma.stockAlertSubscription, "findFirst", async () => null);
  const alertCreate = stub(prisma.stockAlertSubscription, "create", async () => ({ id: "alert-2", productId: "product-1", status: "PENDING", createdAt: new Date() }));

  const result = await subscribeToStockAlert("cust-1", "product-1");
  assert.equal(result.id, "alert-2");

  productFind.restore();
  alertFind.restore();
  alertCreate.restore();
});

test("notifyStockAlertSubscribersForProduct: a subscription claimed by a concurrent run (count 0) is never notified twice", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ name: "ABC Colouring Book", slug: "abc-colouring-book" }));
  const alertFindMany = stub(prisma.stockAlertSubscription, "findMany", async () => [{ id: "alert-1", customerId: "cust-1" }]);
  const alertUpdateMany = stub(prisma.stockAlertSubscription, "updateMany", async () => ({ count: 0 })); // already claimed
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "notif-1" })));

  await notifyStockAlertSubscribersForProduct("product-1");
  await flushAsync();
  assert.equal(notificationCreate.fn.mock.callCount(), 0);

  productFind.restore();
  alertFindMany.restore();
  alertUpdateMany.restore();
  notificationCreate.restore();
});

test("notifyStockAlertSubscribersForProduct: a customer who opted out of stock alerts is claimed (consumed) but never emailed", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ name: "ABC Colouring Book", slug: "abc-colouring-book" }));
  const alertFindMany = stub(prisma.stockAlertSubscription, "findMany", async () => [{ id: "alert-1", customerId: "cust-1" }]);
  const alertUpdateMany = stub(prisma.stockAlertSubscription, "updateMany", mock.fn(async () => ({ count: 1 })));
  const preferenceFind = stub(prisma.notificationPreference, "findUnique", async () => ({ stockAlertsOptOut: true }));
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "notif-1" })));

  await notifyStockAlertSubscribersForProduct("product-1");
  await flushAsync();
  assert.equal(alertUpdateMany.fn.mock.callCount(), 1, "still claimed/consumed even though no email is sent");
  assert.equal(notificationCreate.fn.mock.callCount(), 0);

  productFind.restore();
  alertFindMany.restore();
  alertUpdateMany.restore();
  preferenceFind.restore();
  notificationCreate.restore();
});

test("notifyStockAlertSubscribersForProduct: a genuine PENDING subscriber gets exactly one STOCK_ALERT notification", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ name: "ABC Colouring Book", slug: "abc-colouring-book" }));
  const alertFindMany = stub(prisma.stockAlertSubscription, "findMany", async () => [{ id: "alert-1", customerId: "cust-1" }]);
  const alertUpdateMany = stub(prisma.stockAlertSubscription, "updateMany", async () => ({ count: 1 }));
  const preferenceFind = stub(prisma.notificationPreference, "findUnique", async () => null);
  const customerFind = stub(prisma.customer, "findUnique", async () => ({ firstName: "Thandiwe", email: "thandiwe@example.com" }));
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "notif-1" })));
  const notificationUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const notificationFindUnique = stub(prisma.notification, "findUnique", async () => ({
    id: "notif-1", eventType: "STOCK_ALERT", templateName: "stock-alert", recipientEmail: "thandiwe@example.com",
    orderNumber: null, affiliateId: null, productId: "product-1", renderedSubject: "s", renderedBody: "b", attemptCount: 1, maxAttempts: 3,
  }));
  const notificationUpdate = stub(prisma.notification, "update", async () => ({}));

  await notifyStockAlertSubscribersForProduct("product-1");
  await flushAsync();
  assert.equal(notificationCreate.fn.mock.callCount(), 1);
  const data = notificationCreate.fn.mock.calls[0]!.arguments[0].data;
  assert.equal(data.eventType, "STOCK_ALERT");
  assert.equal(data.dedupeKey, "STOCK_ALERT:alert-1");

  productFind.restore();
  alertFindMany.restore();
  alertUpdateMany.restore();
  preferenceFind.restore();
  customerFind.restore();
  notificationCreate.restore();
  notificationUpdateMany.restore();
  notificationFindUnique.restore();
  notificationUpdate.restore();
});
