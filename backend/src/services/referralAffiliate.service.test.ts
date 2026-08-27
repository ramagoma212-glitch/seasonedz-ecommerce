// Version 7, Milestone 172B.3: tests for Seasonedz's own affiliate/
// referral programme's Affiliate service. Same stub() pattern as
// adminAffiliateProduct.service.test.ts (172B) — Prisma's model-
// delegate methods are monkeypatched directly, so nothing here ever
// touches the real (production) database.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import {
  ReferralAffiliateError,
  createAffiliate,
  updateAffiliate,
  approveAffiliate,
  rejectAffiliate,
  suspendAffiliate,
  reactivateAffiliate,
  isSelfReferral,
} from "./referralAffiliate.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

// approveAffiliate/rejectAffiliate/suspendAffiliate each fire a
// fire-and-forget notification (referralAffiliate.service.ts's own
// notifyAffiliateStatusChange()) that is never awaited by the caller —
// it keeps running (through prisma.affiliateProgrammeSettings.findFirst
// for the approved case, then prisma.notification.create/updateMany/
// findUnique/update) after approveAffiliate()/suspendAffiliate() has
// already returned. Restoring prisma stubs synchronously right after
// that await, as this file used to, let that dangling chain fall
// through to the REAL (production) database mid-flight — confirmed
// empirically, this leaked real rows into production once already.
// flushAsync() lets one full microtask queue drain before restoring, so
// every test that exercises a status-changing path must stub the
// notification-chain's own prisma calls and await this before
// restoring them.
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const BASE_ROW = {
  id: "aff-1",
  customerId: null,
  name: "Jane Doe",
  email: "jane@example.com",
  phone: null,
  referralCode: "jane-doe",
  status: "PENDING",
  commissionRateOverride: null,
  discountRateOverride: null,
  approvedAt: null,
  notes: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function validCreateInput(overrides: Record<string, unknown> = {}) {
  return { name: "Jane Doe", email: "jane@example.com", ...overrides };
}

// ---------------------------------------------------------------------------
// Create — always starts PENDING.
// ---------------------------------------------------------------------------

test("create: a valid submission starts as PENDING, never auto-approved", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => null);
  let createArgs: Record<string, unknown> = {};
  const create = stub(prisma.affiliate, "create", async (args: { data: Record<string, unknown> }) => {
    createArgs = args.data;
    return { ...BASE_ROW, ...args.data };
  });

  const result = await createAffiliate(validCreateInput());

  assert.equal(createArgs.status, "PENDING");
  assert.equal(result.status, "PENDING");
  assert.equal(result.approvedAt, null);

  findUnique.restore();
  create.restore();
});

test("create: missing name is rejected", async () => {
  await assert.rejects(
    () => createAffiliate({ email: "jane@example.com" }),
    (error: unknown) => error instanceof ReferralAffiliateError
  );
});

test("create: case-normalised email — 'Jane@Example.com' is stored lowercase and collides with an existing lowercase row", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async (args: { where: { email?: string } }) =>
    args.where.email === "jane@example.com" ? { id: "existing" } : null
  );

  await assert.rejects(
    () => createAffiliate(validCreateInput({ email: "Jane@Example.com" })),
    (error: unknown) => error instanceof ReferralAffiliateError && error.statusCode === 409
  );

  findUnique.restore();
});

test("create: duplicate email is rejected with 409", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => ({ id: "existing" }));

  await assert.rejects(
    () => createAffiliate(validCreateInput()),
    (error: unknown) => error instanceof ReferralAffiliateError && error.statusCode === 409
  );

  findUnique.restore();
});

test("create: explicit referral code shorter than 3 characters is rejected", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => null);
  await assert.rejects(
    () => createAffiliate(validCreateInput({ referralCode: "ab" })),
    (error: unknown) => error instanceof ReferralAffiliateError
  );
  findUnique.restore();
});

test("create: referral code with spaces, uppercase or symbols is rejected", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => null);
  for (const bad of ["jane doe", "jane_doe", "jane!doe", "<script>", "jane--"]) {
    await assert.rejects(
      () => createAffiliate(validCreateInput({ referralCode: bad })),
      (error: unknown) => error instanceof ReferralAffiliateError,
      `expected "${bad}" to be rejected`
    );
  }
  findUnique.restore();
});

