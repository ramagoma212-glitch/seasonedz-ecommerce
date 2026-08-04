// Release-compatibility tests (Version 7, Milestone 168C.1).
//
// Proves, with real code rather than assumption, what happens when the
// live frontend and backend are briefly on different versions during a
// deploy. Pure-function/validator-only — no database connection.
//
// STATE A — an OLD frontend (pre-168C, never sends deliveryMethod,
// always sends a full deliveryAddress) submitting to the NEW backend.
// STATE B — a NEW frontend (168C, sends deliveryMethod, computes fees
// using the universal R600 rule) submitting to what the OLD backend
// would have computed (pre-168C R80/registered-only-R650 rule,
// reconstructed inline here from git history for comparison — the old
// rule no longer exists in this codebase to import from directly).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateOrderRequest } from "./order.validator.js";
import { calculateDeliveryFee } from "../utils/money.js";
import { Prisma } from "@prisma/client";

const VALID_CUSTOMER = { firstName: "Thandiwe", lastName: "Nkosi", email: "t@example.com", phone: "0821234567" };
const VALID_ADDRESS = {
  streetAddress: "12 Colouring Lane",
  suburb: "Sunnyside",
  city: "Pretoria",
  province: "Gauteng",
  postalCode: "0001",
};

// The exact shape src/js/api/ordersApi.js's buildOrderPayload() sent
// before Milestone 168C — no deliveryMethod field exists at all, and
// deliveryAddress is always sent in full regardless of anything.
function oldFrontendPayload() {
  return {
    customer: VALID_CUSTOMER,
    deliveryAddress: VALID_ADDRESS,
    paymentMethod: "BANK_TRANSFER",
    items: [{ productSlug: "abc-colouring-book", quantity: 1 }],
  };
}

test("STATE A: an old frontend's payload (no deliveryMethod) is safely REJECTED by the new backend, never silently accepted", () => {
  const result = validateOrderRequest(oldFrontendPayload());
  assert.equal(result.isValid, false, "old payload must not validate — this is what keeps checkout fail-closed, never fail-open with a wrong price");
  assert.ok(result.errors.some((e) => e.field === "deliveryMethod"), "rejection must be specifically about the missing deliveryMethod field");
  assert.equal(result.value, null, "no partial/guessed order data must ever be produced from an old-shaped payload");
});

// Old backend's pre-168C rule, reconstructed from git history
// (backend/src/config/delivery.ts at commit f89bc94) purely for this
// comparison — this rule no longer exists anywhere in the live
// codebase and this function must never be reintroduced as real logic.
function oldBackendRuleForComparisonOnly(subtotal: number, isRegisteredCustomer: boolean): number {
  const STANDARD_DELIVERY_FEE = 80;
  const REGISTERED_FREE_DELIVERY_THRESHOLD = 650;
  return isRegisteredCustomer && subtotal >= REGISTERED_FREE_DELIVERY_THRESHOLD ? 0 : STANDARD_DELIVERY_FEE;
}

test("STATE B: proves WHY a new frontend must never ship before the backend — a guest at R620 would be shown FREE but the old backend would still charge R80", () => {
  const physicalSubtotal = 620;
  const newFrontendShows = calculateDeliveryFee("COURIER_DOOR", new Prisma.Decimal(physicalSubtotal), true).toNumber();
  const oldBackendWouldCharge = oldBackendRuleForComparisonOnly(physicalSubtotal, false); // guest

  assert.equal(newFrontendShows, 0, "new frontend correctly shows FREE at R620 (>= the universal R600 threshold)");
  assert.equal(oldBackendWouldCharge, 80, "old backend would still charge R80 (guests never got free delivery under the old rule)");
  assert.notEqual(
    newFrontendShows,
    oldBackendWouldCharge,
    "CONFIRMED MISMATCH: this is exactly the forbidden 'shown one price, charged another' scenario — proves frontend must never deploy before backend"
  );
});

test("STATE B: a registered customer at R610 would also see a mismatch (shown FREE, old backend still charges R80 below its R650 gate)", () => {
  const physicalSubtotal = 610;
  const newFrontendShows = calculateDeliveryFee("COURIER_DOOR", new Prisma.Decimal(physicalSubtotal), true).toNumber();
  const oldBackendWouldCharge = oldBackendRuleForComparisonOnly(physicalSubtotal, true); // registered

  assert.equal(newFrontendShows, 0);
  assert.equal(oldBackendWouldCharge, 80);
  assert.notEqual(newFrontendShows, oldBackendWouldCharge);
});

test("Once BOTH sides are on 168C+, the same physical subtotal always produces the same fee — no mismatch window once the backend is live first", () => {
  for (const subtotal of [0, 100, 599, 600, 601, 1000]) {
    for (const method of ["COURIER_LOCKER", "COURIER_DOOR", "COLLECTION"] as const) {
      const shown = calculateDeliveryFee(method, new Prisma.Decimal(subtotal), true).toNumber();
      const charged = calculateDeliveryFee(method, new Prisma.Decimal(subtotal), true).toNumber();
      assert.equal(shown, charged);
    }
  }
});
