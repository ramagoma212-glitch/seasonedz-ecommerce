// Version 7, Milestone 172B.5: commission lifecycle (approve/reverse/
// pay) and payout aggregation — §34/§35 of the brief. Same stub()
// pattern as order.service.test.ts (Prisma Proxy-model-delegate
// limitation).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma, OrderAffiliateCommissionStatus, OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import {
  approveCommission,
  reverseCommission,
  reverseCommissionsForOrder,
  payAffiliateCommissions,
  getPayoutOverview,
  CommissionLifecycleError,
} from "./referralCommission.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

const ADMIN = { id: "admin-1", name: "Owner", email: "owner@example.com", role: "ADMIN" };

const SETTINGS_ROW = {
  id: "settings-1",
  defaultCommissionRate: new Prisma.Decimal("7.00"),
  defaultReferralDiscountRate: new Prisma.Decimal("5.00"),
  attributionWindowDays: 30,
  commissionValidationDays: 30,
  minimumPayoutAmount: new Prisma.Decimal("500.00"),
  payoutDayOfMonth: 15,
  isProgrammeActive: true,
  updatedByAdminUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const NOW = new Date();
const DELIVERED_31_DAYS_AGO = new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000);
const PAID_31_DAYS_AGO = DELIVERED_31_DAYS_AGO;

function commissionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "commission-1",
    orderId: "order-1",
    affiliateId: "affiliate-1",
    affiliateNameSnapshot: "Alice Affiliate",
    affiliateReferralCodeSnapshot: "alice-1",
    qualifyingProductSubtotal: new Prisma.Decimal("500.00"),
    discountRateApplied: new Prisma.Decimal("5.00"),
    discountAmount: new Prisma.Decimal("25.00"),
    netQualifyingAmount: new Prisma.Decimal("475.00"),
    commissionRateApplied: new Prisma.Decimal("7.00"),
    commissionAmount: new Prisma.Decimal("33.25"),
    status: OrderAffiliateCommissionStatus.PENDING,
    approvedAt: null,
    paidAt: null,
    reversedAt: null,
    reversalReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    order: {
      orderNumber: "SZ-TEST-1",
      createdAt: new Date(),
      status: OrderStatus.DELIVERED,
      customerEmail: "thandiwe@example.com",
      customerFirstName: "Thandiwe",
      customerLastName: "Nkosi",
      payment: { status: PaymentStatus.PAID, paidAt: PAID_31_DAYS_AGO },
      items: [{ productType: "PHYSICAL" }],
    },
    ...overrides,
  };
}

function stubEligibleCommission(overrides: Record<string, unknown> = {}) {
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const findUnique = stub(prisma.orderAffiliateCommission, "findUnique", async () => commissionRow(overrides));
  const historyFind = stub(prisma.orderStatusHistory, "findMany", async () => [{ orderId: "order-1", createdAt: DELIVERED_31_DAYS_AGO }]);
  const update = stub(prisma.orderAffiliateCommission, "update", async ({ data }: { data: Record<string, unknown> }) =>
    commissionRow({ ...overrides, ...data })
  );
  return {
    update,
    restore: () => {
      settingsFind.restore();
      transactionStub.restore();
      findUnique.restore();
      historyFind.restore();
      update.restore();
    },
  };
}

// ---------------------------------------------------------------------------
// approveCommission
// ---------------------------------------------------------------------------

test("an eligible PENDING commission approves successfully, setting APPROVED + approvedAt", async () => {
  const stubs = stubEligibleCommission();

  const result = await approveCommission("commission-1", ADMIN);

  assert.equal(result.status, "APPROVED");
  assert.equal(stubs.update.fn.mock.callCount(), 1);
  const callArgs = stubs.update.fn.mock.calls[0];
  assert.ok(callArgs);
  assert.equal(callArgs.arguments[0].data.status, "APPROVED");
  assert.ok(callArgs.arguments[0].data.approvedAt instanceof Date);

  stubs.restore();
});

test("approve rejects an unpaid order's commission with a clear reason, never approving it", async () => {
  const stubs = stubEligibleCommission({ order: { ...commissionRow().order, payment: { status: PaymentStatus.PENDING, paidAt: null } } });

  await assert.rejects(
    () => approveCommission("commission-1", ADMIN),
    (error: unknown) => error instanceof CommissionLifecycleError && /has not been paid/i.test(error.message)
  );
  assert.equal(stubs.update.fn.mock.callCount(), 0);

  stubs.restore();
});