test("create: explicit duplicate referral code is rejected with 409", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async (args: { where: { email?: string; referralCode?: string } }) => {
    if (args.where.referralCode) return { id: "existing" };
    return null;
  });

  await assert.rejects(
    () => createAffiliate(validCreateInput({ referralCode: "already-taken" })),
    (error: unknown) => error instanceof ReferralAffiliateError && error.statusCode === 409
  );

  findUnique.restore();
});

test("create: a genuinely unique explicit referral code is normalised to lowercase and used as-is", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => null);
  let createArgs: Record<string, unknown> = {};
  const create = stub(prisma.affiliate, "create", async (args: { data: Record<string, unknown> }) => {
    createArgs = args.data;
    return { ...BASE_ROW, ...args.data };
  });

  await createAffiliate(validCreateInput({ referralCode: "JANE-VIP" }));
  assert.equal(createArgs.referralCode, "jane-vip");

  findUnique.restore();
  create.restore();
});

test("create: commission and discount rate overrides outside 0-50 are rejected", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => null);
  await assert.rejects(() => createAffiliate(validCreateInput({ commissionRateOverride: 500 })), (e: unknown) => e instanceof ReferralAffiliateError);
  await assert.rejects(() => createAffiliate(validCreateInput({ commissionRateOverride: -1 })), (e: unknown) => e instanceof ReferralAffiliateError);
  await assert.rejects(() => createAffiliate(validCreateInput({ discountRateOverride: 500 })), (e: unknown) => e instanceof ReferralAffiliateError);
  findUnique.restore();
});

test("create: a valid rate override (e.g. 10%) is accepted and stored as a plain number on read", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => null);
  const create = stub(prisma.affiliate, "create", async (args: { data: Record<string, unknown> }) => ({
    ...BASE_ROW,
    ...args.data,
    commissionRateOverride: args.data.commissionRateOverride ? { toNumber: () => args.data.commissionRateOverride } : null,
  }));

  const result = await createAffiliate(validCreateInput({ commissionRateOverride: 10 }));
  assert.equal(result.commissionRateOverride, 10);

  findUnique.restore();
  create.restore();
});

test("create: no override supplied means null — never a copied-in default value", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => null);
  let createArgs: Record<string, unknown> = {};
  const create = stub(prisma.affiliate, "create", async (args: { data: Record<string, unknown> }) => {
    createArgs = args.data;
    return { ...BASE_ROW, ...args.data };
  });

  await createAffiliate(validCreateInput());
  assert.equal(createArgs.commissionRateOverride, null);
  assert.equal(createArgs.discountRateOverride, null);

  findUnique.restore();
  create.restore();
});

// ---------------------------------------------------------------------------
// Customer linking
// ---------------------------------------------------------------------------

test("create: linking a real, unlinked customer succeeds", async () => {
  const affiliateFindUnique = stub(prisma.affiliate, "findUnique", async (args: { where: { customerId?: string } }) =>
    args.where.customerId ? null : null
  );
  const customerFindUnique = stub(prisma.customer, "findUnique", async () => ({ id: "cust-1" }));
  const create = stub(prisma.affiliate, "create", async (args: { data: Record<string, unknown> }) => ({ ...BASE_ROW, ...args.data }));

  const result = await createAffiliate(validCreateInput({ customerId: "cust-1" }));
  assert.equal(result.customerId, "cust-1");

  affiliateFindUnique.restore();
  customerFindUnique.restore();
  create.restore();
});

test("create: linking a customerId that doesn't exist is rejected", async () => {
  const affiliateFindUnique = stub(prisma.affiliate, "findUnique", async () => null);
  const customerFindUnique = stub(prisma.customer, "findUnique", async () => null);

  await assert.rejects(
    () => createAffiliate(validCreateInput({ customerId: "missing-customer" })),
    (error: unknown) => error instanceof ReferralAffiliateError
  );

  affiliateFindUnique.restore();
  customerFindUnique.restore();
});

