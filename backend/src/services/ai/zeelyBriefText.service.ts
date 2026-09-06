// Milestone 182, Part E: builds the actual ZEELY CAMPAIGN BRIEF text —
// a plain, structured document ready to paste into Zeely. Purely
// deterministic template assembly from a ContentContext (Product +
// Audience + Pillar + Brand Voice, already retrieved by
// buildContentContext() — Content Studio Phase 3A) plus the campaign
// fields the admin/staff member chose. NO AIProvider call happens
// anywhere in this file — this is not "AI generation" in the Phase 3A
// pipeline sense, it is a document template filled from real data, the
// same way an invoice or an order confirmation email is built
// elsewhere in this codebase. No Anthropic/Gemini/Veo import exists
// here or anywhere this file's import chain reaches.
//
// TRUST BOUNDARY: every fact in the output ("Important Product Facts",
// prices, preorder dates, approved/prohibited claims) comes directly
// from ContentContext, which itself only ever reads real Product rows
// and real BrandKnowledgeEntry rows — nothing here invents a price,
// page count, ISBN, stock figure, release date, review, award or sales
// number. Where a fact is simply absent (e.g. no audience selected),
// the brief says so plainly rather than inventing one.

import type { ContentContext } from "./contentContext.service.js";
import { formatSastDate } from "../../utils/southAfricaTime.js";

export interface ZeelyBriefCampaignInput {
  goal: string;
  platforms: string[];
  campaignType: string | null;
  contentQuantity: number | null;
  campaignStartAt: Date | null;
  campaignEndAt: Date | null;
  callToAction: string | null;
  additionalInstructions: string | null;
}

// Owner-approved copy discipline (brief Part "SEASONEDZ BRAND RULES"):
// simple professional English, "colouring" not "coloring", no emojis,
// no unnecessary dashes, no invented claims/scarcity/reviews/sales
// numbers/specifications. This module's own literal strings follow the
// same rule the stored Brand Knowledge enforces for everything else.
const GOAL_LABELS: Record<string, string> = {
  AWARENESS: "Awareness",
  PREORDER: "Preorder",
  PRODUCT_LAUNCH: "Product Launch",
  SALES: "Sales",
  EDUCATION: "Education",
  ENGAGEMENT: "Engagement",
  CUSTOMER_FEEDBACK: "Customer Feedback",
  FAITH_BASED_EDUCATION: "Faith Based Education",
  SCHOOL_OUTREACH: "School Outreach",
  CHURCH_OUTREACH: "Church Outreach",
  BULK_BUYING: "Bulk Buying",
};

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  WHATSAPP: "WhatsApp",
  X: "X",
  LINKEDIN: "LinkedIn",
  REDDIT: "Reddit",
};

function section(title: string, bodyLines: string[]): string {
  const body = bodyLines.length > 0 ? bodyLines.join("\n") : "None on file.";
  return `${title.toUpperCase()}\n${body}`;
}

function bulletList(items: string[]): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ["None on file."];
}

function formatRand(amount: number): string {
  return `R${amount.toFixed(2)}`;
}

// Part K: never a hardcoded date or a static claim — always derived
// from the ContentContext's own already-computed isActivePreorder/
// preorderReleaseAt (contentContext.service.ts, itself re-derived from
// preorder.service.ts's isActivePreorder() every time this runs). Once
// the configured preorder window ends, product.isActivePreorder simply
// becomes false and this function stops mentioning preorder at all —
// no separate "is preorder still on" check exists in this file.
function buildProductFactsLines(product: ContentContext["product"], preorderDiscountPercent: number | null): string[] {
  if (!product) return ["No product selected."];

  const lines = [
    `Name: ${product.name}`,
    `Price: ${formatRand(product.price)}`,
    `Product type: ${product.status === "ACTIVE" ? "Currently available for sale" : product.status}`,
  ];

  if (product.shortDescription) {
    lines.push(`Short description: ${product.shortDescription}`);
  }

  if (product.isActivePreorder) {
    const releaseLine = product.preorderReleaseAt
      ? `This product is currently a PREORDER. Available from ${formatSastDate(product.preorderReleaseAt)}. Do not claim guaranteed delivery on release day; delivery is arranged after dispatch.`
      : "This product is currently a PREORDER.";
    lines.push(releaseLine);
    if (product.isPreorderDiscountEligible && preorderDiscountPercent) {
      lines.push(`Registered customers get ${preorderDiscountPercent}% off their first qualifying preorder when signed in at checkout.`);
    }
  } else {
    lines.push(`Stock: ${product.isInStock ? "In stock" : "Currently out of stock"}.`);
  }

  return lines;
}

