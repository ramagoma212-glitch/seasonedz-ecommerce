// Version 7, Milestone 172B.6: manual payment confirmation — §38 of the
// brief. Same stub() pattern as order.service.test.ts.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { confirmManualPayment, ManualPaymentConfirmationError } from "./adminPaymentConfirmation.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

const ADMIN = { id: "admin-1", name: "Owner", email: "owner@example.com", role: "ADMIN" };

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNumber: "SZ-TEST-1",
    status: "CONFIRMED",
    paymentMethod: "BANK_TRANSFER",
    payment: { status: "PENDING", amount: new Prisma.Decimal("918.00") },
    ...overrides,
  };
}

function wireStubs(order: ReturnType<typeof orderRow>, updateManyCount = 1) {
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const findUnique = stub(prisma.order, "findUnique", async () => order);
  const updateMany = stub(prisma.payment, "updateMany", async () => ({ count: updateManyCount }));
  const orderUpdate = stub(prisma.order, "update", async () => ({}));
  return {
    updateMany,
    orderUpdate,
    restore: () => {
      transactionStub.restore();
      findUnique.restore();
      updateMany.restore();
      orderUpdate.restore();
    },
  };
}

test("Bank Transfer can be confirmed by admin: sets PAID, paidAt, and syncs Order.paymentStatus", async () => {
  const stubs = wireStubs(orderRow());

  const result = await confirmManualPayment("SZ-TEST-1", ADMIN);

  assert.equal(result.paymentStatus, "PAID");
  assert.ok(result.paidAt instanceof Date);
  assert.equal(result.amount, 918);
  assert.equal(stubs.updateMany.fn.mock.callCount(), 1);
  assert.equal(stubs.orderUpdate.fn.mock.callCount(), 1);
  assert.equal(stubs.orderUpdate.fn.mock.calls[0]?.arguments[0].data.paymentStatus, "PAID");
  // Order.status itself is never touched by this action.
  assert.ok(!("status" in stubs.orderUpdate.fn.mock.calls[0]!.arguments[0].data));

  stubs.restore();
});

test("PayFast orders cannot use the manual confirmation path", async () => {
  const stubs = wireStubs(orderRow({ paymentMethod: "PAYFAST" }));

  await assert.rejects(
    () => confirmManualPayment("SZ-TEST-1", ADMIN),
    (error: unknown) => error instanceof ManualPaymentConfirmationError && /only available for Bank Transfer and Cash on Delivery/i.test(error.message)
  );
  assert.equal(stubs.updateMany.fn.mock.callCount(), 0);

  stubs.restore();
});

test("Cash on Delivery can be confirmed once the order is Delivered", async () => {
  const stubs = wireStubs(orderRow({ paymentMethod: "CASH_ON_DELIVERY", status: "DELIVERED" }));

  const result = await confirmManualPayment("SZ-TEST-1", ADMIN);
  assert.equal(result.paymentStatus, "PAID");

  stubs.restore();
});

test("Cash on Delivery is rejected before the order is Delivered — cash cannot have been received yet", async () => {
  const stubs = wireStubs(orderRow({ paymentMethod: "CASH_ON_DELIVERY", status: "OUT_FOR_DELIVERY" }));

  await assert.rejects(
    () => confirmManualPayment("SZ-TEST-1", ADMIN),
    (error: unknown) => error instanceof ManualPaymentConfirmationError && /can only be confirmed once the order has been marked Delivered/i.test(error.message)
  );
  assert.equal(stubs.updateMany.fn.mock.callCount(), 0);

  stubs.restore();
});

test("an already-PAID order is rejected", async () => {
  const stubs = wireStubs(orderRow({ payment: { status: "PAID", amount: new Prisma.Decimal("918.00") } }));

  await assert.rejects(
    () => confirmManualPayment("SZ-TEST-1", ADMIN),
    (error: unknown) => error instanceof ManualPaymentConfirmationError && /already been confirmed/i.test(error.message)
  );
  assert.equal(stubs.updateMany.fn.mock.callCount(), 0);

  stubs.restore();
});

test("a cancelled order is rejected", async () => {
  const stubs = wireStubs(orderRow({ status: "CANCELLED" }));

  await assert.rejects(
    () => confirmManualPayment("SZ-TEST-1", ADMIN),
    (error: unknown) => error instanceof ManualPaymentConfirmationError && /cancelled or refunded/i.test(error.message)
  );
  assert.equal(stubs.updateMany.fn.mock.callCount(), 0);

  stubs.restore();
});

test("a refunded order is rejected", async () => {
  const stubs = wireStubs(orderRow({ status: "REFUNDED" }));

  await assert.rejects(
    () => confirmManualPayment("SZ-TEST-1", ADMIN),
    (error: unknown) => error instanceof ManualPaymentConfirmationError && /cancelled or refunded/i.test(error.message)
  );

  stubs.restore();
});

test("an order not found is rejected with 404", async () => {
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const findUnique = stub(prisma.order, "findUnique", async () => null);

  await assert.rejects(
    () => confirmManualPayment("SZ-NOPE", ADMIN),
    (error: unknown) => error instanceof ManualPaymentConfirmationError && error.statusCode === 404
  );

  transactionStub.restore();
  findUnique.restore();
});

test("double submission is safe: a concurrent confirmation makes updateMany affect 0 rows, aborting cleanly", async () => {
  const stubs = wireStubs(orderRow(), 0);

  await assert.rejects(
    () => confirmManualPayment("SZ-TEST-1", ADMIN),
    (error: unknown) => error instanceof ManualPaymentConfirmationError && /just confirmed by another request/i.test(error.message)
  );
  // Order.paymentStatus must never be synced when the payment update
  // itself didn't actually happen.
  assert.equal(stubs.orderUpdate.fn.mock.callCount(), 0);

  stubs.restore();
});

test("the confirmed amount is always the existing authoritative Payment.amount — there is no field for an admin-typed replacement", async () => {
  const stubs = wireStubs(orderRow({ payment: { status: "PENDING", amount: new Prisma.Decimal("1234.56") } }));

  const result = await confirmManualPayment("SZ-TEST-1", ADMIN);
  assert.equal(result.amount, 1234.56);

  stubs.restore();
});
