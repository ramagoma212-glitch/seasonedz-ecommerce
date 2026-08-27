// Version 7, Milestone 174C: checkout-intent controller — wiring
// coverage. The underlying logic is covered in
// checkoutIntent.service.test.ts.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma.js";
import { captureCheckoutIntentHandler, recoverCheckoutIntentHandler } from "./checkoutIntent.controller.js";

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

test("captureCheckoutIntentHandler: always returns success — never surfaces an error banner mid-checkout", async () => {
  const findFirst = stub(prisma.checkoutIntent, "findFirst", async () => null);
  const create = stub(prisma.checkoutIntent, "create", async () => ({ id: "intent-1" }));
  const notificationCreate = stub(prisma.notification, "create", async () => ({ id: "notif-1" }));
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await captureCheckoutIntentHandler(
    { customerUser: undefined, body: { email: "thandiwe@example.com", items: [{ productId: "product-1", quantity: 1 }] } } as unknown as Request,
    res as Response,
    next
  );

  assert.equal(res.statusCode, 200);

  findFirst.restore();
  create.restore();
  notificationCreate.restore();
});

test("recoverCheckoutIntentHandler: an invalid/expired token is reported 404, never a broken cart", async () => {
  const intentFind = stub(prisma.checkoutIntent, "findUnique", async () => null);
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await recoverCheckoutIntentHandler({ params: { token: "does-not-exist" } } as unknown as Request, res as Response, next);

  assert.equal(res.statusCode, 404);

  intentFind.restore();
});

test("recoverCheckoutIntentHandler: a valid token returns the recoverable items", async () => {
  const intentFind = stub(prisma.checkoutIntent, "findUnique", async () => ({ status: "ACTIVE", cartSnapshot: [{ productSlug: "abc", quantity: 2 }] }));
  const productFindMany = stub(prisma.product, "findMany", async () => [{ slug: "abc", name: "ABC", price: { toNumber: () => 100 }, images: [] }]);
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await recoverCheckoutIntentHandler({ params: { token: "abc123" } } as unknown as Request, res as Response, next);

  assert.equal(res.statusCode, 200);
  const body = res.body as { data: { items: unknown[] } };
  assert.equal(body.data.items.length, 1);

  intentFind.restore();
  productFindMany.restore();
});
