// Content Studio Phase 2: seeds the Brand Knowledge Foundation with
// genuine, evidenced starter data only — no AI-generated content, no
// invented facts (brief section 30). Every row below cites the exact
// real source it came from: an existing page, existing product data,
// or the Phase 2 brief's own owner-approved rules. Invoked manually
// (`npm run seed:content-studio`), never automatically — same
// discipline as prisma/seed.ts.
//
// Safe to re-run: every entry is looked up by its exact title (Brand
// Knowledge) or name (pillars/audiences) first; an existing row is
// left untouched rather than duplicated. This never overwrites an
// admin's own edits to a previously-seeded row.

import { PrismaClient, BrandKnowledgeCategory, BrandKnowledgeSourceType } from "@prisma/client";

const prisma = new PrismaClient();

const BRIEF_REFERENCE = "Seasonedz AI Content Studio Phase 2 brief (2026-08-29)";

// ---------------------------------------------------------------------------
// Content Pillars — confirmed from real, already-published blog content
// (src/data/blogPosts.js). Phase 1's own audit found these five; this
// seed does not add any beyond them without their own evidence (brief
// section 15). Two well-evidenced but not-yet-content-pillar
// candidates are documented in CONTENT_STUDIO_ARCHITECTURE.md as
// "recommended for future consideration", not seeded here.
// ---------------------------------------------------------------------------

const pillarSeeds = [
  { name: "Educational Colouring", description: "Colouring as a tool for early childhood learning and development.", sortOrder: 0 },
  { name: "Bible Learning", description: "Bible colouring books used for faith-based learning, including Sunday school.", sortOrder: 1 },
  { name: "Mindfulness", description: "Colouring as a calming, therapeutic activity for teens and adults.", sortOrder: 2 },
  { name: "School Creativity", description: "Bringing creative, hands-on activities into the classroom.", sortOrder: 3 },
  { name: "Product Tips", description: "Practical guidance on choosing and using Seasonedz products, e.g. markers and crayons.", sortOrder: 4 },
  // Content Studio Phase 3A, section 5: Phase 2 found evidence for these
  // two but deliberately left them unseeded pending this review. Both
  // are confirmed against src/pages/schools.js, a real, currently
  // published page, not invented for this phase.
  {
    name: "Schools and Bulk Buying",
    description: "Bulk orders, ready-made school packs and wholesale buying for schools and organisations.",
    sortOrder: 5,
  },
  {
    name: "Faith and Church Life",
    description: "Faith-based creativity for church groups and Sunday school programmes, broader than Bible colouring books alone.",
    sortOrder: 6,
  },
];

// ---------------------------------------------------------------------------
// Audiences — every one of the seven candidates the Phase 2 brief
// itself listed, each confirmed against real, currently-published
// website content (src/pages/schools.js, src/pages/about.js,
// src/data/categories.js) rather than seeded on assumption alone.
// ---------------------------------------------------------------------------

const audienceSeeds = [
  {
    name: "Parents",
    description: "Parents buying for their own children, at home rather than for a school or church.",
    painPoints: "Wants a screen-free activity that still feels worthwhile, not just a way to pass time.",
    motivations: "About page: 'For a child, it can make learning more enjoyable.'",
    preferredContent: null,
  },
  {
    name: "Teachers",
    description: "Individual teachers sourcing creative classroom activities.",
    painPoints: "Limited classroom budget and prep time for creative, hands-on lessons.",
    motivations: "schools.js confirms 'Individual teachers and classrooms' as a served audience; blog post 'Bringing Creativity Into Your Classroom'.",
    preferredContent: null,
  },
  {
    name: "Schools",
    description: "Preschools, primary schools, aftercare and tutoring centres buying in bulk.",
    painPoints: "Needs a consistent, ready-made supply for a whole class or centre, not single retail units.",
    motivations: "schools.js: 'Seasonedz Group for Schools', listing preschools, primary schools, aftercare centres and tutoring centres by name; product category 'Schools and Wholesale'.",
    preferredContent: null,
  },
  {
    name: "Churches",
    description: "Church groups and Sunday school programmes.",
    painPoints: "Needs age-appropriate, faith-based material for group settings, not just individual sale items.",
    motivations: "schools.js explicitly lists 'Church groups and Sunday school programmes'; blog post 'Using Bible Colouring Books in Sunday School'.",
    preferredContent: null,
  },
  {
    name: "Families",
    description: "Buying for shared, multi-person family time rather than one individual.",
    painPoints: null,
    motivations: "About page: 'For a family, it can encourage meaningful time together.'",
    preferredContent: null,
  },
  {
    name: "Adult Colouring and Mindfulness Customers",
    description: "Adults buying for their own relaxation and mindfulness practice, not for a child.",
    painPoints: null,
    motivations: "About page: 'For an adult, it can create a quiet moment to slow down and focus.' Product category and blog pillar: Mindfulness Colouring.",
    preferredContent: null,
  },
  {
    name: "Business and Bulk Buyers",
    description: "Kids programmes, holiday clubs and other organisations buying in volume, outside a formal school/church relationship.",
    painPoints: null,
    motivations: "schools.js: 'Bulk Orders for Schools', 'Ready-Made School Packs', and 'Kids programmes and holiday clubs' listed among who Seasonedz works with.",
    preferredContent: null,
  },
];

