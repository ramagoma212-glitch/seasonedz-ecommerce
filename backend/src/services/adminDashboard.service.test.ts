// Dashboard "Total Paid Revenue" stat: the sum of Order.total across
// every Order whose paymentStatus is genuinely PAID — never a count,
// never an estimate, never includes a PENDING/FAILED/CANCELLED order.
// Same stub() Prisma-model-delegate workaround as order.service.test.ts.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { getDashboardOverview } from "./adminDashboard.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

function stubCommonDashboardQueries() {
  const orderCount = stub(prisma.order, "count", async () => 0);
  const orderFindMany = stub(prisma.order, "findMany", async () => []);
  const enquiryFindMany = stub(prisma.enquiry, "findMany", async () => []);
  const productFindMany = stub(prisma.product, "findMany", async () => []);
  return {
    restoreAll: () => {
      orderCount.restore();
      orderFindMany.restore();
      enquiryFindMany.restore();
      productFindMany.restore();
    },
  };
}

test("paidRevenueTotal sums Order.total across every PAID order, via a real backend Decimal aggregate", async () => {
  const common = stubCommonDashboardQueries();
  const aggregate = stub(prisma.order, "aggregate", async (args: { where?: { paymentStatus?: string } }) => {
    assert.equal(args.where?.paymentStatus, "PAID", "must only ever sum PAID orders, never PENDING/FAILED/CANCELLED");
    return { _sum: { total: new Prisma.Decimal("1450.50") } };
  });

  const overview = await getDashboardOverview();
  assert.equal(overview.paidRevenueTotal, 1450.5);

  common.restoreAll();
  aggregate.restore();
});

test("paidRevenueTotal is 0, never null or NaN, when there are no PAID orders at all", async () => {
  const common = stubCommonDashboardQueries();
  const aggregate = stub(prisma.order, "aggregate", async () => ({ _sum: { total: null } }));

  const overview = await getDashboardOverview();
  assert.equal(overview.paidRevenueTotal, 0);

  common.restoreAll();
  aggregate.restore();
});