test("approve rejects an already-APPROVED commission (no double-approval)", async () => {
  const stubs = stubEligibleCommission({ status: OrderAffiliateCommissionStatus.APPROVED });

  await assert.rejects(() => approveCommission("commission-1", ADMIN), (error: unknown) => error instanceof CommissionLifecycleError);
  assert.equal(stubs.update.fn.mock.callCount(), 0);

  stubs.restore();
});

test("approve rejects an already-PAID commission", async () => {
  const stubs = stubEligibleCommission({ status: OrderAffiliateCommissionStatus.PAID });

  await assert.rejects(() => approveCommission("commission-1", ADMIN), (error: unknown) => error instanceof CommissionLifecycleError);
  assert.equal(stubs.update.fn.mock.callCount(), 0);

  stubs.restore();
});

test("approve rejects a REVERSED commission", async () => {
  const stubs = stubEligibleCommission({ status: OrderAffiliateCommissionStatus.REVERSED });

  await assert.rejects(() => approveCommission("commission-1", ADMIN), (error: unknown) => error instanceof CommissionLifecycleError);
  assert.equal(stubs.update.fn.mock.callCount(), 0);

  stubs.restore();
});

// ---------------------------------------------------------------------------
// reverseCommission (manual)
// ---------------------------------------------------------------------------

test("reversing a PENDING commission with a valid reason succeeds", async () => {
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const findUnique = stub(prisma.orderAffiliateCommission, "findUnique", async () => ({
    id: "commission-1",
    status: OrderAffiliateCommissionStatus.PENDING,
    orderId: "order-1",
    order: { orderNumber: "SZ-TEST-1" },
  }));
  const update = stub(prisma.orderAffiliateCommission, "update", async ({ data }: { data: Record<string, unknown> }) => commissionRow({ ...data }));

  const result = await reverseCommission("commission-1", "Customer disputed the order.", false, ADMIN);
  assert.equal(result.status, "REVERSED");

  transactionStub.restore();
  findUnique.restore();
  update.restore();
});

test("reversing with too short a reason is rejected before any write", async () => {
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const findUnique = stub(prisma.orderAffiliateCommission, "findUnique", async () => {
    throw new Error("must never be called — reason validation happens before any lookup");
  });

  await assert.rejects(() => reverseCommission("commission-1", "x", false, ADMIN), (error: unknown) => error instanceof CommissionLifecycleError);

  transactionStub.restore();
  findUnique.restore();
});

test("reversing an already-REVERSED commission is rejected", async () => {
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const findUnique = stub(prisma.orderAffiliateCommission, "findUnique", async () => ({
    id: "commission-1",
    status: OrderAffiliateCommissionStatus.REVERSED,
    orderId: "order-1",
    order: { orderNumber: "SZ-TEST-1" },
  }));

  await assert.rejects(() => reverseCommission("commission-1", "Some reason", false, ADMIN), (error: unknown) => error instanceof CommissionLifecycleError);

  transactionStub.restore();
  findUnique.restore();
});

test("reversing a PAID commission without confirmClawback is rejected — a clawback must not happen silently", async () => {
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const findUnique = stub(prisma.orderAffiliateCommission, "findUnique", async () => ({
    id: "commission-1",
    status: OrderAffiliateCommissionStatus.PAID,
    orderId: "order-1",
    order: { orderNumber: "SZ-TEST-1" },
  }));

  await assert.rejects(
    () => reverseCommission("commission-1", "Refund issued.", false, ADMIN),
    (error: unknown) => error instanceof CommissionLifecycleError && /clawback/i.test(error.message)
  );

  transactionStub.restore();
  findUnique.restore();
});

test("reversing a PAID commission WITH confirmClawback succeeds, and the reason is clearly tagged", async () => {
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const findUnique = stub(prisma.orderAffiliateCommission, "findUnique", async () => ({
    id: "commission-1",
    status: OrderAffiliateCommissionStatus.PAID,
    orderId: "order-1",
    order: { orderNumber: "SZ-TEST-1" },
  }));
  const update = stub(prisma.orderAffiliateCommission, "update", async ({ data }: { data: Record<string, unknown> }) => commissionRow({ ...data }));

  const result = await reverseCommission("commission-1", "Refund issued.", true, ADMIN);
  assert.equal(result.status, "REVERSED");
  const callArgs = update.fn.mock.calls[0];
  assert.ok(callArgs);
  assert.match(callArgs.arguments[0].data.reversalReason, /CLAWBACK/);
  // paidAt is never touched/erased by a reversal — historical payment
  // record stays exactly as it was (commissionRow()'s own default
  // paidAt: null in this stub means "never set", so this proves the
  // update call itself never includes a paidAt key at all).
  assert.ok(!("paidAt" in callArgs.arguments[0].data));

  transactionStub.restore();
  findUnique.restore();
  update.restore();
});

