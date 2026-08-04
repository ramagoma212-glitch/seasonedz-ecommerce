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

test("COURIER_LOCKER with a valid address is accepted", () => {
  const result = validateOrderRequest(baseBody({ deliveryMethod: "COURIER_LOCKER" }));
  assert.equal(result.isValid, true);
  assert.equal(result.value?.deliveryMethod, "COURIER_LOCKER");
  assert.ok(result.value?.deliveryAddress);
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