// ---------------------------------------------------------------------------
// Owner-approved writing rules — the Phase 2 brief's own section 11,
// split into separately retrievable entries rather than one giant
// block (brief's own explicit instruction).
// ---------------------------------------------------------------------------

const writingRuleSeeds = [
  {
    title: "Write in simple, natural South African English",
    body: "Use simple English and a natural, warm, professional and practical voice. Write like a real South African small business, not a large impersonal brand.",
    tags: ["voice", "tone"],
  },
  {
    title: "Use South African/British spelling, not American spelling",
    body: 'Always use "colouring", never "coloring", and the same British/SA spelling convention throughout every other word.',
    tags: ["spelling"],
  },
  {
    title: "Avoid unnecessary dash punctuation in customer-facing copy",
    body: "Do not use decorative em dashes, en dashes as sentence punctuation, or other decorative separators. Prefer full stops and commas. This is the same rule already enforced across the website and emails (Milestone 177).",
    tags: ["punctuation"],
  },
  {
    title: "Avoid emojis unless specifically requested",
    body: "Do not add emojis to marketing copy by default.",
    tags: ["formatting"],
  },
  {
    title: "Avoid robotic, over-polished or dramatic marketing language",
    body: "Avoid language that reads as generated, overly polished, or dramatic. Avoid unsupported dramatic claims.",
    tags: ["tone"],
  },
  {
    title: "Never promise more than the product or business can support",
    body: "Do not make promises the product or business cannot genuinely support (delivery timing, outcomes, availability).",
    tags: ["claims"],
  },
  {
    title: "Use keywords naturally, never stuffed",
    body: "Work relevant keywords into copy naturally, as a real sentence would use them, not as a stuffed list.",
    tags: ["seo"],
  },
  {
    title: "Product copy must say who it is for, what it contains, and why it is useful",
    body: "Every piece of product copy should clearly communicate who the product is for, what it contains, and why it is useful.",
    tags: ["product-copy"],
  },
];

// ---------------------------------------------------------------------------
// Owner-approved visual rules — brief section 12.
// ---------------------------------------------------------------------------

const visualRuleSeeds = [
  {
    title: "Andika is the preferred marketing font",
    body: "Andika is the preferred font for Seasonedz marketing designs, unless another font is specifically required for a particular piece.",
    tags: ["typography"],
  },
  {
    title: "Keep layouts clean, spacious and uncluttered",
    body: "Use enough empty space. Keep important text within safe margins. Avoid unnecessarily crowded scenes.",
    tags: ["layout"],
  },
  {
    title: "Prefer realistic lighting and natural shadows",
    body: "Visual content should use realistic lighting and natural shadows rather than an artificial or stylised look.",
    tags: ["lighting"],
  },
  {
    title: "Always use the real Seasonedz logo, unmodified",
    body: "Use the real Seasonedz logo. Never redraw, distort, decorate, replace or invent the logo.",
    tags: ["logo", "brand-identity"],
  },
  {
    title: "Real products must use genuine source imagery",
    body: "When a real Seasonedz product is represented, use genuine product source imagery. Never invent book covers, pages, logos, packaging or product details, and never digitally alter a genuine product in a way that misrepresents it.",
    tags: ["product-accuracy"],
  },
];

// ---------------------------------------------------------------------------
// Approved claims — each tied to a real, currently-published, checkable
// fact (brief section 13: "populate only claims supported by existing
// website content, real product records, existing policies").
// ---------------------------------------------------------------------------

