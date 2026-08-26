// Version 7, Milestone 172B.3: tests for the affiliate programme's
// singleton settings service. Same stub() pattern as every other
// *.service.test.ts in this backend — Prisma's model-delegate methods
// are monkeypatched, nothing here touches the real database.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import {
  ReferralProgrammeSettingsError,
  getReferralProgrammeSettings,
  updateReferralProgrammeSettings,
} from "./referralProgrammeSettings.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

const EXISTING_ROW = {
  id: "settings-1",
  defaultCommissionRate: new Prisma.Decimal("7.00"),
  defaultReferralDiscountRate: new Prisma.Decimal("5.00"),
  attributionWindowDays: 30,
  commissionValidationDays: 30,
  minimumPayoutAmount: new Prisma.Decimal("500.00"),
  payoutDayOfMonth: 15,
  isProgrammeActive: true,
  updatedByAdminUserId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("getReferralProgrammeSettings: returns the existing row when one already exists — never creates a second one", async () => {
  const findFirst = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => EXISTING_ROW);
  const create = stub(prisma.affiliateProgrammeSettings, "create", async () => {
    throw new Error("must not be called when a row already exists");
  });

  const settings = await getReferralProgrammeSettings();
  assert.equal(settings.id, "settings-1");
  assert.equal(create.fn.mock.callCount(), 0);

  findFirst.restore();
  create.restore();
});

test("getReferralProgrammeSettings: creates the row with the approved V1 defaults when none exists yet", async () => {
  const findFirst = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => null);
  let createArgs: Record<string, unknown> = {};
  const create = stub(prisma.affiliateProgrammeSettings, "create", async (args: { data: Record<string, unknown> }) => {
    createArgs = args.data;
    return { ...EXISTING_ROW, ...args.data };
  });

  const settings = await getReferralProgrammeSettings();

  assert.equal((createArgs.defaultCommissionRate as Prisma.Decimal).toString(), "7");
  assert.equal((createArgs.defaultReferralDiscountRate as Prisma.Decimal).toString(), "5");
  assert.equal(createArgs.attributionWindowDays, 30);
  assert.equal(createArgs.commissionValidationDays, 30);
  assert.equal((createArgs.minimumPayoutAmount as Prisma.Decimal).toString(), "500");
  assert.equal(createArgs.payoutDayOfMonth, 15);
  assert.equal(createArgs.isProgrammeActive, true);
  assert.equal(settings.defaultCommissionRate, 7);
  assert.equal(settings.defaultReferralDiscountRate, 5);

  findFirst.restore();
  create.restore();
});

test("getReferralProgrammeSettings: a concurrent create race is handled by re-reading, not by erroring", async () => {
  let findFirstCallCount = 0;
  const findFirst = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => {
    findFirstCallCount += 1;
    return findFirstCallCount === 1 ? null : EXISTING_ROW;
  });
  const create = stub(prisma.affiliateProgrammeSettings, "create", async () => {
    throw new Error("unique constraint violation — another request already created it");
  });

  const settings = await getReferralProgrammeSettings();
  assert.equal(settings.id, "settings-1");

  findFirst.restore();
  create.restore();
});

// ---------------------------------------------------------------------------
// Update — rate/day/amount validation.
// ---------------------------------------------------------------------------

function withCurrentSettings() {
  return stub(prisma.affiliateProgrammeSettings, "findFirst", async () => EXISTING_ROW);
}

test("update: defaultCommissionRate outside 0-50 is rejected", async () => {
  const findFirst = withCurrentSettings();
  await assert.rejects(
    () => updateReferralProgrammeSettings({ defaultCommissionRate: 500 }, "admin-1"),
    (error: unknown) => error instanceof ReferralProgrammeSettingsError
  );
  await assert.rejects(
    () => updateReferralProgrammeSettings({ defaultCommissionRate: -1 }, "admin-1"),
    (error: unknown) => error instanceof ReferralProgrammeSettingsError
  );
  findFirst.restore();
});

test("update: defaultReferralDiscountRate outside 0-50 is rejected", async () => {
  const findFirst = withCurrentSettings();
  await assert.rejects(
    () => updateReferralProgrammeSettings({ defaultReferralDiscountRate: 100 }, "admin-1"),
    (error: unknown) => error instanceof ReferralProgrammeSettingsError
  );
  findFirst.restore();
});

