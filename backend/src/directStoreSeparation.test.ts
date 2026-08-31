// Version 7, Milestone 172B: proves AffiliateProduct has no code path
// into any direct-store system (Step 18 of the milestone brief). Every
// other test in this codebase already exercises cart/checkout/orders/
// stock/reviews/digital-downloads/the Merchant feed in depth — this
// file doesn't re-test any of that behaviour. It only asserts a much
// narrower, much cheaper fact: none of those files' own source code
// mentions "affiliate" at all, which is what actually makes the
// separation structural rather than a rule someone has to remember to
// keep true as this codebase keeps growing. If a future change ever
// makes one of these files reference an affiliate model, this test
// fails immediately and loudly, rather than the separation quietly
// eroding.
//
// Version 7, Milestone 172B.4: order.service.ts and order.validator.ts
// moved OUT of this "never mentions affiliate at all" list into the
// narrower one below — Seasonedz's own internal referral programme
// (Affiliate, OrderAffiliateCommission — a fully separate system from
// AffiliateProduct, see the 172B.2 audit) is now genuinely wired into
// checkout, so a blanket "never says affiliate" check would fail on
// legitimate code. What this file actually needs to keep proving is
// narrower and still true: the EXTERNAL AffiliateProduct system has no
// path into either file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = __dirname;

// Strips `//` line comments before matching — same helper (and same
// CRLF-normalisation reasoning) as referralProgrammeSeparation.test.ts's
// own stripLineComments(). Needed here from Milestone 178, Part C
// onward: a comment explaining why AffiliateProductSetting is NOT the
// dormant AffiliateProduct model necessarily names the dormant model,
// which is prose explaining the boundary, not code crossing it.
function stripLineComments(source: string): string {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const FILES_THAT_MUST_NEVER_MENTION_AFFILIATE = [
  "services/product.service.ts",
  "services/adminProduct.service.ts",
  "services/customerOrder.service.ts",
  "services/category.service.ts",
  "services/digitalDownload.service.ts",
  "services/productReview.service.ts",
  "services/delivery.service.ts",
  "controllers/product.controller.ts",
  "controllers/order.controller.ts",
  "controllers/category.controller.ts",
];

for (const relativePath of FILES_THAT_MUST_NEVER_MENTION_AFFILIATE) {
  test(`${relativePath} has no code path into affiliate products`, () => {
    const contents = readFileSync(join(SRC_ROOT, relativePath), "utf8");
    assert.doesNotMatch(contents.toLowerCase(), /affiliate/, `${relativePath} must never reference anything affiliate-related`);
  });
}

const FILES_THAT_MUST_NEVER_REFERENCE_EXTERNAL_AFFILIATE_PRODUCTS = ["services/order.service.ts", "validators/order.validator.ts"];

for (const relativePath of FILES_THAT_MUST_NEVER_REFERENCE_EXTERNAL_AFFILIATE_PRODUCTS) {
  test(`${relativePath} has no code path into the EXTERNAL AffiliateProduct system (may reference the internal referral programme)`, () => {
    const contents = readFileSync(join(SRC_ROOT, relativePath), "utf8");
    // Word-boundaried (Milestone 178, Part C): matches the exact dormant
    // model names only, never a substring hit inside a deliberately
    // similarly-prefixed NEW model this milestone introduces
    // (AffiliateProductSetting, OrderAffiliateProductCommission,
    // AffiliateProductCommissionType) — see that milestone's own brief
    // for why AffiliateProductSetting was the recommended name despite
    // sharing a prefix with the dormant AffiliateProduct model.
    assert.doesNotMatch(contents, /\bAffiliateProduct\b|\bAffiliateClick\b|\bAffiliateCommission\b/, `${relativePath} must never reference the dormant external-merchant models`);
  });
}

test("the Prisma schema keeps AffiliateProduct unrelated to Product and Category — no foreign key exists in either direction", () => {
  const schema = stripLineComments(readFileSync(join(SRC_ROOT, "..", "prisma", "schema.prisma"), "utf8"));

  const productModelMatch = schema.match(/model Product \{[\s\S]*?\n\}/);
  const categoryModelMatch = schema.match(/model Category \{[\s\S]*?\n\}/);
  assert.ok(productModelMatch, "Product model not found in schema");
  assert.ok(categoryModelMatch, "Category model not found in schema");

  // Milestone 178, Part C: Product now legitimately relates to the
  // internal referral programme's OWN AffiliateProductSetting/
  // OrderAffiliateProductCommission models (per-product commission
  // configuration) — what must still never be true is a relation to
  // 172B's dormant EXTERNAL AffiliateProduct/AffiliateClick/
  // AffiliateCommission models specifically, so this checks the exact
  // dormant names (word-boundaried) rather than the word "Affiliate"
  // anywhere at all.
  assert.doesNotMatch(productModelMatch![0], /\bAffiliateProduct\b|\bAffiliateClick\b|\bAffiliateCommission\b/, "Product must not reference the dormant external AffiliateProduct/AffiliateClick/AffiliateCommission models");
  assert.doesNotMatch(categoryModelMatch![0], /Affiliate/, "Category must not reference any Affiliate model");

  const affiliateProductModelMatch = schema.match(/model AffiliateProduct \{[\s\S]*?\n\}/);
  assert.ok(affiliateProductModelMatch, "AffiliateProduct model not found in schema");
  assert.doesNotMatch(
    affiliateProductModelMatch![0],
    /categoryId|category\s+Category|productId|product\s+Product/,
    "AffiliateProduct must not carry a foreign key into Product or Category"
  );
});

test("AffiliateProduct carries no stockQuantity field — stock is meaningless for something Seasonedz never fulfils", () => {
  const schema = readFileSync(join(SRC_ROOT, "..", "prisma", "schema.prisma"), "utf8");
  const affiliateProductModelMatch = schema.match(/model AffiliateProduct \{[\s\S]*?\n\}/);
  assert.ok(affiliateProductModelMatch);
  assert.doesNotMatch(affiliateProductModelMatch![0], /stockQuantity/);
});