function buildKeyMessage(context: ContentContext, input: ZeelyBriefCampaignInput): string {
  const product = context.product?.name ?? "this product";
  const audience = context.audience?.name ?? "our customers";
  const goalLabel = GOAL_LABELS[input.goal] ?? input.goal;

  if (context.product?.isActivePreorder) {
    return `${product} is available to preorder now for ${audience.toLowerCase()}, with delivery once released.`;
  }
  return `${product} is a good fit for ${audience.toLowerCase()}, aligned with a ${goalLabel.toLowerCase()} goal.`;
}

function buildDatesLines(input: ZeelyBriefCampaignInput): string[] {
  const lines: string[] = [];
  if (input.campaignStartAt) lines.push(`Start: ${formatSastDate(input.campaignStartAt)}`);
  if (input.campaignEndAt) lines.push(`End: ${formatSastDate(input.campaignEndAt)}`);
  return lines.length > 0 ? lines : ["No specific campaign dates set."];
}

function buildContentRequestedLines(input: ZeelyBriefCampaignInput): string[] {
  const lines: string[] = [];
  if (input.campaignType) lines.push(`Content type: ${input.campaignType}`);
  if (input.contentQuantity) lines.push(`Quantity requested: ${input.contentQuantity}`);
  return lines.length > 0 ? lines : ["Not specified. Use judgement based on the platforms and goal above."];
}

export function buildZeelyCampaignBriefText(context: ContentContext, input: ZeelyBriefCampaignInput, preorderDiscountPercent: number | null): string {
  const goalLabel = GOAL_LABELS[input.goal] ?? input.goal;
  const platformLabels = input.platforms.map((platform) => PLATFORM_LABELS[platform] ?? platform);

  const parts = [
    "ZEELY CAMPAIGN BRIEF",
    "Prepared by Seasonedz Group. For use inside Zeely. Not a finished caption or asset.",
    "",
    section("Campaign Objective", [`Goal: ${goalLabel}.`]),
    "",
    section("Product Information", buildProductFactsLines(context.product, preorderDiscountPercent)),
    "",
    section(
      "Target Audience",
      context.audience
        ? [
            `Name: ${context.audience.name}`,
            ...(context.audience.description ? [`Description: ${context.audience.description}`] : []),
            ...(context.audience.painPoints ? [`Pain points: ${context.audience.painPoints}`] : []),
            ...(context.audience.motivations ? [`Motivations: ${context.audience.motivations}`] : []),
            ...(context.audience.preferredContent ? [`Preferred content: ${context.audience.preferredContent}`] : []),
          ]
        : ["No audience selected."]
    ),
    "",
    section("Content Pillar", [context.pillar ? `${context.pillar.name}${context.pillar.description ? `. ${context.pillar.description}` : ""}` : "No content pillar selected."]),
    "",
    section("Key Message", [buildKeyMessage(context, input)]),
    "",
    section("Approved Claims", bulletList(context.brandVoice.approvedClaims)),
    "",
    section("Claims to Avoid", bulletList(context.brandVoice.prohibitedClaims)),
    "",
    section("Brand Voice", bulletList(context.brandVoice.brandFacts)),
    "",
    section("Writing Rules", bulletList(context.brandVoice.writingRules)),
    "",
    section("Visual Direction", bulletList(context.brandVoice.visualRules)),
    "",
    section(
      "Platform Requirements",
      platformLabels.length > 0
        ? [`Platforms: ${platformLabels.join(", ")}.`, ...bulletList(context.brandVoice.platformRules)]
        : ["No platform selected."]
    ),
    "",
    section("Call To Action", [input.callToAction || (context.brandVoice.callToActionRules[0] ?? "Shop now at Seasonedz Group.")]),
    "",
    section("Campaign Dates", buildDatesLines(input)),
    "",
    section("Content Requested", buildContentRequestedLines(input)),
    "",
    section("Additional Instructions", [input.additionalInstructions || "None provided."]),
    "",
    "This brief was assembled from Seasonedz product data and stored brand knowledge. It does not replace a final review before content is created or published.",
  ];

  return parts.join("\n");
}
