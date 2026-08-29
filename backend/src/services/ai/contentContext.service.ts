// Content Studio Phase 3A, brief sections 16-18, 21: combines live
// Product facts with Brand Knowledge into one bounded, structured
// context object for a future AI request.
//
// SOURCE OF TRUTH (unchanged from Phase 2): Product is read directly
// here for name/price/stock/images — never taken from a
// BrandKnowledgeEntry, however recent. See schema.prisma's own header
// comment on BrandKnowledgeEntry.
//
// SECURITY BOUNDARY (brief section 21): this file imports exactly four
// Prisma models — product, audience, contentPillar, and (via
// brandKnowledge.service.ts) brandKnowledgeEntry. It never imports
// prisma.customer, prisma.order, prisma.address, prisma.adminSession,
// prisma.affiliateApplicationDocument, or any other table that could
// carry personal data or a secret — see this file's own test for a
// structural assertion of that, not just this comment.

import { prisma } from "../../config/prisma.js";
import { BrandKnowledgeCategory } from "@prisma/client";
import { getKnowledgeContext } from "../brandKnowledge.service.js";

export class ContentContextError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 404
  ) {
    super(message);
    this.name = "ContentContextError";
  }
}

// Brief section 18: bounded, never unbounded. getKnowledgeContext()
// already orders by priority then recency — this is where "at most N"
// is actually enforced.
const MAX_ENTRIES_PER_CATEGORY = 10;

export interface ProductContentContext {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  description: string | null;
  shortDescription: string | null;
  price: number;
  stockQuantity: number;
  isInStock: boolean;
  status: string;
  images: string[];
}

export interface AudienceContentContext {
  id: string;
  name: string;
  description: string | null;
  painPoints: string | null;
  motivations: string | null;
  preferredContent: string | null;
}

export interface PillarContentContext {
  id: string;
  name: string;
  description: string | null;
}

export interface BrandVoiceContext {
  writingRules: string[];
  visualRules: string[];
  approvedClaims: string[];
  prohibitedClaims: string[];
  callToActionRules: string[];
  platformRules: string[];
  brandFacts: string[];
  terminology: string[];
}

export interface ContentContext {
  purpose: string;
  platforms: string[];
  product: ProductContentContext | null;
  audience: AudienceContentContext | null;
  pillar: PillarContentContext | null;
  brandVoice: BrandVoiceContext;
}

// ---------------------------------------------------------------------------
// Reference validators — brief section 10's "never allow the provider
// to invent Product IDs" rule, generalised to audience/pillar too.
// Never trust an id string until it has been checked against a real
// row. Inactive audiences/pillars are rejected the same as a missing
// id — brief section 37's own "inactive pillar/audience rejection"
// test requirement.
// ---------------------------------------------------------------------------

export async function buildProductContentContext(productId: string): Promise<ProductContentContext> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { images: { orderBy: { sortOrder: "asc" } } },
  });
  if (!product) {
    throw new ContentContextError(`No product found with id "${productId}".`, 404);
  }

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    description: product.description,
    shortDescription: product.shortDescription,
    price: Number(product.price),
    stockQuantity: product.stockQuantity,
    isInStock: product.stockQuantity > 0,
    status: product.status,
    // Real, stored image URLs only — never a placeholder or an
    // invented path (brief section 14's own visual-accuracy rule).
    images: product.images.map((image) => image.url),
  };
}

async function buildAudienceContentContext(audienceId: string): Promise<AudienceContentContext> {
  const audience = await prisma.audience.findUnique({ where: { id: audienceId } });
  if (!audience) {
    throw new ContentContextError(`No audience found with id "${audienceId}".`, 404);
  }
  if (!audience.isActive) {
    throw new ContentContextError(`Audience "${audience.name}" is not active.`, 409);
  }
  return {
    id: audience.id,
    name: audience.name,
    description: audience.description,
    painPoints: audience.painPoints,
    motivations: audience.motivations,
    preferredContent: audience.preferredContent,
  };
}

async function buildPillarContentContext(pillarId: string): Promise<PillarContentContext> {
  const pillar = await prisma.contentPillar.findUnique({ where: { id: pillarId } });
  if (!pillar) {
    throw new ContentContextError(`No content pillar found with id "${pillarId}".`, 404);
  }
  if (!pillar.isActive) {
    throw new ContentContextError(`Content pillar "${pillar.name}" is not active.`, 409);
  }
  return { id: pillar.id, name: pillar.name, description: pillar.description };
}

// ---------------------------------------------------------------------------
// Brand voice assembly — one retrieval call, then grouped by category
// and bounded per category (brief section 18).
// ---------------------------------------------------------------------------

const BRAND_VOICE_CATEGORIES: BrandKnowledgeCategory[] = [
  BrandKnowledgeCategory.WRITING_RULE,
  BrandKnowledgeCategory.VISUAL_RULE,
  BrandKnowledgeCategory.APPROVED_CLAIM,
  BrandKnowledgeCategory.PROHIBITED_CLAIM,
  BrandKnowledgeCategory.CALL_TO_ACTION,
  BrandKnowledgeCategory.PLATFORM_RULE,
  BrandKnowledgeCategory.BRAND_FACT,
  BrandKnowledgeCategory.TERMINOLOGY,
];

async function buildBrandVoiceContext(query: { productId?: string; audienceId?: string; pillarId?: string }): Promise<BrandVoiceContext> {
  const entries = await getKnowledgeContext({ ...query, categories: BRAND_VOICE_CATEGORIES });

  function bodiesFor(category: BrandKnowledgeCategory): string[] {
    return entries
      .filter((entry) => entry.category === category)
      .slice(0, MAX_ENTRIES_PER_CATEGORY)
      .map((entry) => entry.body);
  }

  return {
    writingRules: bodiesFor(BrandKnowledgeCategory.WRITING_RULE),
    visualRules: bodiesFor(BrandKnowledgeCategory.VISUAL_RULE),
    approvedClaims: bodiesFor(BrandKnowledgeCategory.APPROVED_CLAIM),
    prohibitedClaims: bodiesFor(BrandKnowledgeCategory.PROHIBITED_CLAIM),
    callToActionRules: bodiesFor(BrandKnowledgeCategory.CALL_TO_ACTION),
    platformRules: bodiesFor(BrandKnowledgeCategory.PLATFORM_RULE),
    brandFacts: bodiesFor(BrandKnowledgeCategory.BRAND_FACT),
    terminology: bodiesFor(BrandKnowledgeCategory.TERMINOLOGY),
  };
}

// ---------------------------------------------------------------------------
// The one function future generation services (and the admin context
// preview) call.
// ---------------------------------------------------------------------------

export interface BuildContentContextInput {
  productId?: string;
  audienceId?: string;
  pillarId?: string;
  purpose: string;
  platforms?: string[];
}

export async function buildContentContext(input: BuildContentContextInput): Promise<ContentContext> {
  const [product, audience, pillar] = await Promise.all([
    input.productId ? buildProductContentContext(input.productId) : Promise.resolve(null),
    input.audienceId ? buildAudienceContentContext(input.audienceId) : Promise.resolve(null),
    input.pillarId ? buildPillarContentContext(input.pillarId) : Promise.resolve(null),
  ]);

  const brandVoice = await buildBrandVoiceContext({
    productId: input.productId,
    audienceId: input.audienceId,
    pillarId: input.pillarId,
  });

  return {
    purpose: input.purpose,
    platforms: input.platforms ?? [],
    product,
    audience,
    pillar,
    brandVoice,
  };
}
