// Version 7, Milestone 174C: controller-level IDOR/wiring coverage —
// the underlying read/mutation logic itself is covered in
// customerNotification.service.test.ts.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma.js";
import { getMyNotificationHandler, markMyNotificationReadHandler } from "./customerNotification.controller.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
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

function fakeReq(customerId: string, params: Record<string, string> = {}) {
  return { customerUser: { id: customerId }, params } as unknown as Request;
}

test("getMyNotificationHandler: a notification belonging to a different customer is reported 404, never leaked", async () => {
  const findFirst = stub(prisma.notification, "findFirst", async () => null);
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await getMyNotificationHandler(fakeReq("cust-1", { id: "someone-elses-notification" }), res as Response, next);

  assert.equal(res.statusCode, 404);
  const where = findFirst.fn.mock.calls[0]!.arguments[0].where;
  assert.equal(where.recipientCustomerId, "cust-1", "the query itself is always scoped to the authenticated customer, never a body/query value");

  findFirst.restore();
});

test("markMyNotificationReadHandler: marking another customer's notification is reported 404, never a silent success", async () => {
  const updateMany = stub(prisma.notification, "updateMany", async () => ({ count: 0 }));
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await markMyNotificationReadHandler(fakeReq("cust-1", { id: "someone-elses-notification" }), res as Response, next);

  assert.equal(res.statusCode, 404);

  updateMany.restore();
});

test("markMyNotificationReadHandler: a genuine own notification is marked read successfully", async () => {
  const updateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await markMyNotificationReadHandler(fakeReq("cust-1", { id: "notif-1" }), res as Response, next);

  assert.equal(res.statusCode, 200);

  updateMany.restore();
});
