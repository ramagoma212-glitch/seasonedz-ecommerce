// Milestone 182, Part N: buildZeelyCampaignBriefText() is a pure
// function — no Prisma, no network, no AI provider call anywhere in
// its import chain. Every test here just asserts on the returned
// string.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildZeelyCampaignBriefText, type ZeelyBriefCampaignInput } from "./zeelyBriefText.service.js";
import type { ContentContext } from "./contentContext.service.js";

function baseContext(overrides: Partial<ContentContext> = {}): ContentContext {
  return {
    purpose: "zeely-campaign-brief",
    platforms: ["INSTAGRAM"],
    product: {
      id: "prod-1",
      name: "Old Testament Bible Colouring Book",
      slug: "old-testament-bible-colouring-book",
      sku: "SG-002",
      description: "A calming colouring book for kids.",
      shortDescription: "For quiet family time.",
      price: 120,
      stockQuantity: 100,
      isInStock: true,
      status: "ACTIVE",
      images: ["https://example.com/a.jpg"],
      isActivePreorder: false,
      isPreorderDiscountEligible: false,
      preorderReleaseAt: null,
    },
    audience: { id: "aud-1", name: "Churches", description: "Church groups.", painPoints: null, motivations: "Faith-based learning.", preferredContent: null },
    pillar: { id: "pillar-1", name: "Bible Learning", description: "Faith-based learning content." },
    brandVoice: {
      writingRules: ['Use "colouring", not "coloring".'],
      visualRules: ["Use the real product photo only."],
      approvedClaims: ["Screen-free creative time."],
      prohibitedClaims: ["Never claim a medical benefit."],
      callToActionRules: ["Shop now at Seasonedz Group."],
      platformRules: ["Keep Instagram captions under 150 characters."],
      brandFacts: ["Seasonedz Group is a South African creative products business."],
      terminology: [],
    },
    ...overrides,
  };
}

function baseInput(overrides: Partial<ZeelyBriefCampaignInput> = {}): ZeelyBriefCampaignInput {
  return {
    goal: "AWARENESS",
    platforms: ["INSTAGRAM"],
    campaignType: null,
    contentQuantity: null,
    campaignStartAt: null,
    campaignEndAt: null,
    callToAction: null,
    additionalInstructions: null,
    ...overrides,
  };
}

test("includes real product name and price, never an invented one", () => {
  const text = buildZeelyCampaignBriefText(baseContext(), baseInput(), null);
  assert.ok(text.includes("Old Testament Bible Colouring Book"));
  assert.ok(text.includes("R120.00"));
});

test("includes the selected audience and pillar", () => {
  const text = buildZeelyCampaignBriefText(baseContext(), baseInput(), null);
  assert.ok(text.includes("Churches"));
  assert.ok(text.includes("Bible Learning"));
});

test("includes approved claims and prohibited claims from Brand Knowledge, never invents its own", () => {
  const text = buildZeelyCampaignBriefText(baseContext(), baseInput(), null);
  assert.ok(text.includes("Screen-free creative time."));
  assert.ok(text.includes("Never claim a medical benefit."));
});

test("includes writing rules and visual rules verbatim from stored Brand Knowledge", () => {
  const text = buildZeelyCampaignBriefText(baseContext(), baseInput(), null);
  assert.ok(text.includes('Use "colouring", not "coloring".'));
  assert.ok(text.includes("Use the real product photo only."));
});

test("a non-preorder product never mentions preorder or a release date", () => {
  const text = buildZeelyCampaignBriefText(baseContext(), baseInput(), null);
  assert.ok(!text.toLowerCase().includes("preorder"));
});

test("an active preorder product states 'Available from' the real release date, never a promised delivery date", () => {
  const context = baseContext({
    product: {
      ...baseContext().product!,
      isActivePreorder: true,
      preorderReleaseAt: new Date("2026-09-29T22:00:00.000Z"), // 30 Sep 2026 00:00 SAST
    },
  });
  const text = buildZeelyCampaignBriefText(context, baseInput({ goal: "PREORDER" }), null);
  assert.ok(text.includes("PREORDER"));
  assert.ok(text.includes("Available from 30 September 2026"));
  assert.ok(!text.toLowerCase().includes("delivery on 30 september"));
  // The brief explicitly WARNS against claiming guaranteed delivery
  // (an instruction to whoever uses this brief in Zeely) — it must
  // never itself make that claim as a promise.
  assert.ok(!text.toLowerCase().includes("we guarantee delivery"));
  assert.ok(text.toLowerCase().includes("do not claim guaranteed delivery"));
});