// ---------------------------------------------------------------------------
// reverseCommissionsForOrder (automatic, called from adminOrderStatus.service.ts)
// ---------------------------------------------------------------------------

test("automatic reversal: a PENDING commission on a cancelled order becomes REVERSED", async () => {
  const findUnique = stub(prisma.orderAffiliateCommission, "findUnique", async () => ({ id: "commission-1", status: OrderAffiliateCommissionStatus.PENDING }));
  const update = stub(prisma.orderAffiliateCommission, "update", async ({ data }: { data: Record<string, unknown> }) => commissionRow({ ...data }));

  await reverseCommissionsForOrder(prisma as never, "order-1", "SZ-TEST-1", "Order cancelled.");
  assert.equal(update.fn.mock.callCount(), 1);
  assert.equal(update.fn.mock.calls[0]?.arguments[0].data.status, "REVERSED");

  findUnique.restore();
  update.restore();
});

test("automatic reversal: an APPROVED commission on a fully-refunded order becomes REVERSED", async () => {
  const findUnique = stub(prisma.orderAffiliateCommission, "findUnique", async () => ({ id: "commission-1", status: OrderAffiliateCommissionStatus.APPROVED }));
  const update = stub(prisma.orderAffiliateCommission, "update", async ({ data }: { data: Record<string, unknown> }) => commissionRow({ ...data }));

  await reverseCommissionsForOrder(prisma as never, "order-1", "SZ-TEST-1", "Order refunded.");
  assert.equal(update.fn.mock.callCount(), 1);

  findUnique.restore();
  update.restore();
});

test("automatic reversal: a PAID commission is left untouched — clawback requires explicit admin action, never silent", async () => {
  const findUnique = stub(prisma.orderAffiliateCommission, "findUnique", async () => ({ id: "commission-1", status: OrderAffiliateCommissionStatus.PAID }));
  const update = stub(prisma.orderAffiliateCommission, "update", async () => {
    throw new Error("must never be called — a PAID commission must never be auto-reversed");
  });

  await reverseCommissionsForOrder(prisma as never, "order-1", "SZ-TEST-1", "Order cancelled.");
  assert.equal(update.fn.mock.callCount(), 0);

  findUnique.restore();
  update.restore();
});

test("automatic reversal: no commission exists for this order (not referred) — no-op, never throws", async () => {
  const findUnique = stub(prisma.orderAffiliateCommission, "findUnique", async () => null);
  const update = stub(prisma.orderAffiliateCommission, "update", async () => {
    throw new Error("must never be called");
  });

  await reverseCommissionsForOrder(prisma as never, "order-1", "SZ-TEST-1", "Order cancelled.");
  assert.equal(update.fn.mock.callCount(), 0);

  findUnique.restore();
  update.restore();
});

test("automatic reversal: an already-REVERSED commission is idempotent — never double-processed", async () => {
  const findUnique = stub(prisma.orderAffiliateCommission, "findUnique", async () => ({ id: "commission-1", status: OrderAffiliateCommissionStatus.REVERSED }));
  const update = stub(prisma.orderAffiliateCommission, "update", async () => {
    throw new Error("must never be called");
  });

  await reverseCommissionsForOrder(prisma as never, "order-1", "SZ-TEST-1", "Order cancelled.");
  assert.equal(update.fn.mock.callCount(), 0);

  findUnique.restore();
  update.restore();
});

// ---------------------------------------------------------------------------
// Payout: threshold math and atomic marking-paid.
// ---------------------------------------------------------------------------

function approvedCommission(id: string, affiliateId: string, amount: string) {
  return { id, affiliateId, commissionAmount: new Prisma.Decimal(amount), order: { orderNumber: `SZ-${id}` } };
}

test("R320 approved balance alone is not payout-eligible", async () => {
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => ({ id: "affiliate-1" }));
  const findMany = stub(prisma.orderAffiliateCommission, "findMany", async () => [approvedCommission("c1", "affiliate-1", "320.00")]);

  await assert.rejects(
    () => payAffiliateCommissions("affiliate-1", undefined, ADMIN),
    (error: unknown) => error instanceof CommissionLifecycleError && /minimum payout threshold/i.test(error.message)
  );

  settingsFind.restore();
  transactionStub.restore();
  affiliateFind.restore();
  findMany.restore();
});

