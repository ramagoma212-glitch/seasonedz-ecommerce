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
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = __dirname;

const FILES_THAT_MUST_NEVER_MENTION_AFFILIATE = [
  "services/product.service.ts",
  "services/adminProduct.service.ts",
  "services/order.service.ts",
  "services/customerOrder.service.ts",
  "services/category.service.ts",
  "services/digitalDownload.service.ts",
  "services/productReview.service.ts",
  "services/delivery.service.ts",
  "controllers/product.controller.ts",
  "controllers/order.controller.ts",
  "controllers/category.controller.ts",
  "validators/order.validator.ts",
];

for (const relativePath of FILES_THAT_MUST_NEVER_MENTION_AFFILIATE) {
  test(`${relativePath} has no code path into affiliate products`, () => {
    const contents = readFileSync(join(SRC_ROOT, relativePath), "utf8");
    assert.doesNotMatch(contents.toLowerCase(), /affiliate/, `${relativePath} must never reference anything affiliate-related`);
  });
}

test("the Prisma schema keeps AffiliateProduct unrelated to Product and Category — no foreign key exists in either direction", () => {
  const schema = readFileSync(join(SRC_ROOT, "..", "prisma", "schema.prisma"), "utf8");

  const productModelMatch = schema.match(/model Product \{[\s\S]*?\n\}/);
  const categoryModelMatch = schema.match(/model Category \{[\s\S]*?\n\}/);
  assert.ok(productModelMatch, "Product model not found in schema");
  assert.ok(categoryModelMatch, "Category model not found in schema");

  assert.doesNotMatch(productModelMatch![0], /Affiliate/, "Product must not reference any Affiliate model");
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
