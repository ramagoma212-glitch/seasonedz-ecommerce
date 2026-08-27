// Version 7, Milestone 174C: wishlist controller — wiring/validation
// coverage. The underlying logic is covered in wishlist.service.test.ts.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma.js";
import { addToMyWishlistHandler, removeFromMyWishlistHandler } from "./wishlist.controller.js";

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

test("addToMyWishlistHandler: a missing productSlug is rejected 400 before any database call", async () => {
  const productFind = stub(prisma.product, "findUnique", mock.fn(async () => ({ id: "product-1" })));
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await addToMyWishlistHandler({ customerUser: { id: "cust-1" }, body: {} } as unknown as Request, res as Response, next);

  assert.equal(res.statusCode, 400);
  assert.equal(productFind.fn.mock.callCount(), 0);

  productFind.restore();
});

test("removeFromMyWishlistHandler: always scopes the delete to the authenticated customer, never a body-supplied customerId", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1" }));
  const deleteMany = stub(prisma.wishlistItem, "deleteMany", async () => ({ count: 1 }));
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await removeFromMyWishlistHandler(
    { customerUser: { id: "cust-1" }, params: { productSlug: "abc-colouring-book" }, body: { customerId: "someone-else" } } as unknown as Request,
    res as Response,
    next
  );

  const where = deleteMany.fn.mock.calls[0]!.arguments[0].where;
  assert.equal(where.customerId, "cust-1");

  productFind.restore();
  deleteMany.restore();
});
