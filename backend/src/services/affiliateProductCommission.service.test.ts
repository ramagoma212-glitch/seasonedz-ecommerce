// Milestone 178, Part C: pure per-product commission math — no database,
// no mocking, same "pure function" test style as referralPricing.service
// itself already uses for its own whole-order calculation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { calculateProductCommissions, type AffiliateProductSettingSnapshot, type OrderItemForCommission } from "./affiliateProductCommission.service.js";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const FALLBACK_RATE = new Prisma.Decimal(7);
const DISCOUNT_RATE = new Prisma.Decimal(5);

function item(overrides: Partial<OrderItemForCommission> = {}): OrderItemForCommission {
  return { orderItemId: "item-1", productId: "product-1", quantity: 1, lineTotal: new Prisma.Decimal(500), ...overrides };
}

function setting(overrides: Partial<AffiliateProductSettingSnapshot> = {}): AffiliateProductSettingSnapshot {
  return {
    commissionType: "PERCENTAGE",
    commissionPercent: null,
    fixedCommissionAmount: null,
    maximumCommission: null,
    isAffiliateAvailable: true,
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

test("PERCENTAGE with no override falls back to the affiliate's own resolved rate, matching the approved V1 worked example (R500 -> R25 discount -> R475 net -> 7% -> R33.25)", () => {
  const result = calculateProductCommissions([item()], new Map([["product-1", setting()]]), FALLBACK_RATE, DISCOUNT_RATE, NOW);
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0]!.calculatedCommission.toFixed(2), "33.25");
  assert.equal(result.lines[0]!.commissionPercent!.toFixed(2), "7.00");
  assert.equal(result.totalCommission.toFixed(2), "33.25");
});

test("PERCENTAGE with a per-product override rate uses that rate instead of the affiliate's own", () => {
  const result = calculateProductCommissions(
    [item()],
    new Map([["product-1", setting({ commissionPercent: new Prisma.Decimal(15) })]]),
    FALLBACK_RATE,
    DISCOUNT_RATE,
    NOW
  );
  // R500 * 0.95 = R475 net, 15% = R71.25
  assert.equal(result.lines[0]!.calculatedCommission.toFixed(2), "71.25");
  assert.equal(result.lines[0]!.commissionPercent!.toFixed(2), "15.00");
});

test("FIXED_AMOUNT is per-unit multiplied by quantity, with no discount/qualifying-amount involvement at all", () => {
  const result = calculateProductCommissions(
    [item({ quantity: 3, lineTotal: new Prisma.Decimal(300) })],
    new Map([["product-1", setting({ commissionType: "FIXED_AMOUNT", fixedCommissionAmount: new Prisma.Decimal(20) })]]),
    FALLBACK_RATE,
    DISCOUNT_RATE,
    NOW
  );
  assert.equal(result.lines[0]!.calculatedCommission.toFixed(2), "60.00");
  assert.equal(result.lines[0]!.commissionPercent, null);
  assert.equal(result.lines[0]!.fixedCommissionAmount!.toFixed(2), "20.00");
});

test("maximumCommission caps a PERCENTAGE line that would otherwise exceed it", () => {
  const result = calculateProductCommissions(
    [item({ lineTotal: new Prisma.Decimal(10000) })],
    new Map([["product-1", setting({ commissionPercent: new Prisma.Decimal(20), maximumCommission: new Prisma.Decimal(100) })]]),
    FALLBACK_RATE,
    DISCOUNT_RATE,
    NOW
  );
  // Uncapped would be 10000*0.95*0.20 = 1900 — capped to 100.
  assert.equal(result.lines[0]!.calculatedCommission.toFixed(2), "100.00");
});

test("maximumCommission caps a FIXED_AMOUNT line the same way", () => {
  const result = calculateProductCommissions(
    [item({ quantity: 50, lineTotal: new Prisma.Decimal(5000) })],
    new Map([["product-1", setting({ commissionType: "FIXED_AMOUNT", fixedCommissionAmount: new Prisma.Decimal(10), maximumCommission: new Prisma.Decimal(80) })]]),
    FALLBACK_RATE,
    DISCOUNT_RATE,
    NOW
  );
  // Uncapped would be 50*10 = 500 — capped to 80.
  assert.equal(result.lines[0]!.calculatedCommission.toFixed(2), "80.00");
});