test("create: linking a customer already linked to another affiliate is rejected with 409 — one Customer can never link to two affiliates", async () => {
  const customerFindUnique = stub(prisma.customer, "findUnique", async () => ({ id: "cust-1" }));
  const affiliateFindUnique = stub(prisma.affiliate, "findUnique", async (args: { where: { email?: string; customerId?: string } }) => {
    if (args.where.customerId) return { id: "other-affiliate" };
    return null;
  });

  await assert.rejects(
    () => createAffiliate(validCreateInput({ customerId: "cust-1" })),
    (error: unknown) => error instanceof ReferralAffiliateError && error.statusCode === 409
  );

  customerFindUnique.restore();
  affiliateFindUnique.restore();
});

// ---------------------------------------------------------------------------
// Update — clearing an override.
// ---------------------------------------------------------------------------

test("update: an unrecognised field is rejected", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => ({ ...BASE_ROW }));
  await assert.rejects(
    () => updateAffiliate("aff-1", { status: "ACTIVE" }),
    (error: unknown) => error instanceof ReferralAffiliateError
  );
  findUnique.restore();
});

test("update: explicitly setting commissionRateOverride to null clears it", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => ({ ...BASE_ROW, commissionRateOverride: { toNumber: () => 10 } }));
  let updateArgs: Record<string, unknown> = {};
  const update = stub(prisma.affiliate, "update", async (args: { data: Record<string, unknown> }) => {
    updateArgs = args.data;
    return { ...BASE_ROW, ...args.data };
  });

  await updateAffiliate("aff-1", { commissionRateOverride: null });
  assert.equal(updateArgs.commissionRateOverride, null);

  findUnique.restore();
  update.restore();
});

test("update: changing referralCode to one already in use by another affiliate is rejected", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async (args: { where: { id?: string; referralCode?: string } }) => {
    if (args.where.id === "aff-1") return { ...BASE_ROW };
    if (args.where.referralCode === "someone-else") return { id: "aff-2" };
    return null;
  });

  await assert.rejects(
    () => updateAffiliate("aff-1", { referralCode: "someone-else" }),
    (error: unknown) => error instanceof ReferralAffiliateError && error.statusCode === 409
  );

  findUnique.restore();
});

// ---------------------------------------------------------------------------
// Status lifecycle
// ---------------------------------------------------------------------------

test("approve: PENDING -> ACTIVE, sets approvedAt", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => ({ status: "PENDING" }));
  let updateArgs: Record<string, unknown> = {};
  const update = stub(prisma.affiliate, "update", async (args: { data: Record<string, unknown> }) => {
    updateArgs = args.data;
    return { ...BASE_ROW, ...args.data };
  });
  // AFFILIATE_APPROVED's fire-and-forget notification reads programme
  // settings, then writes a Notification row — never real production
  // data here (see flushAsync()'s comment above).
  const settingsFindFirst = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => ({
    id: "settings-1",
    defaultCommissionRate: { toNumber: () => 7 },
    defaultReferralDiscountRate: { toNumber: () => 5 },
    attributionWindowDays: 30,
    commissionValidationDays: 30,
    minimumPayoutAmount: { toNumber: () => 500 },
    payoutDayOfMonth: 15,
    isProgrammeActive: true,
    updatedByAdminUserId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  }));
  const notificationCreate = stub(prisma.notification, "create", async () => ({ id: "notif-1" }));
  const notificationUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const notificationFindUnique = stub(prisma.notification, "findUnique", async () => ({
    id: "notif-1",
    eventType: "AFFILIATE_APPROVED",
    templateName: "affiliate-approved",
    recipientEmail: "jane@example.com",
    orderNumber: null,
    affiliateId: "aff-1",
    productId: null,
    renderedSubject: "Subject",
    renderedBody: "Body",
    attemptCount: 1,
    maxAttempts: 3,
  }));
  const notificationUpdate = stub(prisma.notification, "update", async () => ({}));

  const result = await approveAffiliate("aff-1");
  assert.equal(updateArgs.status, "ACTIVE");
  assert.ok(updateArgs.approvedAt instanceof Date);
  assert.equal(result.status, "ACTIVE");

  findUnique.restore();
  update.restore();
  await flushAsync();
  settingsFindFirst.restore();
  notificationCreate.restore();
  notificationUpdateMany.restore();
  notificationFindUnique.restore();
  notificationUpdate.restore();
});

