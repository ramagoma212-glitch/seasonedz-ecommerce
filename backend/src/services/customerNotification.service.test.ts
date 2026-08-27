// Version 7, Milestone 174C: Customer Notification Centre — brief
// sections 16-19, 55. Read-only + read-state mutation only — no
// fire-and-forget chain here, unlike most other 174B/174C services.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import {
  listNotificationsForCustomer,
  getNotificationForCustomer,
  markNotificationRead,
  markAllNotificationsRead,
} from "./customerNotification.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

test("listNotificationsForCustomer: scopes both findMany and count to this customer's own SENT rows only", async () => {
  const findMany = stub(prisma.notification, "findMany", async () => []);
  const count = stub(prisma.notification, "count", async () => 0);

  await listNotificationsForCustomer("cust-1", 1, 20);

  const findManyWhere = findMany.fn.mock.calls[0]!.arguments[0].where;
  assert.equal(findManyWhere.recipientCustomerId, "cust-1");
  assert.equal(findManyWhere.status, "SENT");
  assert.equal(count.fn.mock.calls[0]!.arguments[0].where.recipientCustomerId, "cust-1");

  findMany.restore();
  count.restore();
});

test("listNotificationsForCustomer: reports a genuinely separate unreadCount alongside the paginated total", async () => {
  const findMany = stub(prisma.notification, "findMany", async () => []);
  const count = mock.fn(async (args: { where: Record<string, unknown> }) => ("readAt" in args.where ? 3 : 12));
  const restoreCount = stub(prisma.notification, "count", count);

  const result = await listNotificationsForCustomer("cust-1", 1, 20);
  assert.equal(result.total, 12);
  assert.equal(result.unreadCount, 3);

  findMany.restore();
  restoreCount.restore();
});

test("getNotificationForCustomer: returns null for a notification belonging to a different customer — never leaks its existence", async () => {
  const findFirst = stub(prisma.notification, "findFirst", async () => null);

  const result = await getNotificationForCustomer("cust-1", "notif-owned-by-someone-else");
  assert.equal(result, null);

  const where = findFirst.fn.mock.calls[0]!.arguments[0].where;
  assert.equal(where.recipientCustomerId, "cust-1");
  assert.equal(where.id, "notif-owned-by-someone-else");

  findFirst.restore();
});

test("getNotificationForCustomer: a genuine own notification includes the full body", async () => {
  const findFirst = stub(prisma.notification, "findFirst", async () => ({
    id: "notif-1",
    eventType: "DELIVERED",
    renderedSubject: "Your order has been delivered",
    renderedBody: "Full body text",
    orderNumber: "SZ-1",
    readAt: null,
    sentAt: new Date(),
    createdAt: new Date(),
  }));

  const result = await getNotificationForCustomer("cust-1", "notif-1");
  assert.ok(result);
  assert.equal(result!.body, "Full body text");
  assert.equal(result!.subject, "Your order has been delivered");

  findFirst.restore();
});

test("markNotificationRead: returns false (never throws) when the notification doesn't belong to this customer", async () => {
  const updateMany = stub(prisma.notification, "updateMany", async () => ({ count: 0 }));

  const marked = await markNotificationRead("cust-1", "not-mine");
  assert.equal(marked, false);

  updateMany.restore();
});

test("markNotificationRead: returns true and scopes the update to this customer's own row", async () => {
  const updateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));

  const marked = await markNotificationRead("cust-1", "notif-1");
  assert.equal(marked, true);
  const args = updateMany.fn.mock.calls[0]!.arguments[0];
  assert.equal(args.where.recipientCustomerId, "cust-1");
  assert.equal(args.where.id, "notif-1");
  assert.ok(args.data.readAt instanceof Date);

  updateMany.restore();
});

test("markAllNotificationsRead: only ever touches this customer's own currently-unread SENT rows", async () => {
  const updateMany = stub(prisma.notification, "updateMany", async () => ({ count: 4 }));

  const count = await markAllNotificationsRead("cust-1");
  assert.equal(count, 4);
  const args = updateMany.fn.mock.calls[0]!.arguments[0];
  assert.equal(args.where.recipientCustomerId, "cust-1");
  assert.equal(args.where.status, "SENT");
  assert.equal(args.where.readAt, null);

  updateMany.restore();
});