test("update: attributionWindowDays must be a whole number between 1 and 365", async () => {
  const findFirst = withCurrentSettings();
  await assert.rejects(() => updateReferralProgrammeSettings({ attributionWindowDays: 0 }, "admin-1"), (e: unknown) => e instanceof ReferralProgrammeSettingsError);
  await assert.rejects(() => updateReferralProgrammeSettings({ attributionWindowDays: 400 }, "admin-1"), (e: unknown) => e instanceof ReferralProgrammeSettingsError);
  await assert.rejects(() => updateReferralProgrammeSettings({ attributionWindowDays: 30.5 }, "admin-1"), (e: unknown) => e instanceof ReferralProgrammeSettingsError);
  findFirst.restore();
});

test("update: commissionValidationDays must be a whole number between 0 and 365", async () => {
  const findFirst = withCurrentSettings();
  await assert.rejects(() => updateReferralProgrammeSettings({ commissionValidationDays: -1 }, "admin-1"), (e: unknown) => e instanceof ReferralProgrammeSettingsError);
  findFirst.restore();
});

test("update: minimumPayoutAmount must be non-negative and within a defensible ceiling", async () => {
  const findFirst = withCurrentSettings();
  await assert.rejects(() => updateReferralProgrammeSettings({ minimumPayoutAmount: -50 }, "admin-1"), (e: unknown) => e instanceof ReferralProgrammeSettingsError);
  await assert.rejects(() => updateReferralProgrammeSettings({ minimumPayoutAmount: 999_999_999 }, "admin-1"), (e: unknown) => e instanceof ReferralProgrammeSettingsError);
  findFirst.restore();
});

test("update: payoutDayOfMonth must be between 1 and 28 (never 29-31, to avoid February edge cases)", async () => {
  const findFirst = withCurrentSettings();
  await assert.rejects(() => updateReferralProgrammeSettings({ payoutDayOfMonth: 0 }, "admin-1"), (e: unknown) => e instanceof ReferralProgrammeSettingsError);
  await assert.rejects(() => updateReferralProgrammeSettings({ payoutDayOfMonth: 29 }, "admin-1"), (e: unknown) => e instanceof ReferralProgrammeSettingsError);
  await assert.rejects(() => updateReferralProgrammeSettings({ payoutDayOfMonth: 31 }, "admin-1"), (e: unknown) => e instanceof ReferralProgrammeSettingsError);
  findFirst.restore();
});

test("update: an unrecognised field is rejected, never silently applied", async () => {
  const findFirst = withCurrentSettings();
  await assert.rejects(
    () => updateReferralProgrammeSettings({ arbitraryField: 1 }, "admin-1"),
    (error: unknown) => error instanceof ReferralProgrammeSettingsError
  );
  findFirst.restore();
});

test("update: a valid change records who made it and updates only the requested fields", async () => {
  const findFirst = withCurrentSettings();
  let updateArgs: Record<string, unknown> = {};
  const update = stub(prisma.affiliateProgrammeSettings, "update", async (args: { data: Record<string, unknown> }) => {
    updateArgs = args.data;
    return { ...EXISTING_ROW, defaultCommissionRate: new Prisma.Decimal("8.00") };
  });

  const result = await updateReferralProgrammeSettings({ defaultCommissionRate: 8 }, "admin-42");

  assert.equal((updateArgs.defaultCommissionRate as Prisma.Decimal).toString(), "8");
  assert.deepEqual(updateArgs.updatedByAdminUser, { connect: { id: "admin-42" } });
  assert.equal(result.defaultCommissionRate, 8);
  // Untouched fields were never part of this update payload.
  assert.ok(!("attributionWindowDays" in updateArgs));

  findFirst.restore();
  update.restore();
});

test("update: isProgrammeActive can be toggled independently of the rates", async () => {
  const findFirst = withCurrentSettings();
  let updateArgs: Record<string, unknown> = {};
  const update = stub(prisma.affiliateProgrammeSettings, "update", async (args: { data: Record<string, unknown> }) => {
    updateArgs = args.data;
    return { ...EXISTING_ROW, isProgrammeActive: false };
  });

  await updateReferralProgrammeSettings({ isProgrammeActive: false }, "admin-1");
  assert.equal(updateArgs.isProgrammeActive, false);

  findFirst.restore();
  update.restore();
});
