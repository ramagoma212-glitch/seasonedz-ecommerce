// Version 7, Milestone 172B.3: structural proofs specific to this
// milestone, extending directStoreSeparation.test.ts's own approach
// (172B) rather than duplicating it. Two things are proven cheaply by
// reading source text instead of exercising real behaviour:
//
// 1. Seasonedz's own affiliate/referral programme (Affiliate,
//    AffiliateProgrammeSettings, OrderAffiliateCommission) and 172B's
//    dormant external-merchant system (AffiliateProduct, AffiliateClick,
//    AffiliateCommission) never reference each other's files or models
//    — see the 172B.2 architecture audit for why they must stay
//    separate.
// 2. Nothing in this milestone wires a referral into checkout or order
//    creation yet (§14/§28 of the brief) — order.service.ts and its
//    validator must still have no code path into Affiliate/
//    OrderAffiliateCommission at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = __dirname;

function read(relativePath: string): string {
  return readFileSync(join(SRC_ROOT, relativePath), "utf8");
}

// Strips `//` line comments before matching — every file in this
// codebase uses only line comments (no /* */ blocks), and this
// milestone's own header comments deliberately name both systems by
// way of explaining why they stay apart (see this file's own header
// above). What actually matters structurally is the CODE never
// referencing the other system, not prose explaining the boundary.
function stripLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

test("the new referral programme files never reference 172B's external AffiliateProduct/AffiliateClick/AffiliateCommission models", () => {
  const referralFiles = [
    "services/referralAffiliate.service.ts",
    "services/referralProgrammeSettings.service.ts",
    "services/referralCommission.service.ts",
    "controllers/adminReferralAffiliate.controller.ts",
    "controllers/adminReferralSettings.controller.ts",
    "controllers/adminReferralCommission.controller.ts",
    "routes/adminReferrals.routes.ts",
  ];
  for (const file of referralFiles) {
    const code = stripLineComments(read(file));
    assert.doesNotMatch(code, /AffiliateProduct|AffiliateClick|\bAffiliateCommission\b/, `${file} must never reference the dormant external-merchant models`);
  }
});

test("172B's external affiliate-product files never reference the new internal referral programme models", () => {
  const externalFiles = ["services/adminAffiliateProduct.service.ts", "controllers/adminAffiliateProduct.controller.ts", "routes/adminAffiliate.routes.ts"];
  for (const file of externalFiles) {
    const code = stripLineComments(read(file));
    // Checks actual code usage — the Prisma Client property, or a
    // type/enum reference — not the plain English word "affiliate",
    // which legitimately appears in this file's own prose (e.g. an
    // "Affiliate product not found" error message).
    assert.doesNotMatch(code, /prisma\.affiliate\./, `${file} must never query the new Affiliate model`);
    assert.doesNotMatch(code, /\bAffiliateStatus\b|\bOrderAffiliateCommission\b|\bAffiliateProgrammeSettings\b/, `${file} must never reference the new referral programme's types`);
  }
});

test("order.service.ts and order.validator.ts have no code path into the referral programme yet — no discount, no commission, no attribution", () => {
  const orderService = read("services/order.service.ts");
  const orderValidator = read("validators/order.validator.ts");
  for (const [name, contents] of [
    ["order.service.ts", orderService],
    ["order.validator.ts", orderValidator],
  ] as const) {
    assert.doesNotMatch(contents, /referral|Affiliate|OrderAffiliateCommission/i, `${name} must not yet reference the referral programme — that is Milestone 172B.4`);
  }
});

test("Order.discountTotal is still hard-coded to zero in order.service.ts — the referral discount is not live yet", () => {
  const orderService = read("services/order.service.ts");
  assert.match(orderService, /discountTotal\s*=\s*new Prisma\.Decimal\(0\)/, "discountTotal must still be the existing hard-coded zero, unchanged by this milestone");
});

test("payfast.service.ts is untouched by this milestone — still reads amount from order.total directly", () => {
  const payfastService = read("services/payfast.service.ts");
  assert.doesNotMatch(payfastService, /referral|Affiliate/i);
  assert.match(payfastService, /order\.total\.toFixed\(2\)/);
});

test("historical snapshot structure: OrderAffiliateCommission carries every required snapshot field", () => {
  const schema = readFileSync(join(SRC_ROOT, "..", "prisma", "schema.prisma"), "utf8");
  const modelMatch = schema.match(/model OrderAffiliateCommission \{[\s\S]*?\n\}/);
  assert.ok(modelMatch, "OrderAffiliateCommission model not found in schema");
  const model = modelMatch![0];

  for (const field of [
    "affiliateNameSnapshot",
    "affiliateReferralCodeSnapshot",
    "qualifyingProductSubtotal",
    "discountRateApplied",
    "discountAmount",
    "netQualifyingAmount",
    "commissionRateApplied",
    "commissionAmount",
  ]) {
    assert.match(model, new RegExp(field), `OrderAffiliateCommission must snapshot ${field}`);
  }
});

test("database guarantee: at most one OrderAffiliateCommission per Order — orderId is @unique, not just checked in application code", () => {
  const schema = readFileSync(join(SRC_ROOT, "..", "prisma", "schema.prisma"), "utf8");
  const modelMatch = schema.match(/model OrderAffiliateCommission \{[\s\S]*?\n\}/);
  assert.ok(modelMatch);
  assert.match(modelMatch![0], /orderId\s+String\s+@unique/);
});

test("Affiliate has no hard-delete workflow: no delete function is exported from the referral affiliate service", () => {
  const contents = read("services/referralAffiliate.service.ts");
  assert.doesNotMatch(contents, /export\s+(async\s+)?function\s+delete/i);
  assert.doesNotMatch(contents, /prisma\.affiliate\.delete\(/);
});
