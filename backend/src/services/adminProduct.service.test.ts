// Version 7, Milestone 174C: adminProduct.service.ts had no test
// coverage before this milestone. This file is deliberately scoped
// only to the new stock-transition notification hook (brief section
// 24) added to updateProduct() — a full CRUD test backfill is a
// separate, pre-existing gap outside this milestone's brief.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { updateProduct } from "./adminProduct.service.js";

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

function productRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "product-1",
    name: "ABC Colouring Book",
    slug: "abc-colouring-book",
    sku: "ABC-1",
    shortDescription: null,
    description: null,
    price: new Prisma.Decimal("100.00"),
    oldPrice: null,
    stockQuantity: 0,
    lowStockThreshold: 5,
    status: "ACTIVE",
    categoryId: "cat-1",
    category: { id: "cat-1", name: "Colouring", slug: "colouring" },
    ageRange: null,
    features: null,
    discountLabel: null,
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    images: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    productType: "PHYSICAL",
    digitalTermsNote: null,
    downloadEnabled: true,
    ...overrides,
  };
}

test("updateProduct: a genuine 0 -> positive stock transition notifies both explicit subscribers and wishlisted customers", async () => {
  const findUnique = stub(prisma.product, "findUnique", async () => productRow({ stockQuantity: 0 }));
  const update = stub(prisma.product, "update", async () => productRow({ stockQuantity: 5 }));
  const alertFindMany = stub(prisma.stockAlertSubscription, "findMany", async () => [{ id: "alert-1", customerId: "cust-1" }]);
  const alertUpdateMany = stub(prisma.stockAlertSubscription, "updateMany", async () => ({ count: 1 }));
  const wishlistFindMany = stub(prisma.wishlistItem, "findMany", async () => [{ id: "wish-1", customerId: "cust-2" }]);
  const preferenceFindUnique = stub(prisma.notificationPreference, "findUnique", async () => null);
  const customerFindUnique = stub(prisma.customer, "findUnique", async () => ({ firstName: "Thandiwe", email: "thandiwe@example.com" }));
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "notif-1" })));
  const notificationUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const notificationFindUnique = stub(prisma.notification, "findUnique", async () => ({
    id: "notif-1",
    eventType: "STOCK_ALERT",
    templateName: "stock-alert",
    recipientEmail: "thandiwe@example.com",
    orderNumber: null,
    affiliateId: null,
    productId: "product-1",
    renderedSubject: "Subject",
    renderedBody: "Body",
    attemptCount: 1,
    maxAttempts: 3,
  }));
  const notificationUpdate = stub(prisma.notification, "update", async () => ({}));

  try {
    await updateProduct("product-1", { stockQuantity: 5 });
    await flushAsync();

    assert.equal(notificationCreate.fn.mock.callCount(), 2, "one STOCK_ALERT and one WISHLIST_STOCK_ALERT");
    const eventTypes = notificationCreate.fn.mock.calls.map((call) => call.arguments[0].data.eventType).sort();
    assert.deepEqual(eventTypes, ["STOCK_ALERT", "WISHLIST_STOCK_ALERT"]);
  } finally {
    findUnique.restore();
    update.restore();
    alertFindMany.restore();
    alertUpdateMany.restore();
    wishlistFindMany.restore();
    preferenceFindUnique.restore();
    customerFindUnique.restore();
    notificationCreate.restore();
    notificationUpdateMany.restore();
    notificationFindUnique.restore();
    notificationUpdate.restore();
  }
});

test("updateProduct: stock staying positive (e.g. 10 -> 8) never fires a stock-alert notification", async () => {
  const findUnique = stub(prisma.product, "findUnique", async () => productRow({ stockQuantity: 10 }));
  const update = stub(prisma.product, "update", async () => productRow({ stockQuantity: 8 }));
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "notif-1" })));

  try {
    await updateProduct("product-1", { stockQuantity: 8 });
    await flushAsync();
    assert.equal(notificationCreate.fn.mock.callCount(), 0);
  } finally {
    findUnique.restore();
    update.restore();
    notificationCreate.restore();
  }
});

test("updateProduct: an edit that never touches stockQuantity at all never fires a stock-alert notification", async () => {
  const findUnique = stub(prisma.product, "findUnique", async () => productRow({ stockQuantity: 0 }));
  const update = stub(prisma.product, "update", async () => productRow({ stockQuantity: 0, name: "Renamed" }));
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "notif-1" })));

  try {
    await updateProduct("product-1", { name: "Renamed" });
    await flushAsync();
    assert.equal(notificationCreate.fn.mock.callCount(), 0);
  } finally {
    findUnique.restore();
    update.restore();
    notificationCreate.restore();
  }
});
