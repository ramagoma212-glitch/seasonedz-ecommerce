// Milestone 178, Part C: the one-time safe transition preserving
// production affiliate eligibility. Before this milestone, Seasonedz's
// own affiliate/referral programme had NO per-product exclusion at all
// — every product in a referred order counted toward the flat, whole-
// order commission calculation (see referralPricing.service.ts's own
// header comment: "V1 has no product-level referral exclusion"). This
// milestone introduces AffiliateProductSetting as an explicit opt-in
// list — a product with no row at all is no longer affiliate-eligible
// (see that model's own schema comment) — so, without this script,
// applying the migration would silently stop EVERY existing product
// from earning any commission at all, a real regression against
// current production behaviour.
//
// This script creates one AffiliateProductSetting row for every
// existing Product that doesn't already have one, with:
//   - isAffiliateAvailable: true (unchanged from today — nothing was
//     ever excluded before this milestone)
//   - commissionType: PERCENTAGE
//   - commissionPercent: null — this is the "existing default
//     commission rate" the brief asks to preserve, but deliberately
//     NOT a frozen numeric copy of whatever AffiliateProgrammeSettings.
//     defaultCommissionRate happens to be today. null means "defer to
//     the affiliate's own resolved rate" (their commissionRateOverride,
//     or else the programme's CURRENT default) — the exact same null-
//     means-current-default convention this codebase already uses
//     everywhere else (Affiliate.commissionRateOverride,
//     AffiliateProductSetting.commissionPercent's own schema comment).
//     Freezing a numeric snapshot here would be a genuine behaviour
//     change: if the owner later changes the programme-wide default
//     rate, every one of these transitioned products would silently
//     stop tracking it while a newly-added product would — an
//     inconsistency this script deliberately avoids.
//   - fixedCommissionAmount: null, startsAt/endsAt: null,
//     maximumCommission: null — no restriction, matching "no product-
//     level exclusion" exactly.
//
// Idempotent and safe to re-run: every product is looked up by its own
// AffiliateProductSetting.productId (the model's own @unique
// constraint) first; a product that already has a row (whether from an
// earlier run of this script, or because an admin has since customised
// it) is left completely untouched. Invoked manually
// (`npm run transition:affiliate-products-178`), never automatically —
// same discipline as prisma/seed.ts and seedContentStudioBrandKnowledge.ts.

import { PrismaClient, AffiliateProductCommissionType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({ select: { id: true, name: true } });
  console.log(`[transition:affiliate-products-178] found ${products.length} product(s) in total.`);

  let created = 0;
  let skipped = 0;

  for (const product of products) {
    const existing = await prisma.affiliateProductSetting.findUnique({ where: { productId: product.id } });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.affiliateProductSetting.create({
      data: {
        productId: product.id,
        commissionType: AffiliateProductCommissionType.PERCENTAGE,
        commissionPercent: null,
        fixedCommissionAmount: null,
        isAffiliateAvailable: true,
        startsAt: null,
        endsAt: null,
        maximumCommission: null,
      },
    });
    created += 1;
    console.log(`[transition:affiliate-products-178] created setting for "${product.name}" (${product.id})`);
  }

  console.log(`[transition:affiliate-products-178] done. created=${created} skipped(already existed)=${skipped}`);
}

main()
  .catch((error) => {
    console.error("[transition:affiliate-products-178] failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