test("reject: only PENDING can be rejected", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => ({ status: "ACTIVE" }));
  await assert.rejects(
    () => rejectAffiliate("aff-1"),
    (error: unknown) => error instanceof ReferralAffiliateError && error.statusCode === 409
  );
  findUnique.restore();
});

test("suspend: only ACTIVE can be suspended", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => ({ status: "PENDING" }));
  await assert.rejects(
    () => suspendAffiliate("aff-1"),
    (error: unknown) => error instanceof ReferralAffiliateError
  );
  findUnique.restore();
});

test("suspend: an ACTIVE affiliate transitions to SUSPENDED, and the update touches only status", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => ({ status: "ACTIVE" }));
  let updateArgs: Record<string, unknown> = {};
  const update = stub(prisma.affiliate, "update", async (args: { data: Record<string, unknown> }) => {
    updateArgs = args.data;
    return { ...BASE_ROW, ...args.data, status: "SUSPENDED" };
  });
  // AFFILIATE_SUSPENDED's fire-and-forget notification only ever writes
  // a Notification row (no settings lookup) — see flushAsync()'s
  // comment above for why this must be stubbed and flushed.
  const notificationCreate = stub(prisma.notification, "create", async () => ({ id: "notif-2" }));
  const notificationUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const notificationFindUnique = stub(prisma.notification, "findUnique", async () => ({
    id: "notif-2",
    eventType: "AFFILIATE_SUSPENDED",
    templateName: "affiliate-suspended",
    recipientEmail: "jane@example.com",
    orderNumber: null,
    affiliateId: "aff-1",
    productId: null,
    renderedSubject: "Subject",
    renderedBody: "Body",
    attemptCount: 1,
    maxAttempts: 3,
  }));
  const notificationUpdate = stub(prisma.notification, "update", async () => ({}));

  const result = await suspendAffiliate("aff-1");
  assert.deepEqual(Object.keys(updateArgs), ["status"]);
  assert.equal(result.status, "SUSPENDED");

  findUnique.restore();
  update.restore();
  await flushAsync();
  notificationCreate.restore();
  notificationUpdateMany.restore();
  notificationFindUnique.restore();
  notificationUpdate.restore();
});

test("reactivate: SUSPENDED -> ACTIVE", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => ({ status: "SUSPENDED" }));
  const update = stub(prisma.affiliate, "update", async (args: { data: Record<string, unknown> }) => ({ ...BASE_ROW, ...args.data }));

  const result = await reactivateAffiliate("aff-1");
  assert.equal(result.status, "ACTIVE");

  findUnique.restore();
  update.restore();
});

test("reactivate: a PENDING affiliate cannot be reactivated (it was never active)", async () => {
  const findUnique = stub(prisma.affiliate, "findUnique", async () => ({ status: "PENDING" }));
  await assert.rejects(
    () => reactivateAffiliate("aff-1"),
    (error: unknown) => error instanceof ReferralAffiliateError
  );
  findUnique.restore();
});

// ---------------------------------------------------------------------------
// Self-referral detection (pure function, not wired into any live
// route yet — see §20 of the milestone brief).
// ---------------------------------------------------------------------------

test("isSelfReferral: true when the checkout customerId matches the affiliate's own linked customer", () => {
  const affiliate = { customerId: "cust-1", email: "jane@example.com" };
  assert.equal(isSelfReferral(affiliate, { customerId: "cust-1" }), true);
});

test("isSelfReferral: true when a guest checkout email matches the affiliate's own email, case-insensitively", () => {
  const affiliate = { customerId: null, email: "jane@example.com" };
  assert.equal(isSelfReferral(affiliate, { email: "Jane@Example.com" }), true);
});

test("isSelfReferral: false for an unrelated customer", () => {
  const affiliate = { customerId: "cust-1", email: "jane@example.com" };
  assert.equal(isSelfReferral(affiliate, { customerId: "cust-2", email: "someone@example.com" }), false);
});
