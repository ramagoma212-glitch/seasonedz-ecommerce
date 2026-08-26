// Version 7, Milestone 172B.4: the public capture/preview endpoints
// customer browsers actually call. Same stub() pattern as
// order.service.test.ts (Prisma Proxy-model-delegate limitation).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { captureReferral, previewReferral, ReferralCaptureError } from "./referralCapture.service.js";
import { ReferralAffiliateError } from "./referralAffiliate.service.js";
import { signReferralCapture } from "../utils/referralAttributionToken.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
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

test("captureReferral mints a fresh signed token even for a code that matches no affiliate — isValid reflects that honestly", async () => {
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => null);
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);

  const result = await captureReferral("nobody-1");

  assert.equal(result.code, "nobody-1");
  assert.equal(result.isValid, false);
  assert.equal(result.discountRatePercent, 5);
  assert.ok(result.signature.length > 0);

  affiliateFind.restore();
  settingsFind.restore();
});

test("captureReferral rejects a malformed code shape before ever touching the database", async () => {
  // Fails the empty/missing check inside captureReferral() itself.
  await assert.rejects(() => captureReferral(""), (error: unknown) => error instanceof ReferralCaptureError);
  // Fails shape validation inside the shared validateReferralCodeFormat()
  // (referralAffiliate.service.ts) — a different, but equally 400-class,
  // typed error; referralCapture.controller.ts already handles both.
  await assert.rejects(() => captureReferral("Not A Valid Code!!"), (error: unknown) => error instanceof ReferralAffiliateError);
});

test("previewReferral verifies an EXISTING token rather than minting a new one — capturedAt is never silently renewed", async () => {
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => ({ status: "ACTIVE", discountRateOverride: null }));
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);

  const original = signReferralCapture("alice-1", new Date(Date.now() - 10 * 24 * 60 * 60 * 1000));
  const result = await previewReferral(original.code, original.capturedAt, original.signature);

  assert.equal(result.isValid, true);
  assert.equal(result.discountRatePercent, 5);

  affiliateFind.restore();
  settingsFind.restore();
});

test("previewReferral reports isValid: false once the ORIGINAL capture is past the attribution window", async () => {
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => ({ status: "ACTIVE", discountRateOverride: null }));
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);

  const stale = signReferralCapture("alice-1", new Date(Date.now() - 45 * 24 * 60 * 60 * 1000));
  const result = await previewReferral(stale.code, stale.capturedAt, stale.signature);

  assert.equal(result.isValid, false);

  affiliateFind.restore();
  settingsFind.restore();
});

test("previewReferral reports isValid: false when the programme is inactive, even for an otherwise-valid ACTIVE affiliate", async () => {
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => ({ status: "ACTIVE", discountRateOverride: null }));
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => ({ ...SETTINGS_ROW, isProgrammeActive: false }));

  const captured = signReferralCapture("alice-1");
  const result = await previewReferral(captured.code, captured.capturedAt, captured.signature);

  assert.equal(result.isValid, false);

  affiliateFind.restore();
  settingsFind.restore();
});

test("previewReferral never throws on a tampered signature — reports isValid: false", async () => {
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);

  const captured = signReferralCapture("alice-1");
  const result = await previewReferral(captured.code, captured.capturedAt, "0".repeat(captured.signature.length));

  assert.equal(result.isValid, false);

  settingsFind.restore();
});
