// Version 6, Milestone 50: safe, narrowly-scoped product content sync.
//
// Updates ONLY description / shortDescription / features / (ageRange,
// Bible titles only) for the four specific products identified in
// VERSION_6_PRODUCT_DATABASE_SYNC_PLAN.md — folding the real facts
// supplied for Milestone 48 into existing text fields, per the
// accepted low-risk decision (no schema migration, no new columns).
//
// Defaults to a dry run: reads the current values, prints exactly what
// would change, and writes nothing. Pass --apply to perform the real
// update. This is deliberately a separate script from prisma/seed.ts,
// which is NOT safe to re-run against production — its upsert writes
// price/stockQuantity/ratingAverage/reviewCount back to seed-time
// defaults, overwriting real order-driven state. This script only ever
// calls prisma.product.update() with a narrow, explicit `data: {}`
// object listing exactly the allowed fields below — never a spread of
// a larger object, so a forbidden field (price, stock, rating, images,
// slug, sku, category) can never leak in even if this file is edited
// carelessly later.
//
// Usage:
//   tsx prisma/scripts/update-product-content.ts            (dry run, default)
//   tsx prisma/scripts/update-product-content.ts --apply     (real update)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ALLOWED_FIELDS = ["description", "shortDescription", "features", "ageRange"] as const;

interface ProductContentUpdate {
  slug: string;
  description: string;
  shortDescription: string;
  features: string[];
  ageRange?: string; // only set for the two Bible titles — omitted means "leave unchanged"
}

// New text sourced verbatim from src/data/products.js as of Milestone 48
// (commit 74b1a2c) — see backend/prisma/product-content-update-plan.md
// for the full old-vs-new comparison this was drawn from.
const UPDATES: ProductContentUpdate[] = [
  {
    slug: "abc-colouring-book-for-kids-with-fun-facts",
    shortDescription:
      "An A4 alphabet colouring book for early learners, with tracing, colouring and a fun fact on every page.",
    description:
      "Made for young children who are just starting to learn their letters. Each page pairs a large letter to trace and colour with a simple, bite sized fun fact, so little hands stay busy while little minds pick up something new. A firm favourite at home, in pre-school and in the classroom.",
    features: [
      "A4 size, 30 pages",
      "Saddle-stitched (stapled) binding",
      "Letters to trace as well as colour",
      "A fun fact printed on every page",
      "Suited to early learning at home or school",
    ],
  },
  {
    slug: "mindfulness-colouring-book-for-adults",
    shortDescription:
      "An A4 adult colouring book with 45 calming designs across 92 pages, for relaxation and quiet creative time.",
    description:
      "A generous A4 colouring book made for adults who want a quiet, creative way to unwind. Inside are 45 detailed designs across 92 single sided pages, giving plenty of room for stress relief and mindfulness without a screen in sight. A thoughtful choice for anyone wanting a calm activity at the end of the day, or a gift for someone who could use a little quiet time.",
    features: [
      "A4 size, 92 pages",
      "45 detailed designs",
      "Single-sided pages so colour never bleeds through",
      "Perfect (glued) binding for a book that lies flatter as you colour",
      "Suited to coloured pencils and fine markers",
    ],
  },
  {
    slug: "little-hands-big-faith-old-testament-bible-colouring-book",
    shortDescription: "An A4 Bible colouring book with 30 Old Testament stories to read, write, pray and colour. Ages 6 to 10.",
    description:
      "From Noah's Ark to David and Goliath, this A4 colouring book introduces children aged 6 to 10 to 30 well loved Old Testament stories. Each story invites your child to read, write, pray and colour, making it a meaningful choice for Sunday school, family devotion time or quiet time at home.",
    features: [
      "A4 size, 66 pages",
      "30 Old Testament stories",
      "Read, write, pray and colour on every page",
      "Saddle-stitched (stapled) binding",
      "Great for Sunday school and family devotions",
    ],
    ageRange: "6-10 years",
  },
  {
    slug: "little-hands-big-faith-new-testament-bible-colouring-book",
    shortDescription: "An A4 Bible colouring book with 30 New Testament stories to read, write, pray and colour. Ages 6 to 10.",
    description:
      "A gentle introduction to the New Testament for children aged 6 to 10, from the Nativity to the parables of Jesus. This A4 colouring book covers 30 New Testament stories, each inviting your child to read, write, pray and colour. A companion to our Old Testament title, with the same warm illustration style, ideal for Sunday school or family devotion time.",
    features: [
      "A4 size, 66 pages",
      "30 New Testament stories",
      "Read, write, pray and colour on every page",
      "Saddle-stitched (stapled) binding",
      "Companion to the Old Testament colouring book",
    ],
    ageRange: "6-10 years",
  },
];

function parseArgs() {
  const apply = process.argv.includes("--apply");
  return { apply };
}