test("a preorder-discount-eligible product states the real live discount percentage, never a hardcoded one", () => {
  const context = baseContext({
    product: {
      ...baseContext().product!,
      isActivePreorder: true,
      isPreorderDiscountEligible: true,
      preorderReleaseAt: new Date("2026-09-29T22:00:00.000Z"),
    },
  });
  const text = buildZeelyCampaignBriefText(context, baseInput({ goal: "PREORDER" }), 10);
  assert.ok(text.includes("10% off their first qualifying preorder"));
});

test("a discount-eligible product never mentions the discount when the programme is disabled (percent passed as null)", () => {
  const context = baseContext({
    product: {
      ...baseContext().product!,
      isActivePreorder: true,
      isPreorderDiscountEligible: true,
      preorderReleaseAt: new Date("2026-09-29T22:00:00.000Z"),
    },
  });
  const text = buildZeelyCampaignBriefText(context, baseInput({ goal: "PREORDER" }), null);
  assert.ok(!text.includes("off their first qualifying preorder"));
});

test("an ended preorder (isActivePreorder: false) never mentions preorder, even if the product was once configured for it", () => {
  const context = baseContext({
    product: {
      ...baseContext().product!,
      isActivePreorder: false, // preorder.service.ts already decided the window is over
      isPreorderDiscountEligible: true, // the flag may still be set on the Product row
      preorderReleaseAt: null,
    },
  });
  const text = buildZeelyCampaignBriefText(context, baseInput(), null);
  assert.ok(!text.toLowerCase().includes("preorder"));
});

test("lists every selected platform by its readable label", () => {
  const text = buildZeelyCampaignBriefText(baseContext(), baseInput({ platforms: ["INSTAGRAM", "TIKTOK", "WHATSAPP"] }), null);
  assert.ok(text.includes("Instagram, TikTok, WhatsApp"));
});

test("includes campaign dates when provided, in SAST-formatted display", () => {
  const text = buildZeelyCampaignBriefText(
    baseContext(),
    baseInput({ campaignStartAt: new Date("2026-09-01T00:00:00.000Z"), campaignEndAt: new Date("2026-09-29T21:59:00.000Z") }),
    null
  );
  assert.ok(text.includes("Start: 1 September 2026"));
  assert.ok(text.includes("End: 29 September 2026") || text.includes("End: 30 September 2026"));
});

test("states no specific campaign dates when none are provided, never a fabricated date", () => {
  const text = buildZeelyCampaignBriefText(baseContext(), baseInput(), null);
  assert.ok(text.includes("No specific campaign dates set."));
});

test("includes the admin-entered call to action when provided, falling back to a stored CTA rule otherwise", () => {
  const withCta = buildZeelyCampaignBriefText(baseContext(), baseInput({ callToAction: "Preorder now, link in bio." }), null);
  assert.ok(withCta.includes("Preorder now, link in bio."));

  const withoutCta = buildZeelyCampaignBriefText(baseContext(), baseInput(), null);
  assert.ok(withoutCta.includes("Shop now at Seasonedz Group."));
});

test("includes admin-entered additional instructions verbatim", () => {
  const text = buildZeelyCampaignBriefText(baseContext(), baseInput({ additionalInstructions: "Keep the tone warm and simple." }), null);
  assert.ok(text.includes("Keep the tone warm and simple."));
});

test("no product selected: states so plainly, never invents a product", () => {
  const context = baseContext({ product: null });
  const text = buildZeelyCampaignBriefText(context, baseInput(), null);
  assert.ok(text.includes("No product selected."));
});

test("no audience selected: states so plainly", () => {
  const context = baseContext({ audience: null });
  const text = buildZeelyCampaignBriefText(context, baseInput(), null);
  assert.ok(text.includes("No audience selected."));
});

test("never emits an emoji character", () => {
  const text = buildZeelyCampaignBriefText(baseContext(), baseInput({ additionalInstructions: "Simple and professional." }), 10);
  // A broad emoji-range check — this codebase's own copy discipline
  // never uses emojis in generated customer/admin-facing text.
  // eslint-disable-next-line no-control-regex
  const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.ok(!emojiPattern.test(text));
});