test("a line with isAffiliateAvailable:false is excluded entirely — no line, no contribution to the total", () => {
  const result = calculateProductCommissions([item()], new Map([["product-1", setting({ isAffiliateAvailable: false })]]), FALLBACK_RATE, DISCOUNT_RATE, NOW);
  assert.equal(result.lines.length, 0);
  assert.equal(result.totalCommission.toFixed(2), "0.00");
  assert.equal(result.totalEligibleSubtotal.toFixed(2), "0.00");
});

test("a product with no AffiliateProductSetting row at all is excluded — no row means not affiliate-eligible", () => {
  const result = calculateProductCommissions([item()], new Map(), FALLBACK_RATE, DISCOUNT_RATE, NOW);
  assert.equal(result.lines.length, 0);
});

test("an order item with no productId (should not occur, but defensively) is excluded", () => {
  const result = calculateProductCommissions([item({ productId: null })], new Map([["product-1", setting()]]), FALLBACK_RATE, DISCOUNT_RATE, NOW);
  assert.equal(result.lines.length, 0);
});

test("startsAt in the future excludes the line; startsAt in the past includes it", () => {
  const future = setting({ startsAt: new Date("2026-12-01T00:00:00.000Z") });
  const past = setting({ startsAt: new Date("2026-01-01T00:00:00.000Z") });
  assert.equal(calculateProductCommissions([item()], new Map([["product-1", future]]), FALLBACK_RATE, DISCOUNT_RATE, NOW).lines.length, 0);
  assert.equal(calculateProductCommissions([item()], new Map([["product-1", past]]), FALLBACK_RATE, DISCOUNT_RATE, NOW).lines.length, 1);
});

test("endsAt in the past excludes the line; endsAt in the future includes it", () => {
  const expired = setting({ endsAt: new Date("2026-01-01T00:00:00.000Z") });
  const stillOpen = setting({ endsAt: new Date("2026-12-01T00:00:00.000Z") });
  assert.equal(calculateProductCommissions([item()], new Map([["product-1", expired]]), FALLBACK_RATE, DISCOUNT_RATE, NOW).lines.length, 0);
  assert.equal(calculateProductCommissions([item()], new Map([["product-1", stillOpen]]), FALLBACK_RATE, DISCOUNT_RATE, NOW).lines.length, 1);
});

test("multiple eligible lines, some FIXED some PERCENTAGE, some excluded, sum correctly", () => {
  const items: OrderItemForCommission[] = [
    item({ orderItemId: "a", productId: "p-percent", lineTotal: new Prisma.Decimal(200) }),
    item({ orderItemId: "b", productId: "p-fixed", quantity: 2, lineTotal: new Prisma.Decimal(100) }),
    item({ orderItemId: "c", productId: "p-not-eligible", lineTotal: new Prisma.Decimal(9999) }),
    item({ orderItemId: "d", productId: "p-no-setting", lineTotal: new Prisma.Decimal(9999) }),
  ];
  const settings = new Map<string, AffiliateProductSettingSnapshot>([
    ["p-percent", setting({ commissionPercent: new Prisma.Decimal(10) })], // 200*0.95*0.10 = 19.00
    ["p-fixed", setting({ commissionType: "FIXED_AMOUNT", fixedCommissionAmount: new Prisma.Decimal(5) })], // 2*5 = 10.00
    ["p-not-eligible", setting({ isAffiliateAvailable: false })],
  ]);

  const result = calculateProductCommissions(items, settings, FALLBACK_RATE, DISCOUNT_RATE, NOW);
  assert.equal(result.lines.length, 2);
  assert.equal(result.totalCommission.toFixed(2), "29.00");
  assert.equal(result.totalEligibleSubtotal.toFixed(2), "300.00");
});

test("no eligible lines at all produces a zero total, never a thrown error", () => {
  const result = calculateProductCommissions([], new Map(), FALLBACK_RATE, DISCOUNT_RATE, NOW);
  assert.equal(result.lines.length, 0);
  assert.equal(result.totalCommission.toFixed(2), "0.00");
});
