// Version 7, Milestone 172B.6: affiliate portal — §39/§40 of the
// brief. Same stub() pattern as other service tests.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { applyForAffiliateProgramme, getMyAffiliatePortal, CustomerAffiliateError } from "./customerAffiliate.service.js";
import { ReferralAffiliateError } from "./referralAffiliate.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

// applyForAffiliateProgramme() fires two fire-and-forget notifications
// (AFFILIATE_APPLICATION_RECEIVED, ADMIN_NEW_AFFILIATE) that keep
// running after the function itself has already returned — restoring
// prisma stubs synchronously right after that await let those dangling
// chains fall through to the REAL (production) database mid-flight,
// confirmed empirically once already. flushAsync() lets one full
// microtask queue drain before restoring, so any test that reaches a
// successful application must stub prisma.notification.* and await
// this before restoring them.
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

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

function affiliateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "affiliate-1",
    customerId: "customer-1",
    name: "Alice Affiliate",
    email: "alice@example.com",
    phone: null,
    referralCode: "alice-1",
    status: "ACTIVE",
    commissionRateOverride: null,
    discountRateOverride: null,
    approvedAt: new Date(),
    notes: "Internal note — must never reach the customer response",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("a customer with no linked affiliate gets null, not an error", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => null);

  const result = await getMyAffiliatePortal("customer-1");
  assert.equal(result, null);

  findUnique.restore();
});

test("an ACTIVE affiliate sees their real referral code, link, effective rates and totals", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => affiliateRow());
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);
  const groupBy = stub(prisma.orderAffiliateCommission, "groupBy", async () => []);
  const findMany = stub(prisma.orderAffiliateCommission, "findMany", async () => []);

  const result = await getMyAffiliatePortal("customer-1");
  assert.ok(result);
  assert.equal(result!.status, "ACTIVE");
  assert.equal(result!.referralCode, "alice-1");
  assert.match(result!.referralLink, /\?ref=alice-1$/);
  assert.equal(result!.effectiveCommissionRate, 7);
  assert.equal(result!.effectiveDiscountRate, 5);
  assert.equal(result!.payoutDayOfMonth, 15);
  // Internal admin notes must never leak into the customer-facing shape.
  assert.ok(!("notes" in result!));

  findUnique.restore();
  settingsFind.restore();
  groupBy.restore();
  findMany.restore();
});

test("an affiliate's own rate overrides are reflected as the effective rate", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => affiliateRow({ commissionRateOverride: new Prisma.Decimal("12.00"), discountRateOverride: new Prisma.Decimal("8.00") }));
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);
  const groupBy = stub(prisma.orderAffiliateCommission, "groupBy", async () => []);
  const findMany = stub(prisma.orderAffiliateCommission, "findMany", async () => []);

  const result = await getMyAffiliatePortal("customer-1");
  assert.equal(result!.effectiveCommissionRate, 12);
  assert.equal(result!.effectiveDiscountRate, 8);

  findUnique.restore();
  settingsFind.restore();
  groupBy.restore();
  findMany.restore();
});

test("PENDING/SUSPENDED/REJECTED affiliates still get a real status back, never suppressed", async () => {
  for (const status of ["PENDING", "SUSPENDED", "REJECTED"]) {
    const findUnique = stub(prisma.affiliate, "findUnique", async () => affiliateRow({ status }));
    const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);
    const groupBy = stub(prisma.orderAffiliateCommission, "groupBy", async () => []);
    const findMany = stub(prisma.orderAffiliateCommission, "findMany", async () => []);

    const result = await getMyAffiliatePortal("customer-1");
    assert.equal(result!.status, status);

    findUnique.restore();
    settingsFind.restore();
    groupBy.restore();
    findMany.restore();
  }
});

