// Version 7, Milestone 174C: notification preferences — brief sections
// 21-22, 55.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import { getNotificationPreferences, updateNotificationPreferences } from "./notificationPreference.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

test("getNotificationPreferences: no row yet means every category defaults to opted IN (not opted out)", async () => {
  const findUnique = stub(prisma.notificationPreference, "findUnique", async () => null);

  const result = await getNotificationPreferences("cust-1");
  assert.deepEqual(result, {
    reviewRequestsOptOut: false,
    stockAlertsOptOut: false,
    wishlistAlertsOptOut: false,
    abandonedCheckoutOptOut: false,
  });

  findUnique.restore();
});

test("getNotificationPreferences: a real row's values are returned as-is", async () => {
  const findUnique = stub(prisma.notificationPreference, "findUnique", async () => ({
    reviewRequestsOptOut: true,
    stockAlertsOptOut: false,
    wishlistAlertsOptOut: true,
    abandonedCheckoutOptOut: false,
  }));

  const result = await getNotificationPreferences("cust-1");
  assert.equal(result.reviewRequestsOptOut, true);
  assert.equal(result.wishlistAlertsOptOut, true);
  assert.equal(result.stockAlertsOptOut, false);

  findUnique.restore();
});

test("updateNotificationPreferences: a partial update only touches the fields actually supplied, never resets the others", async () => {
  const upsert = mock.fn(async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({
    reviewRequestsOptOut: false,
    stockAlertsOptOut: true,
    wishlistAlertsOptOut: false,
    abandonedCheckoutOptOut: false,
    ...args.update,
  }));
  const restoreUpsert = stub(prisma.notificationPreference, "upsert", upsert);

  await updateNotificationPreferences("cust-1", { stockAlertsOptOut: true });

  const updateArg = upsert.mock.calls[0]!.arguments[0].update;
  assert.deepEqual(Object.keys(updateArg), ["stockAlertsOptOut"]);
  assert.equal(updateArg.stockAlertsOptOut, true);

  restoreUpsert.restore();
});

test("updateNotificationPreferences: an unknown/extra field in the request body is silently ignored, never written", async () => {
  const upsert = mock.fn(async (args: { update: Record<string, unknown> }) => ({
    reviewRequestsOptOut: false,
    stockAlertsOptOut: false,
    wishlistAlertsOptOut: false,
    abandonedCheckoutOptOut: false,
    ...args.update,
  }));
  const restoreUpsert = stub(prisma.notificationPreference, "upsert", upsert);

  await updateNotificationPreferences("cust-1", { stockAlertsOptOut: true, customerId: "someone-elses-id", isAdmin: true });

  const updateArg = upsert.mock.calls[0]!.arguments[0].update;
  assert.deepEqual(Object.keys(updateArg), ["stockAlertsOptOut"]);

  restoreUpsert.restore();
});

test("updateNotificationPreferences: a non-boolean value for a known field is ignored rather than stored", async () => {
  const upsert = mock.fn(async (args: { update: Record<string, unknown> }) => ({
    reviewRequestsOptOut: false,
    stockAlertsOptOut: false,
    wishlistAlertsOptOut: false,
    abandonedCheckoutOptOut: false,
    ...args.update,
  }));
  const restoreUpsert = stub(prisma.notificationPreference, "upsert", upsert);

  await updateNotificationPreferences("cust-1", { reviewRequestsOptOut: "yes please" });

  const updateArg = upsert.mock.calls[0]!.arguments[0].update;
  assert.deepEqual(updateArg, {});

  restoreUpsert.restore();
});