const approvedClaimSeeds = [
  {
    title: "Seasonedz Group is a registered South African company",
    body: "Seasonedz Group (SEASONEDZ GROUP, registration 2024/618215/07) is a registered Private Company based in Pretoria, South Africa.",
    tags: ["company-identity"],
    sourceType: BrandKnowledgeSourceType.POLICY,
    sourceReference: "Terms and Conditions / Privacy Policy 'Who We Are' section, src/data/businessInfo.js",
  },
  {
    title: "Free delivery is available on qualifying orders",
    body: "Seasonedz Group offers free delivery on orders of R600 or more. Always check the current threshold on the live site before repeating this figure, since it can change.",
    tags: ["delivery"],
    sourceType: BrandKnowledgeSourceType.WEBSITE,
    sourceReference: "Checkout and product delivery copy",
  },
  {
    title: "Delivery is via Courier Guy, with Customer Collection available",
    body: "Seasonedz Group ships nationally via Courier Guy, with Customer Collection also available in Pretoria and Thohoyandou.",
    tags: ["delivery"],
    sourceType: BrandKnowledgeSourceType.WEBSITE,
    sourceReference: "Checkout delivery method options",
  },
  {
    title: "Seasonedz Group runs a real Affiliate Programme",
    body: "Seasonedz Group has a real, currently-operating Affiliate Programme with genuine commission and referral discount rates.",
    tags: ["affiliate"],
    sourceType: BrandKnowledgeSourceType.POLICY,
    sourceReference: "Affiliate Terms page",
  },
];

// ---------------------------------------------------------------------------
// Prohibited claims — brief section 13's own explicit list.
// ---------------------------------------------------------------------------

const prohibitedClaimSeeds = [
  {
    title: "Never invent awards, ratings or certifications",
    body: "Do not state or imply an award, rating or certification the business has not actually received.",
    tags: ["awards", "certifications"],
  },
  {
    title: "Never invent guarantees the business cannot support",
    body: "Do not invent medical benefit claims, educational outcome guarantees, or delivery-time guarantees beyond what is actually offered.",
    tags: ["guarantees"],
  },
  {
    title: "Never invent customer numbers, scarcity, testimonials or partnerships",
    body: "Do not invent customer counts, stock scarcity ('almost sold out'), testimonials, or business partnerships that are not real.",
    tags: ["social-proof"],
  },
];

async function upsertPillar(seed: (typeof pillarSeeds)[number]) {
  const existing = await prisma.contentPillar.findUnique({ where: { name: seed.name } });
  if (existing) {
    console.log(`[seed:content-studio] pillar "${seed.name}" already exists, left untouched`);
    return;
  }
  await prisma.contentPillar.create({ data: { ...seed, isActive: true } });
  console.log(`[seed:content-studio] created pillar "${seed.name}"`);
}

async function upsertAudience(seed: (typeof audienceSeeds)[number]) {
  const existing = await prisma.audience.findUnique({ where: { name: seed.name } });
  if (existing) {
    console.log(`[seed:content-studio] audience "${seed.name}" already exists, left untouched`);
    return;
  }
  await prisma.audience.create({ data: { ...seed, isActive: true } });
  console.log(`[seed:content-studio] created audience "${seed.name}"`);
}

async function upsertKnowledgeEntry(
  seed: { title: string; body: string; tags: string[]; sourceType?: BrandKnowledgeSourceType; sourceReference?: string },
  category: BrandKnowledgeCategory
) {
  const existing = await prisma.brandKnowledgeEntry.findFirst({ where: { title: seed.title, category } });
  if (existing) {
    console.log(`[seed:content-studio] entry "${seed.title}" already exists, left untouched`);
    return;
  }
  await prisma.brandKnowledgeEntry.create({
    data: {
      category,
      title: seed.title,
      body: seed.body,
      tags: seed.tags,
      isActive: true,
      priority: 0,
      sourceType: seed.sourceType ?? BrandKnowledgeSourceType.OWNER_APPROVED,
      sourceReference: seed.sourceReference ?? BRIEF_REFERENCE,
    },
  });
  console.log(`[seed:content-studio] created entry "${seed.title}" (${category})`);
}

async function main() {
  for (const seed of pillarSeeds) await upsertPillar(seed);
  for (const seed of audienceSeeds) await upsertAudience(seed);
  for (const seed of writingRuleSeeds) await upsertKnowledgeEntry(seed, BrandKnowledgeCategory.WRITING_RULE);
  for (const seed of visualRuleSeeds) await upsertKnowledgeEntry(seed, BrandKnowledgeCategory.VISUAL_RULE);
  for (const seed of approvedClaimSeeds) await upsertKnowledgeEntry(seed, BrandKnowledgeCategory.APPROVED_CLAIM);
  for (const seed of prohibitedClaimSeeds) await upsertKnowledgeEntry(seed, BrandKnowledgeCategory.PROHIBITED_CLAIM);

  console.log("[seed:content-studio] done.");
}

main()
  .catch((error) => {
    console.error("[seed:content-studio] failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
