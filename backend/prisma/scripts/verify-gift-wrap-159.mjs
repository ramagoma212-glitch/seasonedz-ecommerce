// Milestone 159 verification script. Every check here calls the real,
// compiled backend logic (money.js's calculateGiftWrapFee, order.
// validator.js's validateOrderRequest) directly — never through Express,
// never through the database, and NEVER by calling order.service.ts's
// createOrder() (which always writes a real Order/Payment row — that is
// exactly what this milestone's rules forbid). These two functions are
// pure/stateless, so they're the correct and only safe place to prove
// the R30-per-item math and the tampering-resistant validation shape
// without touching the live Supabase database at all.
//
// Run via plain `node` against the compiled dist/ output (not `npx
// tsx`), matching this project's own established pattern — see
// prisma/scripts/verify-rls-hardening-154a.cjs's own header note on
// why. From backend/: `node prisma/scripts/verify-gift-wrap-159.mjs`

import { calculateGiftWrapFee } from "../../dist/utils/money.js";
import { validateOrderRequest } from "../../dist/validators/order.validator.js";
import { GIFT_WRAP_FEE_PER_ITEM, GIFT_MESSAGE_MAX_LENGTH } from "../../dist/config/giftWrap.js";

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

function baseBody(items) {
  return {
    customer: { firstName: "Test", lastName: "Customer", email: "test@example.com", phone: "0821234567" },
    deliveryAddress: {
      streetAddress: "1 Test Street",
      suburb: "Test Suburb",
      city: "Cape Town",
      province: "Western Cape",
      postalCode: "8001",
      country: "South Africa",
    },
    paymentMethod: "BANK_TRANSFER",
    items,
  };
}

console.log("\n=== Milestone 159: gift wrap fee math (money.ts) ===");
check("qty 1, wrapped = R30", calculateGiftWrapFee(1, true).toNumber() === 30, `got ${calculateGiftWrapFee(1, true).toNumber()}`);
check("qty 2, wrapped = R60", calculateGiftWrapFee(2, true).toNumber() === 60, `got ${calculateGiftWrapFee(2, true).toNumber()}`);
check("qty 3, wrapped = R90", calculateGiftWrapFee(3, true).toNumber() === 90, `got ${calculateGiftWrapFee(3, true).toNumber()}`);
check("qty 5, NOT wrapped = R0", calculateGiftWrapFee(5, false).toNumber() === 0, `got ${calculateGiftWrapFee(5, false).toNumber()}`);
check("GIFT_WRAP_FEE_PER_ITEM constant is 30", GIFT_WRAP_FEE_PER_ITEM === 30, `got ${GIFT_WRAP_FEE_PER_ITEM}`);
check("GIFT_MESSAGE_MAX_LENGTH constant is 150", GIFT_MESSAGE_MAX_LENGTH === 150, `got ${GIFT_MESSAGE_MAX_LENGTH}`);

console.log("\n=== Milestone 159: order.validator.ts shape/length validation ===");

{
  const result = validateOrderRequest(baseBody([{ productSlug: "abc-colouring-book-for-kids-with-fun-facts", quantity: 1, giftWrap: true, giftMessage: "Happy Birthday, Naledi!" }]));
  check("valid wrapped item with message passes", result.isValid === true);
  check("giftWrap survives as true", result.value?.items[0]?.giftWrap === true);
  check("giftMessage survives trimmed", result.value?.items[0]?.giftMessage === "Happy Birthday, Naledi!");
}

{
  const exactly150 = "x".repeat(150);
  const result = validateOrderRequest(baseBody([{ productSlug: "abc-colouring-book-for-kids-with-fun-facts", quantity: 1, giftWrap: true, giftMessage: exactly150 }]));
  check("message at exactly 150 chars is accepted", result.isValid === true);
}

{
  const tooLong = "x".repeat(151);
  const result = validateOrderRequest(baseBody([{ productSlug: "abc-colouring-book-for-kids-with-fun-facts", quantity: 1, giftWrap: true, giftMessage: tooLong }]));
  check("message at 151 chars is rejected", result.isValid === false);
  check("rejection names the right field", result.errors.some((e) => e.field === "items[0].giftMessage"));
}

{
  const result = validateOrderRequest(baseBody([{ productSlug: "abc-colouring-book-for-kids-with-fun-facts", quantity: 1, giftWrap: true }]));
  check("giftWrap true with no message at all is valid (message never required)", result.isValid === true);
  check("giftMessage defaults to null, not empty string", result.value?.items[0]?.giftMessage === null);
}

{
  const result = validateOrderRequest(baseBody([{ productSlug: "abc-colouring-book-for-kids-with-fun-facts", quantity: 1, giftWrap: true, giftMessage: "   " }]));
  check("whitespace-only message stored as null, not meaningless content", result.value?.items[0]?.giftMessage === null);
}

{
  const result = validateOrderRequest(baseBody([{ productSlug: "abc-colouring-book-for-kids-with-fun-facts", quantity: 1, giftWrap: "true" }]));
  check("giftWrap as a STRING \"true\" (not boolean) coerces to false, never treated as truthy", result.value?.items[0]?.giftWrap === false);
}

{
  const result = validateOrderRequest(baseBody([{ productSlug: "abc-colouring-book-for-kids-with-fun-facts", quantity: 1 }]));
  check("giftWrap omitted entirely defaults to false (backwards compatible with pre-Milestone-159 requests)", result.value?.items[0]?.giftWrap === false);
}

{
  // Tampering test: the whole point is that a client CANNOT even express
  // a price/fee in this payload shape — validateOrderRequest only ever
  // reads productSlug/quantity/giftWrap/giftMessage from each item (see
  // order.validator.ts's own header comment), so any of these extra
  // fields are silently dropped, never reaching the returned value at
  // all, regardless of what a manipulated request body claims.
  const result = validateOrderRequest(
    baseBody([{ productSlug: "abc-colouring-book-for-kids-with-fun-facts", quantity: 1, giftWrap: true, giftMessage: "Hi", price: 0.01, giftWrapFee: 0, total: 1, unitPrice: 0 }])
  );
  const item = result.value?.items[0] ?? {};
  const keys = Object.keys(item).sort();
  check(
    "a manipulated item payload (extra price/giftWrapFee/total/unitPrice fields) never survives into the validated shape",
    JSON.stringify(keys) === JSON.stringify(["giftMessage", "giftWrap", "productSlug", "quantity"]),
    `validated item keys: ${keys.join(", ")}`
  );
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail > 0 ? 1 : 0);
