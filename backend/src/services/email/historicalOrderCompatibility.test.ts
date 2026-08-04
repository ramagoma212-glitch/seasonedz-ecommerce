// Historical order compatibility tests (Version 7, Milestone 168C.1).
//
// The migration 20260804130000_add_delivery_methods backfills EVERY
// existing Order row with deliveryMethod = 'COURIER_DOOR' (a NOT NULL
// column with a DEFAULT — Postgres rewrites every row atomically as
// part of the ALTER TABLE, no manual backfill script needed) and
// collectionCity = NULL. This is not a guess: it reflects what every
// pre-168C order actually was in substance — a courier delivery to a
// full written address, arranged manually, the only model that ever
// existed before this migration.
//
// These tests prove real historical-shaped data (full address,
// deliveryMethod backfilled to COURIER_DOOR, collectionCity null)
// renders safely through the email templates — the one place in this
// backend this milestone touched that's a pure function easily tested
// without a live database. Admin/customer page-level rendering for the
// same shape is covered by the frontend Playwright suite instead (see
// tests/smoke/account.spec.js's mocked order-detail tests).
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderOrderCreatedEmail, renderAdminNewOrderEmail } from "./emailTemplates.js";
import type { OrderEmailData } from "./email.types.js";

// The exact shape a historical (pre-168C, migrated) order takes once
// read back from the database — full address always present (every
// pre-168C order collected one), deliveryMethod backfilled to
// COURIER_DOOR, collectionCity null (Collection never existed yet).
function historicalOrder(): OrderEmailData {
  return {
    orderNumber: "SG-2026-0001",
    customerFirstName: "Naledi",
    customerLastName: "Dlamini",
    customerEmail: "naledi@example.com",
    customerPhone: "0821234567",
    total: 179.99,
    paymentStatus: "PAID",
    paymentMethod: "BANK_TRANSFER",
    items: [{ productName: "ABC Colouring Book for Kids", quantity: 1, lineTotal: 149.99 }],
    deliveryMethod: "COURIER_DOOR",
    deliveryFee: 80, // the historical order's own real, already-charged fee — never recomputed retroactively
    collectionCity: null,
    deliveryStreetAddress: "45 Heritage Road",
    deliverySuburb: "Brooklyn",
    deliveryCity: "Pretoria",
    deliveryProvince: "Gauteng",
    deliveryPostalCode: "0181",
    deliveryNotes: null,
  };
}

test("a historical (backfilled) order renders through the order-created email without throwing", () => {
  assert.doesNotThrow(() => renderOrderCreatedEmail(historicalOrder()));
});

test("a historical order's email shows its real address, never invented Locker/Collection wording", () => {
  const { body } = renderOrderCreatedEmail(historicalOrder());
  assert.match(body, /45 Heritage Road/);
  assert.match(body, /Brooklyn/);
  assert.match(body, /Courier Guy Door to Door/);
  assert.doesNotMatch(body, /Customer Collection/);
  assert.doesNotMatch(body, /Locker/);
});

test("a historical order renders through the admin new-order email without throwing", () => {
  assert.doesNotThrow(() => renderAdminNewOrderEmail(historicalOrder()));
});

test("defensive fallback: an order with a genuinely missing/unrecognised deliveryMethod still renders safely (never crashes, never guesses a specific method)", () => {
  const malformed = { ...historicalOrder(), deliveryMethod: "" };
  const { body } = renderOrderCreatedEmail(malformed);
  // Falls back to a plain, honest "Delivery" label — real production
  // data can never actually reach this state (the migration's NOT
  // NULL DEFAULT guarantees every row has a real method), but this
  // proves the rendering path degrades safely rather than crashing if
  // it ever did.
  assert.match(body, /Delivery Method: Delivery/);
});
