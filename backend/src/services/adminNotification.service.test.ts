// Version 7, Milestone 174B: adminNotification.service.ts is read-only
// (list/detail only, never a write) — no fire-and-forget notification
// chain to worry about here, unlike every other 174B test file this
// milestone touched.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { NotificationStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { listNotifications, getNotification } from "./adminNotification.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "notif-1",
    eventType: "ORDER_PLACED",
    channel: "EMAIL",
    templateName: "order-created",
    recipientEmail: "thandiwe@example.com",
    orderNumber: "SZ-2026-0001",
    affiliateId: null,
    status: NotificationStatus.SENT,
    attemptCount: 1,
    maxAttempts: 3,
    scheduledAt: new Date(),
    sentAt: new Date(),
    failedAt: null,
    lastError: null,
    createdAt: new Date(),
    ...overrides,
  };
}

test("listNotifications: paginates and reports totalPages from the real count, not the page size", async () => {
  const findMany = stub(prisma.notification, "findMany", async () => [row(), row({ id: "notif-2" })]);
  const count = stub(prisma.notification, "count", async () => 45);

  const result = await listNotifications({ page: 2, limit: 20 });

  assert.equal(result.notifications.length, 2);
  assert.equal(result.total, 45);
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 3);
  const findManyArgs = findMany.fn.mock.calls[0]!.arguments[0] as { skip: number; take: number };
  assert.equal(findManyArgs.skip, 20, "page 2 at limit 20 skips the first 20 rows");
  assert.equal(findManyArgs.take, 20);

  findMany.restore();
  count.restore();
});

test("listNotifications: a status filter is passed through to both the findMany and count where clauses", async () => {
  const findMany = stub(prisma.notification, "findMany", async () => []);
  const count = stub(prisma.notification, "count", async () => 0);

  await listNotifications({ page: 1, limit: 20, status: NotificationStatus.FAILED });

  const findManyWhere = (findMany.fn.mock.calls[0]!.arguments[0] as { where: Record<string, unknown> }).where;
  const countWhere = (count.fn.mock.calls[0]!.arguments[0] as { where: Record<string, unknown> }).where;
  assert.equal(findManyWhere.status, "FAILED");
  assert.equal(countWhere.status, "FAILED");

  findMany.restore();
  count.restore();
});

test("listNotifications: an eventType filter is passed through unchanged", async () => {
  const findMany = stub(prisma.notification, "findMany", async () => []);
  const count = stub(prisma.notification, "count", async () => 0);

  await listNotifications({ page: 1, limit: 20, eventType: "PAYMENT_RECEIVED" });

  const findManyWhere = (findMany.fn.mock.calls[0]!.arguments[0] as { where: Record<string, unknown> }).where;
  assert.equal(findManyWhere.eventType, "PAYMENT_RECEIVED");

  findMany.restore();
  count.restore();
});

test("listNotifications: no filters means an empty where clause — every notification is returned", async () => {
  const findMany = stub(prisma.notification, "findMany", async () => []);
  const count = stub(prisma.notification, "count", async () => 0);

  await listNotifications({ page: 1, limit: 20 });

  const findManyWhere = (findMany.fn.mock.calls[0]!.arguments[0] as { where: Record<string, unknown> }).where;
  assert.deepEqual(findManyWhere, {});

  findMany.restore();
  count.restore();
});

test("getNotification: returns the full row (including renderedBody) for a real id", async () => {
  const findUnique = stub(prisma.notification, "findUnique", async () => ({ ...row(), renderedSubject: "Subject", renderedBody: "Body", dedupeKey: "ORDER_PLACED:SZ-2026-0001" }));

  const result = await getNotification("notif-1");
  assert.ok(result);
  assert.equal(result!.renderedBody, "Body");

  findUnique.restore();
});

test("getNotification: returns null for a nonexistent id, never throws", async () => {
  const findUnique = stub(prisma.notification, "findUnique", async () => null);

  const result = await getNotification("does-not-exist");
  assert.equal(result, null);

  findUnique.restore();
});