test("recent commissions never include the referred customer's own email/name/phone — only order reference, date, and figures", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => affiliateRow());
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);
  const groupBy = stub(prisma.orderAffiliateCommission, "groupBy", async () => []);
  const findMany = stub(prisma.orderAffiliateCommission, "findMany", async () => [
    {
      qualifyingProductSubtotal: new Prisma.Decimal("500.00"),
      discountAmount: new Prisma.Decimal("25.00"),
      commissionAmount: new Prisma.Decimal("33.25"),
      status: "PENDING",
      order: { orderNumber: "SZ-TEST-1", createdAt: new Date() },
    },
  ]);

  const result = await getMyAffiliatePortal("customer-1");
  const row = result!.recentCommissions[0];
  assert.ok(row);
  assert.equal(row.orderNumber, "SZ-TEST-1");
  assert.equal(row.commissionAmount, 33.25);
  assert.deepEqual(Object.keys(row).sort(), ["commissionAmount", "commissionStatus", "discountAmount", "orderDate", "orderNumber", "qualifyingProductSubtotal"]);

  findUnique.restore();
  settingsFind.restore();
  groupBy.restore();
  findMany.restore();
});

// ---------------------------------------------------------------------------
// Application flow.
// ---------------------------------------------------------------------------

test("a valid application creates a PENDING affiliate using the customer's own real account details", async () => {
  const customerFind = stub(prisma.customer, "findUnique", async () => ({ id: "customer-1", firstName: "Thandiwe", lastName: "Nkosi", email: "thandiwe@example.com", phone: "+27821234567" }));
  // createAffiliate() checks both email-uniqueness and customerId-
  // uniqueness via separate findUnique calls — both must report "no
  // existing row" for this happy-path test.
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => null);
  const create = stub(prisma.affiliate, "create", async ({ data }: { data: Record<string, unknown> }) =>
    ({ id: "new-affiliate-1", ...data, approvedAt: null, createdAt: new Date(), updatedAt: new Date() })
  );
  const notificationCreate = stub(prisma.notification, "create", async () => ({ id: "notif-1" }));
  const notificationUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const notificationFindUnique = stub(prisma.notification, "findUnique", async () => ({
    id: "notif-1",
    eventType: "AFFILIATE_APPLICATION_RECEIVED",
    templateName: "affiliate-application-received",
    recipientEmail: "thandiwe@example.com",
    orderNumber: null,
    affiliateId: "new-affiliate-1",
    productId: null,
    renderedSubject: "Subject",
    renderedBody: "Body",
    attemptCount: 1,
    maxAttempts: 3,
  }));
  const notificationUpdate = stub(prisma.notification, "update", async () => ({}));

  const result = await applyForAffiliateProgramme("customer-1");
  assert.equal(result.status, "PENDING");
  assert.equal(result.name, "Thandiwe Nkosi");
  assert.equal(result.email, "thandiwe@example.com");

  customerFind.restore();
  affiliateFind.restore();
  create.restore();
  await flushAsync();
  notificationCreate.restore();
  notificationUpdateMany.restore();
  notificationFindUnique.restore();
  notificationUpdate.restore();
});

test("a customer who already has a linked affiliate cannot apply again", async () => {
  // One consistent stub serves every prisma.customer.findUnique call —
  // this service's own lookup (needs firstName/lastName/email/phone)
  // AND assertCustomerExistsAndUnlinked()'s existence check inside
  // createAffiliate() (only needs `id`, present here regardless).
  const customerFind = stub(prisma.customer, "findUnique", async () => ({ id: "customer-1", firstName: "Thandiwe", lastName: "Nkosi", email: "thandiwe@example.com", phone: null }));
  const affiliateFind = stub(prisma.affiliate, "findUnique", async ({ where }: { where: Record<string, unknown> }) => {
    if ("email" in where) return null; // email is free
    if ("customerId" in where) return { id: "existing-affiliate-1" }; // already linked — this is the case under test
    return null;
  });

  await assert.rejects(
    () => applyForAffiliateProgramme("customer-1"),
    (error: unknown) => error instanceof ReferralAffiliateError && error.statusCode === 409
  );

  customerFind.restore();
  affiliateFind.restore();
});

test("a nonexistent customer id is rejected with 404", async () => {
  const customerFind = stub(prisma.customer, "findUnique", async () => null);

  await assert.rejects(
    () => applyForAffiliateProgramme("does-not-exist"),
    (error: unknown) => error instanceof CustomerAffiliateError && error.statusCode === 404
  );

  customerFind.restore();
});
