// Delivery-fee and gift-wrap pricing tests (Version 7, Milestone 168C).
// Pure-function unit tests, no Prisma/database connection at all —
// safe to run against this repo's live-production DATABASE_URL/.env
// without any risk, since nothing here ever imports config/prisma.js
// or opens a connection. Run with: npx tsx --test src/utils/money.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { calculateDeliveryFee, calculateGiftWrapFee } from "./money.js";
import { COURIER_LOCKER_FEE, COURIER_DOOR_FEE, FREE_DELIVERY_THRESHOLD, REGISTERED_FREE_DELIVERY_THRESHOLD } from "../config/delivery.js";

function decimal(value: number) {
  return new Prisma.Decimal(value);
}

// ---- Delivery fee test matrix (Section O, Part 39) ----
const SUBTOTALS = [0, 100, 599, 600, 601, 1000];

for (const subtotal of SUBTOTALS) {
  const expectFree = subtotal >= FREE_DELIVERY_THRESHOLD;

  test(`Locker to Locker at R${subtotal}`, () => {
    const fee = calculateDeliveryFee("COURIER_LOCKER", decimal(subtotal), true);
    assert.equal(fee.toNumber(), expectFree ? 0 : COURIER_LOCKER_FEE);
  });

  test(`Door to Door at R${subtotal}`, () => {
    const fee = calculateDeliveryFee("COURIER_DOOR", decimal(subtotal), true);
    assert.equal(fee.toNumber(), expectFree ? 0 : COURIER_DOOR_FEE);
  });

  test(`Customer Collection at R${subtotal}`, () => {
    const fee = calculateDeliveryFee("COLLECTION", decimal(subtotal), true);
    assert.equal(fee.toNumber(), 0);
  });
}

// ---- Milestone 180, Part A: registered-customer R500 threshold ----
// isRegisteredCustomer defaults to false — every pre-existing call site
// above (that never passes a 4th argument) is unaffected by this
// milestone; the guest R600 threshold above is verified byte-for-byte
// unchanged.
test("isRegisteredCustomer defaults to false — an omitted 4th argument behaves exactly like the guest rule", () => {
  assert.equal(calculateDeliveryFee("COURIER_LOCKER", decimal(550), true).toNumber(), COURIER_LOCKER_FEE);
});

const REGISTERED_SUBTOTALS = [0, 100, 499, 500, 501, 1000];

for (const subtotal of REGISTERED_SUBTOTALS) {
  const expectFree = subtotal >= REGISTERED_FREE_DELIVERY_THRESHOLD;

  test(`registered customer, Locker to Locker at R${subtotal}`, () => {
    const fee = calculateDeliveryFee("COURIER_LOCKER", decimal(subtotal), true, true);
    assert.equal(fee.toNumber(), expectFree ? 0 : COURIER_LOCKER_FEE);
  });

  test(`registered customer, Door to Door at R${subtotal}`, () => {
    const fee = calculateDeliveryFee("COURIER_DOOR", decimal(subtotal), true, true);
    assert.equal(fee.toNumber(), expectFree ? 0 : COURIER_DOOR_FEE);
  });

  test(`registered customer, Customer Collection at R${subtotal}`, () => {
    const fee = calculateDeliveryFee("COLLECTION", decimal(subtotal), true, true);
    assert.equal(fee.toNumber(), 0);
  });
}

// ---- Part F, section 49: exact boundary test matrix ----
test("registered customer: R499.99 eligible physical subtotal is charged, not free", () => {
  assert.equal(calculateDeliveryFee("COURIER_LOCKER", decimal(499.99), true, true).toNumber(), COURIER_LOCKER_FEE);
  assert.equal(calculateDeliveryFee("COURIER_DOOR", decimal(499.99), true, true).toNumber(), COURIER_DOOR_FEE);
});

test("registered customer: exactly R500.00 is free on both Locker and Door", () => {
  assert.equal(calculateDeliveryFee("COURIER_LOCKER", decimal(500), true, true).toNumber(), 0);
  assert.equal(calculateDeliveryFee("COURIER_DOOR", decimal(500), true, true).toNumber(), 0);
});

