// Delivery-method request validation tests (Version 7, Milestone 168C).
// Pure-function unit tests, no Prisma/database connection — validates
// only request SHAPE (never price/fee/total, which this validator
// never reads at all — see the file's own header comment). Run with:
// npx tsx --test src/validators/order.validator.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateOrderRequest } from "./order.validator.js";

const VALID_CUSTOMER = { firstName: "Thandiwe", lastName: "Nkosi", email: "t@example.com", phone: "0821234567" };
const VALID_ADDRESS = {
  streetAddress: "12 Colouring Lane",
  suburb: "Sunnyside",
  city: "Pretoria",
  province: "Gauteng",
  postalCode: "0001",
};
const VALID_ITEMS = [{ productSlug: "abc-colouring-book", quantity: 1 }];

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    customer: VALID_CUSTOMER,
    deliveryAddress: VALID_ADDRESS,
    paymentMethod: "BANK_TRANSFER",
    items: VALID_ITEMS,
    ...overrides,
  };
}

test("rejects a request with an unsupported/tampered delivery method", () => {
  const result = validateOrderRequest(baseBody({ deliveryMethod: "FREE_DRONE_DELIVERY" }));
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.field === "deliveryMethod"));
});

test("rejects a request with no delivery method at all", () => {
  const result = validateOrderRequest(baseBody({}));
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.field === "deliveryMethod"));
});

test("COURIER_DOOR requires a full delivery address", () => {
  const result = validateOrderRequest(baseBody({ deliveryMethod: "COURIER_DOOR", deliveryAddress: {} }));
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.field === "deliveryAddress.streetAddress"));
});

test("COURIER_DOOR with a valid address is accepted, deliveryAddress present in output", () => {
  const result = validateOrderRequest(baseBody({ deliveryMethod: "COURIER_DOOR" }));
  assert.equal(result.isValid, true);
  assert.equal(result.value?.deliveryMethod, "COURIER_DOOR");
  assert.equal(result.value?.deliveryAddress?.streetAddress, "12 Colouring Lane");
  assert.equal(result.value?.collectionCity, null);
});

// Version 7, Milestone 168C.1: no real Courier Guy locker-picker
// exists yet, so COURIER_LOCKER only ever needs city/province — never
// a full street address, which would misleadingly imply it's the
// actual delivery destination. See order.validator.ts's own comment.
test("COURIER_LOCKER accepts city/province alone, with no street/suburb/postal code sent at all", () => {
  const result = validateOrderRequest(
    baseBody({ deliveryMethod: "COURIER_LOCKER", deliveryAddress: { city: "Pretoria", province: "Gauteng" } })
  );
  assert.equal(result.isValid, true, JSON.stringify(result.errors));
  assert.equal(result.value?.deliveryMethod, "COURIER_LOCKER");
  assert.equal(result.value?.deliveryAddress?.city, "Pretoria");
  assert.equal(result.value?.deliveryAddress?.province, "Gauteng");
});

test("COURIER_LOCKER never stores a street address, suburb or postal code even if the client sends one anyway", () => {
  const result = validateOrderRequest(baseBody({ deliveryMethod: "COURIER_LOCKER" })); // baseBody sends the full VALID_ADDRESS
  assert.equal(result.isValid, true);
  assert.equal(result.value?.deliveryAddress?.streetAddress, null, "a full street address must never be persisted for a method with no real locker-picker");
  assert.equal(result.value?.deliveryAddress?.suburb, null);
  assert.equal(result.value?.deliveryAddress?.postalCode, null);
});

test("COURIER_LOCKER without city/province is rejected — city/province are the only genuinely required fields", () => {
  const result = validateOrderRequest(baseBody({ deliveryMethod: "COURIER_LOCKER", deliveryAddress: {} }));
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.field === "deliveryAddress.city"));
  assert.ok(result.errors.some((e) => e.field === "deliveryAddress.province"));
  assert.ok(!result.errors.some((e) => e.field === "deliveryAddress.streetAddress"), "street address must never be required for Locker");
});

test("COURIER_DOOR still requires the full address (street, suburb, postal code) unlike Locker", () => {
  const result = validateOrderRequest(
    baseBody({ deliveryMethod: "COURIER_DOOR", deliveryAddress: { city: "Pretoria", province: "Gauteng" } })
  );
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.field === "deliveryAddress.streetAddress"));
  assert.ok(result.errors.some((e) => e.field === "deliveryAddress.suburb"));
  assert.ok(result.errors.some((e) => e.field === "deliveryAddress.postalCode"));
});

test("COLLECTION requires a valid collectionCity, not an address", () => {
  const noCityResult = validateOrderRequest(baseBody({ deliveryMethod: "COLLECTION", deliveryAddress: {} }));
  assert.equal(noCityResult.isValid, false);
  assert.ok(noCityResult.errors.some((e) => e.field === "collectionCity"));
  assert.ok(!noCityResult.errors.some((e) => e.field.startsWith("deliveryAddress")));

  const badCityResult = validateOrderRequest(baseBody({ deliveryMethod: "COLLECTION", collectionCity: "Cape Town", deliveryAddress: {} }));
  assert.equal(badCityResult.isValid, false);
  assert.ok(badCityResult.errors.some((e) => e.field === "collectionCity"));
});

test("COLLECTION with a valid city is accepted, deliveryAddress is null in output", () => {
  const result = validateOrderRequest(baseBody({ deliveryMethod: "COLLECTION", collectionCity: "Pretoria", deliveryAddress: {} }));
  assert.equal(result.isValid, true);
  assert.equal(result.value?.deliveryMethod, "COLLECTION");
  assert.equal(result.value?.deliveryAddress, null);
  assert.equal(result.value?.collectionCity, "Pretoria");
});

test("COLLECTION accepts the other approved city too (Thohoyandou)", () => {
  const result = validateOrderRequest(baseBody({ deliveryMethod: "COLLECTION", collectionCity: "Thohoyandou", deliveryAddress: {} }));
  assert.equal(result.isValid, true);
  assert.equal(result.value?.collectionCity, "Thohoyandou");
});

test("client-supplied price/subtotal/deliveryFee/total fields are never read into the validated output", () => {
  const result = validateOrderRequest(
    baseBody({ deliveryMethod: "COURIER_DOOR", price: 1, subtotal: 1, deliveryFee: 0, total: 1 })
  );
  assert.equal(result.isValid, true);
  assert.equal(Object.prototype.hasOwnProperty.call(result.value, "price"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.value, "subtotal"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.value, "total"), false);
});