test("R320 + R260 = R580 crosses the R500 threshold and pays both atomically", async () => {
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => ({ id: "affiliate-1" }));
  const findMany = stub(prisma.orderAffiliateCommission, "findMany", async () => [
    approvedCommission("c1", "affiliate-1", "320.00"),
    approvedCommission("c2", "affiliate-1", "260.00"),
  ]);
  const updateMany = stub(prisma.orderAffiliateCommission, "updateMany", async () => ({ count: 2 }));

  const result = await payAffiliateCommissions("affiliate-1", undefined, ADMIN);
  assert.equal(result.totalPaid, 580);
  assert.deepEqual(result.paidCommissionIds.sort(), ["c1", "c2"]);

  settingsFind.restore();
  transactionStub.restore();
  affiliateFind.restore();
  findMany.restore();
  updateMany.restore();
});

test("exactly R500 is payout-eligible", async () => {
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => ({ id: "affiliate-1" }));
  const findMany = stub(prisma.orderAffiliateCommission, "findMany", async () => [approvedCommission("c1", "affiliate-1", "500.00")]);
  const updateMany = stub(prisma.orderAffiliateCommission, "updateMany", async () => ({ count: 1 }));

  const result = await payAffiliateCommissions("affiliate-1", undefined, ADMIN);
  assert.equal(result.totalPaid, 500);

  settingsFind.restore();
  transactionStub.restore();
  affiliateFind.restore();
  findMany.restore();
  updateMany.restore();
});

test("R499.99 is NOT payout-eligible — exact boundary, never rounded up", async () => {
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => ({ id: "affiliate-1" }));
  const findMany = stub(prisma.orderAffiliateCommission, "findMany", async () => [approvedCommission("c1", "affiliate-1", "499.99")]);

  await assert.rejects(() => payAffiliateCommissions("affiliate-1", undefined, ADMIN), (error: unknown) => error instanceof CommissionLifecycleError);

  settingsFind.restore();
  transactionStub.restore();
  affiliateFind.restore();
  findMany.restore();
});

test("concurrency: if a commission changed status between read and write, the whole payout aborts rather than double-paying", async () => {
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => ({ id: "affiliate-1" }));
  const findMany = stub(prisma.orderAffiliateCommission, "findMany", async () => [
    approvedCommission("c1", "affiliate-1", "320.00"),
    approvedCommission("c2", "affiliate-1", "260.00"),
  ]);
  // Simulates a concurrent request already having moved c2 out of
  // APPROVED (e.g. a racing reversal) — the conditional updateMany only
  // actually matches c1.
  const updateMany = stub(prisma.orderAffiliateCommission, "updateMany", async () => ({ count: 1 }));

  await assert.rejects(
    () => payAffiliateCommissions("affiliate-1", undefined, ADMIN),
    (error: unknown) => error instanceof CommissionLifecycleError && /refresh and try again/i.test(error.message)
  );

  settingsFind.restore();
  transactionStub.restore();
  affiliateFind.restore();
  findMany.restore();
  updateMany.restore();
});

test("PENDING commissions are never included in an affiliate's payout balance", async () => {
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);
  // getPayoutOverview() only ever queries status=APPROVED — proven by
  // asserting the findMany call's own where clause.
  const findMany = stub(prisma.orderAffiliateCommission, "findMany", async ({ where }: { where: Record<string, unknown> }) => {
    assert.equal(where.status, "APPROVED");
    return [];
  });

  await getPayoutOverview();
  assert.equal(findMany.fn.mock.callCount(), 1);

  settingsFind.restore();
  findMany.restore();
});

test("multiple affiliates' balances are calculated separately, never pooled together", async () => {
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);
  const findMany = stub(prisma.orderAffiliateCommission, "findMany", async () => [
    approvedCommission("c1", "affiliate-1", "600.00"),
    approvedCommission("c2", "affiliate-2", "100.00"),
  ]);

  const overview = await getPayoutOverview();
  const affiliate1 = overview.groups.find((g) => g.affiliateId === "affiliate-1");
  const affiliate2 = overview.groups.find((g) => g.affiliateId === "affiliate-2");

  assert.equal(affiliate1?.approvedUnpaidBalance, 600);
  assert.equal(affiliate1?.isPayoutEligible, true);
  assert.equal(affiliate2?.approvedUnpaidBalance, 100);
  assert.equal(affiliate2?.isPayoutEligible, false);

  settingsFind.restore();
  findMany.restore();
});