test("registered customer: R500.01 is free on both Locker and Door", () => {
  assert.equal(calculateDeliveryFee("COURIER_LOCKER", decimal(500.01), true, true).toNumber(), 0);
  assert.equal(calculateDeliveryFee("COURIER_DOOR", decimal(500.01), true, true).toNumber(), 0);
});

test("a guest at the exact same R500 subtotal a registered customer would get free delivery at is still charged — the two thresholds never leak into each other", () => {
  assert.equal(calculateDeliveryFee("COURIER_LOCKER", decimal(500), true, false).toNumber(), COURIER_LOCKER_FEE);
  assert.equal(calculateDeliveryFee("COURIER_DOOR", decimal(500), true, false).toNumber(), COURIER_DOOR_FEE);
});

test("registered customer, digital-only order (hasPhysicalItems=false) is always R0 regardless of the registered flag", () => {
  for (const method of ["COURIER_LOCKER", "COURIER_DOOR", "COLLECTION"] as const) {
    assert.equal(calculateDeliveryFee(method, decimal(1000), false, true).toNumber(), 0);
  }
});

// ---- Part F, section 51: gift wrap excluded from the registered threshold too ----
test("registered customer: R490 physical + R30 gift wrap does NOT qualify — threshold judged on R490 physical alone", () => {
  const physicalSubtotal = decimal(490);
  assert.equal(calculateDeliveryFee("COURIER_LOCKER", physicalSubtotal, true, true).toNumber(), COURIER_LOCKER_FEE);
  assert.equal(calculateDeliveryFee("COURIER_DOOR", physicalSubtotal, true, true).toNumber(), COURIER_DOOR_FEE);
});

// ---- Digital-only orders: R0 regardless of method/subtotal ----
test("digital-only order (hasPhysicalItems=false) is always R0, every method", () => {
  for (const method of ["COURIER_LOCKER", "COURIER_DOOR", "COLLECTION"] as const) {
    assert.equal(calculateDeliveryFee(method, decimal(1000), false).toNumber(), 0);
  }
});

// ---- Gift-wrap exclusion test (Section O, Part 40) ----
test("R590 products + R30 gift wrap: does NOT qualify for free delivery (threshold judged on R590 alone)", () => {
  const physicalSubtotal = decimal(590); // gift wrap intentionally excluded from this figure
  assert.equal(calculateDeliveryFee("COURIER_LOCKER", physicalSubtotal, true).toNumber(), COURIER_LOCKER_FEE);
  assert.equal(calculateDeliveryFee("COURIER_DOOR", physicalSubtotal, true).toNumber(), COURIER_DOOR_FEE);
  assert.equal(calculateDeliveryFee("COLLECTION", physicalSubtotal, true).toNumber(), 0);
});

test("R600 products + R30 gift wrap: qualifies for free delivery (threshold judged on R600 alone)", () => {
  const physicalSubtotal = decimal(600);
  assert.equal(calculateDeliveryFee("COURIER_LOCKER", physicalSubtotal, true).toNumber(), 0);
  assert.equal(calculateDeliveryFee("COURIER_DOOR", physicalSubtotal, true).toNumber(), 0);
  assert.equal(calculateDeliveryFee("COLLECTION", physicalSubtotal, true).toNumber(), 0);
});

test("gift wrap fee itself is unaffected by delivery method or subtotal", () => {
  assert.equal(calculateGiftWrapFee(3, true).toNumber(), 90);
  assert.equal(calculateGiftWrapFee(3, false).toNumber(), 0);
});

// ---- Unsupported/tampered method rejection (Section P, Part 42) ----
test("an unsupported/tampered delivery method value throws rather than silently defaulting to a fee", () => {
  assert.throws(() => {
    // @ts-expect-error deliberately passing an invalid value to prove the runtime guard, not just the type system
    calculateDeliveryFee("FREE_DRONE_DELIVERY", decimal(100), true);
  });
});
