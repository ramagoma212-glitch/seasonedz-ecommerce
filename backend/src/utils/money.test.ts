// Delivery-fee and gift-wrap pricing tests (Version 7, Milestone
// 168C; rewritten Milestone 205 for the new single universal
// threshold and admin-editable rates).
// Pure-function unit tests, no Prisma/database connection at all —
// safe to run against this repo's live-production DATABASE_URL/.env
// without any risk, since nothing here ever imports config/prisma.js
// or opens a connection. Run with: npx tsx --test src/utils/money.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { calculateDeliveryFee, calculateGiftWrapFee, type DeliveryRates } from "./money.js";
import { COURIER_LOCKER_FEE, COURIER_DOOR_FEE, FREE_DELIVERY_THRESHOLD } from "../config/delivery.js";

function decimal(value: number) {
  return new Prisma.Decimal(value);
}

// ---- Delivery fee test matrix — one universal threshold (Milestone 205) ----
const SUBTOTALS = [0, 100, FREE_DELIVERY_THRESHOLD - 1, FREE_DELIVERY_THRESHOLD, FREE_DELIVERY_THRESHOLD + 1, 1000];

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

// ---- Milestone 205: isRegisteredCustomer no longer changes anything ----
// The registered-vs-guest threshold split (Milestone 180) was removed —
// one threshold applies to every customer. These tests prove the 4th
// argument is now inert, rather than silently re-introducing a second
// threshold by accident.
test("isRegisteredCustomer=true gives the exact same fee as isRegisteredCustomer=false, at every subtotal in the matrix", () => {
  for (const subtotal of SUBTOTALS) {
    for (const method of ["COURIER_LOCKER", "COURIER_DOOR", "COLLECTION"] as const) {
      const guestFee = calculateDeliveryFee(method, decimal(subtotal), true, false).toNumber();
      const registeredFee = calculateDeliveryFee(method, decimal(subtotal), true, true).toNumber();
      assert.equal(registeredFee, guestFee, `${method} at R${subtotal} differs between guest and registered`);
    }
  }
});

test("isRegisteredCustomer defaults to false — an omitted 4th argument behaves exactly like explicitly passing false", () => {
  const omitted = calculateDeliveryFee("COURIER_LOCKER", decimal(100), true).toNumber();
  const explicit = calculateDeliveryFee("COURIER_LOCKER", decimal(100), true, false).toNumber();
  assert.equal(omitted, explicit);
});

// ---- Exact boundary test matrix ----
test(`R${FREE_DELIVERY_THRESHOLD - 0.01} is charged, not free`, () => {
  const subtotal = decimal(FREE_DELIVERY_THRESHOLD - 0.01);
  assert.equal(calculateDeliveryFee("COURIER_LOCKER", subtotal, true).toNumber(), COURIER_LOCKER_FEE);
  assert.equal(calculateDeliveryFee("COURIER_DOOR", subtotal, true).toNumber(), COURIER_DOOR_FEE);
});

test(`exactly R${FREE_DELIVERY_THRESHOLD}.00 is free on both Locker and Door`, () => {
  const subtotal = decimal(FREE_DELIVERY_THRESHOLD);
  assert.equal(calculateDeliveryFee("COURIER_LOCKER", subtotal, true).toNumber(), 0);
  assert.equal(calculateDeliveryFee("COURIER_DOOR", subtotal, true).toNumber(), 0);
});

// ---- Milestone 205: optional `rates` override (admin-configured live values) ----
test("a `rates` override replaces the config/delivery.ts fallback constants entirely", () => {
  const customRates: DeliveryRates = {
    courierLockerFee: decimal(45),
    courierDoorFee: decimal(70),
    freeDeliveryThreshold: decimal(250),
  };

  assert.equal(calculateDeliveryFee("COURIER_LOCKER", decimal(100), true, false, customRates).toNumber(), 45);
  assert.equal(calculateDeliveryFee("COURIER_DOOR", decimal(100), true, false, customRates).toNumber(), 70);
  // R250 is free under the override even though it's below the real FREE_DELIVERY_THRESHOLD fallback.
  assert.equal(calculateDeliveryFee("COURIER_LOCKER", decimal(250), true, false, customRates).toNumber(), 0);
});

test("omitting `rates` falls back to the config/delivery.ts constants exactly as before", () => {
  assert.equal(calculateDeliveryFee("COURIER_LOCKER", decimal(100), true).toNumber(), COURIER_LOCKER_FEE);
});

test("registered customer, digital-only order (hasPhysicalItems=false) is always R0 regardless of the registered flag", () => {
  for (const method of ["COURIER_LOCKER", "COURIER_DOOR", "COLLECTION"] as const) {
    assert.equal(calculateDeliveryFee(method, decimal(1000), false, true).toNumber(), 0);
  }
});

// ---- Gift wrap excluded from the threshold ----
test(`R${FREE_DELIVERY_THRESHOLD - 10} physical + R30 gift wrap does NOT qualify — threshold judged on the physical amount alone`, () => {
  const physicalSubtotal = decimal(FREE_DELIVERY_THRESHOLD - 10);
  assert.equal(calculateDeliveryFee("COURIER_LOCKER", physicalSubtotal, true).toNumber(), COURIER_LOCKER_FEE);
  assert.equal(calculateDeliveryFee("COURIER_DOOR", physicalSubtotal, true).toNumber(), COURIER_DOOR_FEE);
});

test(`R${FREE_DELIVERY_THRESHOLD} physical + R30 gift wrap qualifies for free delivery (threshold judged on the physical amount alone)`, () => {
  const physicalSubtotal = decimal(FREE_DELIVERY_THRESHOLD);
  assert.equal(calculateDeliveryFee("COURIER_LOCKER", physicalSubtotal, true).toNumber(), 0);
  assert.equal(calculateDeliveryFee("COURIER_DOOR", physicalSubtotal, true).toNumber(), 0);
  assert.equal(calculateDeliveryFee("COLLECTION", physicalSubtotal, true).toNumber(), 0);
});

// ---- Digital-only orders: R0 regardless of method/subtotal ----
test("digital-only order (hasPhysicalItems=false) is always R0, every method", () => {
  for (const method of ["COURIER_LOCKER", "COURIER_DOOR", "COLLECTION"] as const) {
    assert.equal(calculateDeliveryFee(method, decimal(1000), false).toNumber(), 0);
  }
});

test("gift wrap fee itself is unaffected by delivery method or subtotal", () => {
  assert.equal(calculateGiftWrapFee(3, true).toNumber(), 90);
  assert.equal(calculateGiftWrapFee(3, false).toNumber(), 0);
});

// ---- Unsupported/tampered method rejection ----
test("an unsupported/tampered delivery method value throws rather than silently defaulting to a fee", () => {
  assert.throws(() => {
    // @ts-expect-error deliberately passing an invalid value to prove the runtime guard, not just the type system
    calculateDeliveryFee("FREE_DRONE_DELIVERY", decimal(100), true);
  });
});
