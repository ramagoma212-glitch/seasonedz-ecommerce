// Version 7, Milestone 174B: auth-gating and param-handling coverage
// for the admin notification list/detail endpoints — the underlying
// read logic itself is covered in adminNotification.service.test.ts.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma.js";
import { listNotificationsHandler, getNotificationHandler } from "./adminNotification.controller.js";

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

const ADMIN_USER = { id: "admin-1", name: "Owner", email: "owner@example.com", role: "ADMIN" };

function fakeReq(overrides: { adminUser?: unknown; query?: Record<string, unknown>; params?: Record<string, string> } = {}) {
  return {
    adminUser: overrides.adminUser,
    query: overrides.query ?? {},
    params: overrides.params ?? {},
  } as unknown as Request;
}

test("listNotificationsHandler: an unauthenticated request is rejected 401 before touching the database", async () => {
  const findMany = stub(prisma.notification, "findMany", mock.fn(async () => {
    throw new Error("must never be called — auth should reject this request first");
  }));
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await listNotificationsHandler(fakeReq({ adminUser: undefined }), res as Response, next);

  assert.equal(res.statusCode, 401);
  assert.equal(findMany.fn.mock.callCount(), 0);

  findMany.restore();
});

test("listNotificationsHandler: an authenticated admin gets a 200 with the list result", async () => {
  const findMany = stub(prisma.notification, "findMany", async () => []);
  const count = stub(prisma.notification, "count", async () => 0);
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await listNotificationsHandler(fakeReq({ adminUser: ADMIN_USER }), res as Response, next);

  assert.equal(res.statusCode, 200);
  assert.equal((res.body as { success: boolean }).success, true);

  findMany.restore();
  count.restore();
});

test("getNotificationHandler: an unauthenticated request is rejected 401 before touching the database", async () => {
  const findUnique = stub(prisma.notification, "findUnique", mock.fn(async () => {
    throw new Error("must never be called — auth should reject this request first");
  }));
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await getNotificationHandler(fakeReq({ adminUser: undefined, params: { id: "notif-1" } }), res as Response, next);

  assert.equal(res.statusCode, 401);
  assert.equal(findUnique.fn.mock.callCount(), 0);

  findUnique.restore();
});

test("getNotificationHandler: a nonexistent id is reported 404, never a raw null success", async () => {
  const findUnique = stub(prisma.notification, "findUnique", async () => null);
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await getNotificationHandler(fakeReq({ adminUser: ADMIN_USER, params: { id: "does-not-exist" } }), res as Response, next);

  assert.equal(res.statusCode, 404);

  findUnique.restore();
});

test("getNotificationHandler: a real id for an authenticated admin returns 200 with the full row", async () => {
  const findUnique = stub(prisma.notification, "findUnique", async () => ({ id: "notif-1", renderedBody: "Body" }));
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await getNotificationHandler(fakeReq({ adminUser: ADMIN_USER, params: { id: "notif-1" } }), res as Response, next);

  assert.equal(res.statusCode, 200);
  assert.equal((res.body as { data: { renderedBody: string } }).data.renderedBody, "Body");

  findUnique.restore();
});
