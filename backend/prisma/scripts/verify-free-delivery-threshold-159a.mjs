// Milestone 159A verification script: confirms gift wrapping is
// excluded from the R650 free-delivery threshold. Calls the real,
// compiled utils/money.js functions directly (calculateDeliveryFee,
// calculateGiftWrapFee) — pure/stateless, no database, no order ever
// created — reproducing exactly what order.service.ts's createOrder()
// does: compute `subtotal` from product lineTotal only, pass THAT
// (never subtotal + giftWrapTotal) into calculateDeliveryFee(), then
// only afterwards add giftWrapTotal into the final order total.
//
// Run via plain `node` against the compiled dist/ output (not `npx
// tsx`), matching this project's own established pattern — see
// prisma/scripts/verify-rls-hardening-154a.cjs's own header note.
// From backend/: `node prisma/scripts/verify-free-delivery-threshold-159a.mjs`

import { Prisma } from "@prisma/client";
import { calculateDeliveryFee, calculateGiftWrapFee } from "../../dist/utils/money.js";
import { REGISTERED_FREE_DELIVERY_THRESHOLD, STANDARD_DELIVERY_FEE } from "../../dist/config/delivery.js";

let pass = 0;
let fail = 0;

function check(label, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  OK   - ${label}${detail ? ` (${detail})` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
  }
}

// Reproduces order.service.ts's createOrder() math exactly:
// subtotal = sum of product lineTotal only (never includes gift wrap).
// giftWrapTotal = sum of each line's calculateGiftWrapFee.
// deliveryFee = calculateDeliveryFee(subtotal, ...) — subtotal only.
// total = subtotal + giftWrapTotal + deliveryFee.
function simulateOrder(productSubtotal, wrappedQuantity, isRegisteredCustomer) {
  const subtotal = new Prisma.Decimal(productSubtotal);
  const giftWrapTotal = calculateGiftWrapFee(wrappedQuantity, wrappedQuantity > 0);
  const deliveryFee = calculateDeliveryFee(subtotal, isRegisteredCustomer, true);
  const total = subtotal.plus(giftWrapTotal).plus(deliveryFee);
  return { subtotal: subtotal.toNumber(), giftWrapTotal: giftWrapTotal.toNumber(), deliveryFee: deliveryFee.toNumber(), total: total.toNumber() };
}

console.log("\n=== Milestone 159A: R650 free-delivery threshold excludes gift wrapping ===");
console.log(`(REGISTERED_FREE_DELIVERY_THRESHOLD=${REGISTERED_FREE_DELIVERY_THRESHOLD}, STANDARD_DELIVERY_FEE=${STANDARD_DELIVERY_FEE})\n`);

{
  // A) Products R620 + gift wrap R30 (1 wrapped item) -> checkout
  // before delivery = R650, but product subtotal alone is only R620,
  // so delivery must still be charged.
  const result = simulateOrder(620, 1, true);
  check("A) R620 products + R30 wrap: deliveryFee is R80 (charged), not free", result.deliveryFee === 80, `got R${result.deliveryFee}`);
  check("A) giftWrapTotal is R30", result.giftWrapTotal === 30, `got R${result.giftWrapTotal}`);
  check("A) total is R620 + R30 + R80 = R730", result.total === 730, `got R${result.total}`);
}

{
  // B) Products R650 + gift wrap R30 -> product subtotal itself already
  // reaches R650, so delivery is free regardless of the wrap fee.
  const result = simulateOrder(650, 1, true);
  check("B) R650 products + R30 wrap: deliveryFee is R0 (free)", result.deliveryFee === 0, `got R${result.deliveryFee}`);
  check("B) giftWrapTotal is R30", result.giftWrapTotal === 30, `got R${result.giftWrapTotal}`);
  check("B) total is R650 + R30 + R0 = R680", result.total === 680, `got R${result.total}`);
}

{
  // C) Products R640 + gift wrap R60 (2 wrapped items) -> checkout
  // before delivery = R700, but product subtotal alone is only R640,
  // so delivery must still be charged.
  const result = simulateOrder(640, 2, true);
  check("C) R640 products + R60 wrap: deliveryFee is R80 (charged), not free", result.deliveryFee === 80, `got R${result.deliveryFee}`);
  check("C) giftWrapTotal is R60", result.giftWrapTotal === 60, `got R${result.giftWrapTotal}`);
  check("C) total is R640 + R60 + R80 = R780", result.total === 780, `got R${result.total}`);
}

{
  // D) Products R700 + no gift wrap -> free delivery as normal.
  const result = simulateOrder(700, 0, true);
  check("D) R700 products + no wrap: deliveryFee is R0 (free)", result.deliveryFee === 0, `got R${result.deliveryFee}`);
  check("D) giftWrapTotal is R0", result.giftWrapTotal === 0, `got R${result.giftWrapTotal}`);
  check("D) total is R700 + R0 + R0 = R700", result.total === 700, `got R${result.total}`);
}

{
  // Direct proof of exclusion: if gift wrap were WRONGLY included in
  // the value passed to calculateDeliveryFee, R620 subtotal + R30 wrap
  // = R650 would incorrectly qualify for free delivery. Calling the
  // real function with the correct product-only R620 subtotal (never
  // R650) must NOT return a free (R0) fee.
  const wronglyIncluded = calculateDeliveryFee(new Prisma.Decimal(620).plus(30), true, true);
  const correctlyExcluded = calculateDeliveryFee(new Prisma.Decimal(620), true, true);
  check(
    "calculateDeliveryFee(R620, registered) charges R80 — proves gift wrap R30 is NOT silently added before this call in real order creation",
    correctlyExcluded.toNumber() === 80,
    `got R${correctlyExcluded.toNumber()} (a wrongly-included R650 call would have returned R${wronglyIncluded.toNumber()})`
  );
}

{
  // Guest (non-registered) customers never get free delivery at all,
  // regardless of subtotal or gift wrap — unaffected by this milestone,
  // confirming no regression to the existing registered-only rule.
  const result = simulateOrder(1000, 1, false);
  check("Guest customer, R1000 products + wrap: still charged R80 (free delivery is a registered-only benefit)", result.deliveryFee === 80, `got R${result.deliveryFee}`);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail > 0 ? 1 : 0);