function featuresEqual(a: unknown, b: string[]): boolean {
  if (!Array.isArray(a)) return false;
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

async function main() {
  const { apply } = parseArgs();

  console.log(`Product content sync — mode: ${apply ? "APPLY (will write to database)" : "DRY RUN (no writes)"}`);
  console.log(`Products in scope: ${UPDATES.length}`);
  console.log("Allowed fields:", ALLOWED_FIELDS.join(", "));
  console.log("");

  let foundCount = 0;
  let missingCount = 0;
  let changedCount = 0;
  let unchangedCount = 0;
  let appliedCount = 0;
  let failedCount = 0;

  for (const update of UPDATES) {
    let existing;
    try {
      existing = await prisma.product.findUnique({
        where: { slug: update.slug },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          shortDescription: true,
          features: true,
          ageRange: true,
          // Selected only to prove to the operator these are untouched —
          // never included in any update() call below.
          price: true,
          stockQuantity: true,
          ratingAverage: true,
          reviewCount: true,
          sku: true,
        },
      });
    } catch (error) {
      // Database connection missing/unreachable — fail safely, no secrets in the message.
      console.error(`Database connection failed while looking up "${update.slug}". Aborting — no changes were made.`);
      console.error(error instanceof Error ? error.message : "Unknown error");
      process.exitCode = 1;
      await prisma.$disconnect();
      return;
    }

    if (!existing) {
      console.log(`[NOT FOUND] slug="${update.slug}" — skipped, no product exists with this slug. No action taken.`);
      missingCount += 1;
      continue;
    }

    foundCount += 1;

    const fieldChanges: string[] = [];
    if (existing.description !== update.description) fieldChanges.push("description");
    if (existing.shortDescription !== update.shortDescription) fieldChanges.push("shortDescription");
    if (!featuresEqual(existing.features, update.features)) fieldChanges.push("features");
    if (update.ageRange !== undefined && existing.ageRange !== update.ageRange) fieldChanges.push("ageRange");

    console.log(`--- ${existing.name} (slug="${existing.slug}", sku=${existing.sku ?? "n/a"}) ---`);
    console.log(`  price=${existing.price} stockQuantity=${existing.stockQuantity} ratingAverage=${existing.ratingAverage} reviewCount=${existing.reviewCount} (untouched by this script)`);

    if (fieldChanges.length === 0) {
      console.log("  No change: all allowed fields already match the target text. Nothing to do.");
      unchangedCount += 1;
      console.log("");
      continue;
    }

    changedCount += 1;
    console.log(`  Fields that would change: ${fieldChanges.join(", ")}`);
    if (fieldChanges.includes("shortDescription")) {
      console.log(`    shortDescription (old): ${existing.shortDescription}`);
      console.log(`    shortDescription (new): ${update.shortDescription}`);
    }
    if (fieldChanges.includes("description")) {
      console.log(`    description (old): ${existing.description}`);
      console.log(`    description (new): ${update.description}`);
    }
    if (fieldChanges.includes("features")) {
      console.log(`    features (old): ${JSON.stringify(existing.features)}`);
      console.log(`    features (new): ${JSON.stringify(update.features)}`);
    }
    if (fieldChanges.includes("ageRange")) {
      console.log(`    ageRange (old): ${existing.ageRange}`);
      console.log(`    ageRange (new): ${update.ageRange}`);
    }

    if (apply) {
      try {
        // Narrow, explicit data object — only ever these four keys, so a
        // forbidden field can never be included even by future editing
        // mistakes elsewhere in this file.
        const data: {
          description?: string;
          shortDescription?: string;
          features?: string[];
          ageRange?: string;
        } = {};
        if (fieldChanges.includes("description")) data.description = update.description;
        if (fieldChanges.includes("shortDescription")) data.shortDescription = update.shortDescription;
        if (fieldChanges.includes("features")) data.features = update.features;
        if (fieldChanges.includes("ageRange") && update.ageRange !== undefined) data.ageRange = update.ageRange;

        await prisma.product.update({ where: { slug: update.slug }, data });
        console.log(`  APPLIED: updated ${fieldChanges.join(", ")} for "${update.slug}".`);
        appliedCount += 1;
      } catch (error) {
        console.error(`  FAILED to update "${update.slug}" — skipped, no partial write assumed for this product.`);
        console.error("  " + (error instanceof Error ? error.message : "Unknown error"));
        failedCount += 1;
      }
    }

    console.log("");
  }

  console.log("=== Summary ===");
  console.log(`Products found: ${foundCount}/${UPDATES.length}`);
  console.log(`Products not found: ${missingCount}`);
  console.log(`Products with changes pending: ${changedCount}`);
  console.log(`Products already up to date: ${unchangedCount}`);
  if (apply) {
    console.log(`Products updated: ${appliedCount}`);
    console.log(`Products failed: ${failedCount}`);
  } else {
    console.log("No database writes were made (dry run). Re-run with --apply to write these changes.");
  }
  console.log("Forbidden fields (price, stockQuantity, ratingAverage, reviewCount, images, slug, sku, category) were never included in any update payload.");

  await prisma.$disconnect();
  if (failedCount > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error("Script failed unexpectedly. No further changes were attempted.");
  console.error(error instanceof Error ? error.message : "Unknown error");
  await prisma.$disconnect();
  process.exitCode = 1;
});
