// Milestone 181, Part F/W: the reserve/consume/release lifecycle.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma, PreorderDiscountRedemptionStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { hasActivePreorderDiscountRedemption, reservePreorderDiscount, consumePreorderDiscountRedemption, releasePreorderDiscountRedemption, PreorderDiscountRedemptionError } from "./preorderDiscountRedemption.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

test("hasActivePreorderDiscountRedemption: true when a RESERVED or CONSUMED row exists", async () => {
  const findFirst = stub(prisma.preorderDiscountRedemption, "findFirst", async (args: { where: Record<string, unknown> }) => {
    assert.deepEqual(args.where.status, { in: [PreorderDiscountRedemptionStatus.RESERVED, PreorderDiscountRedemptionStatus.CONSUMED] });
    return { id: "redemption-1" };
  });
  assert.equal(await hasActivePreorderDiscountRedemption(prisma, "customer-1"), true);
  findFirst.restore();
});

test("hasActivePreorderDiscountRedemption: false when no active row exists", async () => {
  const findFirst = stub(prisma.preorderDiscountRedemption, "findFirst", async () => null);
  assert.equal(await hasActivePreorderDiscountRedemption(prisma, "customer-1"), false);
  findFirst.restore();
});

test("reservePreorderDiscount: creates a RESERVED row with the snapshot values", async () => {
  const create = stub(prisma.preorderDiscountRedemption, "create", async (args: { data: Record<string, unknown> }) => {
    assert.equal(args.data.customerId, "customer-1");
    assert.equal(args.data.orderId, "order-1");
    assert.equal(args.data.status, PreorderDiscountRedemptionStatus.RESERVED);
    return {};
  });

  await reservePreorderDiscount(prisma, { customerId: "customer-1", orderId: "order-1", discountPercent: new Prisma.Decimal(10), discountAmount: new Prisma.Decimal(12) });
  assert.equal(create.fn.mock.callCount(), 1);
  create.restore();
});

test("reservePreorderDiscount: a concurrent reservation (unique constraint violation) surfaces as a clear, safe error", async () => {
  const create = stub(prisma.preorderDiscountRedemption, "create", async () => {
    throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "5.22.0" });
  });

  await assert.rejects(
    () => reservePreorderDiscount(prisma, { customerId: "customer-1", orderId: "order-1", discountPercent: new Prisma.Decimal(10), discountAmount: new Prisma.Decimal(12) }),
    (error: unknown) => error instanceof PreorderDiscountRedemptionError && error.statusCode === 409
  );
  create.restore();
});

test("reservePreorderDiscount: a genuinely different database error is never swallowed as a false 'already reserved'", async () => {
  const create = stub(prisma.preorderDiscountRedemption, "create", async () => {
    throw new Error("connection lost");
  });

  await assert.rejects(
    () => reservePreorderDiscount(prisma, { customerId: "customer-1", orderId: "order-1", discountPercent: new Prisma.Decimal(10), discountAmount: new Prisma.Decimal(12) }),
    (error: unknown) => !(error instanceof PreorderDiscountRedemptionError)
  );
  create.restore();
});

test("consumePreorderDiscountRedemption: only ever transitions a RESERVED row", async () => {
  const updateMany = stub(prisma.preorderDiscountRedemption, "updateMany", async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    assert.equal(args.where.orderId, "order-1");
    assert.equal(args.where.status, PreorderDiscountRedemptionStatus.RESERVED);
    assert.equal(args.data.status, PreorderDiscountRedemptionStatus.CONSUMED);
    return { count: 1 };
  });

  await consumePreorderDiscountRedemption(prisma, "order-1");
  assert.equal(updateMany.fn.mock.callCount(), 1);
  updateMany.restore();
});

test("consumePreorderDiscountRedemption: a no-op (never throws) for an order with no redemption row at all", async () => {
  const updateMany = stub(prisma.preorderDiscountRedemption, "updateMany", async () => ({ count: 0 }));
  await assert.doesNotReject(() => consumePreorderDiscountRedemption(prisma, "order-with-no-redemption"));
  updateMany.restore();
});

test("releasePreorderDiscountRedemption: transitions from either RESERVED or CONSUMED", async () => {
  const updateMany = stub(prisma.preorderDiscountRedemption, "updateMany", async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    assert.deepEqual(args.where.status, { in: [PreorderDiscountRedemptionStatus.RESERVED, PreorderDiscountRedemptionStatus.CONSUMED] });
    assert.equal(args.data.status, PreorderDiscountRedemptionStatus.RELEASED);
    return { count: 1 };
  });

  await releasePreorderDiscountRedemption(prisma, "order-1");
  assert.equal(updateMany.fn.mock.callCount(), 1);
  updateMany.restore();
});
