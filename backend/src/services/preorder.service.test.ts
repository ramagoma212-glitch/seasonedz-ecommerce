// Milestone 181, Part W: preorder status derivation and configuration
// validation — pure functions, no database access at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ProductStatus } from "@prisma/client";
import { derivePreorderAdminStatus, isActivePreorder, isActivePreorderDiscountEligible, validatePreorderConfig, PreorderConfigError } from "./preorder.service.js";

const NOW = new Date("2026-09-15T00:00:00.000Z");

function config(overrides: Partial<{ isPreorderEnabled: boolean; preorderStartAt: Date | null; preorderEndAt: Date | null; preorderReleaseAt: Date | null; isPreorderDiscountEligible: boolean }> = {}) {
  return {
    isPreorderEnabled: true,
    preorderStartAt: null,
    preorderEndAt: null,
    preorderReleaseAt: new Date("2026-09-30T00:00:00.000Z"),
    isPreorderDiscountEligible: false,
    ...overrides,
  };
}

// ---- derivePreorderAdminStatus ----

test("disabled preorder is always Normal Sale, regardless of dates", () => {
  assert.equal(derivePreorderAdminStatus(config({ isPreorderEnabled: false }), NOW), "NORMAL_SALE");
});

test("enabled with a future start date is Preorder Scheduled", () => {
  const status = derivePreorderAdminStatus(config({ preorderStartAt: new Date("2026-09-20T00:00:00.000Z") }), NOW);
  assert.equal(status, "PREORDER_SCHEDULED");
});

test("enabled with no start date (or a past one) and not yet ended is Preorder Active", () => {
  assert.equal(derivePreorderAdminStatus(config(), NOW), "PREORDER_ACTIVE");
  assert.equal(derivePreorderAdminStatus(config({ preorderStartAt: new Date("2026-09-01T00:00:00.000Z") }), NOW), "PREORDER_ACTIVE");
});

test("past the release date is Preorder Ended", () => {
  const status = derivePreorderAdminStatus(config({ preorderReleaseAt: new Date("2026-09-10T00:00:00.000Z") }), NOW);
  assert.equal(status, "PREORDER_ENDED");
});

test("past the explicit end date is Preorder Ended, even if the release date is still ahead", () => {
  const status = derivePreorderAdminStatus(config({ preorderEndAt: new Date("2026-09-10T00:00:00.000Z"), preorderReleaseAt: new Date("2026-10-01T00:00:00.000Z") }), NOW);
  assert.equal(status, "PREORDER_ENDED");
});

// ---- isActivePreorder ----

test("an active preorder requires the product itself to be ACTIVE", () => {
  assert.equal(isActivePreorder(config(), ProductStatus.DRAFT, NOW), false);
  assert.equal(isActivePreorder(config(), ProductStatus.ARCHIVED, NOW), false);
  assert.equal(isActivePreorder(config(), ProductStatus.ACTIVE, NOW), true);
});

test("scheduled (not yet started) preorder is not active", () => {
  const cfg = config({ preorderStartAt: new Date("2026-09-20T00:00:00.000Z") });
  assert.equal(isActivePreorder(cfg, ProductStatus.ACTIVE, NOW), false);
});

test("ended preorder (release date passed) is not active", () => {
  const cfg = config({ preorderReleaseAt: new Date("2026-09-10T00:00:00.000Z") });
  assert.equal(isActivePreorder(cfg, ProductStatus.ACTIVE, NOW), false);
});

test("ended preorder (end date passed, release date still ahead) is not active", () => {
  const cfg = config({ preorderEndAt: new Date("2026-09-10T00:00:00.000Z"), preorderReleaseAt: new Date("2026-10-01T00:00:00.000Z") });
  assert.equal(isActivePreorder(cfg, ProductStatus.ACTIVE, NOW), false);
});

test("exactly at the release instant is no longer active (>=, not >)", () => {
  const releaseAt = new Date("2026-09-15T00:00:00.000Z");
  const cfg = config({ preorderReleaseAt: releaseAt });
  assert.equal(isActivePreorder(cfg, ProductStatus.ACTIVE, releaseAt), false);
});

test("one millisecond before release is still active", () => {
  const releaseAt = new Date("2026-09-15T00:00:00.001Z");
  const cfg = config({ preorderReleaseAt: releaseAt });
  assert.equal(isActivePreorder(cfg, ProductStatus.ACTIVE, NOW), true);
});

test("normal (never-preorder) product is simply never an active preorder", () => {
  assert.equal(isActivePreorder(config({ isPreorderEnabled: false, preorderReleaseAt: null }), ProductStatus.ACTIVE, NOW), false);
});

// ---- isActivePreorderDiscountEligible ----

test("discount eligibility requires BOTH active preorder AND the discount-eligible flag", () => {
  assert.equal(isActivePreorderDiscountEligible(config({ isPreorderDiscountEligible: false }), ProductStatus.ACTIVE, NOW), false);
  assert.equal(isActivePreorderDiscountEligible(config({ isPreorderDiscountEligible: true }), ProductStatus.ACTIVE, NOW), true);
});

test("discount-eligible flag alone, without an active preorder, is never eligible", () => {
  const cfg = config({ isPreorderDiscountEligible: true, preorderReleaseAt: new Date("2026-09-10T00:00:00.000Z") }); // already ended
  assert.equal(isActivePreorderDiscountEligible(cfg, ProductStatus.ACTIVE, NOW), false);
});

// ---- validatePreorderConfig ----

test("no constraints apply while preorder is disabled", () => {
  assert.doesNotThrow(() => validatePreorderConfig(config({ isPreorderEnabled: false, preorderReleaseAt: null })));
});

test("release date is required when preorder is enabled", () => {
  assert.throws(() => validatePreorderConfig(config({ preorderReleaseAt: null })), PreorderConfigError);
});

test("end date before start date is rejected", () => {
  const cfg = config({ preorderStartAt: new Date("2026-09-20T00:00:00.000Z"), preorderEndAt: new Date("2026-09-15T00:00:00.000Z") });
  assert.throws(() => validatePreorderConfig(cfg), PreorderConfigError);
});

test("release date before preorder start is rejected", () => {
  const cfg = config({ preorderStartAt: new Date("2026-09-20T00:00:00.000Z"), preorderReleaseAt: new Date("2026-09-15T00:00:00.000Z") });
  assert.throws(() => validatePreorderConfig(cfg), PreorderConfigError);
});

test("an obviously invalid date (unparseable) is rejected", () => {
  const cfg = config({ preorderReleaseAt: new Date("not-a-real-date") });
  assert.throws(() => validatePreorderConfig(cfg), PreorderConfigError);
});

test("a valid, fully-configured preorder (the owner's own worked example) passes", () => {
  const cfg = config({
    preorderStartAt: null,
    preorderEndAt: new Date("2026-09-29T21:59:00.000Z"), // 29 Sep 23:59 SAST
    preorderReleaseAt: new Date("2026-09-29T22:00:00.000Z"), // 30 Sep 00:00 SAST
    isPreorderDiscountEligible: true,
  });
  assert.doesNotThrow(() => validatePreorderConfig(cfg));
});
