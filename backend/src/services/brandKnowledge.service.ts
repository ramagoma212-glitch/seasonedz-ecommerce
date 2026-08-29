// Content Studio Phase 2: Brand Knowledge Foundation — admin
// management plus the deterministic retrieval boundary a future
// Phase 3 content-generation service will call.
//
// SOURCE OF TRUTH: see BrandKnowledgeEntry's own header comment in
// schema.prisma. This service never reads or writes a Product's name,
// price, stock or images — relatedProductId only ever links guidance
// ABOUT a product, never duplicates the product's own transactional
// fields. Nothing here fabricates a fact; every write is an admin's
// own explicit input.
//
// getKnowledgeContext()/getKnowledgeByTags() are the retrieval surface
// brief section 23/24 describe: deterministic, database-only, no
// vector search, no AI call, no assembly into a prompt string. Turning
// these structured records into an actual Claude prompt is Phase 3's
// job, not this one's.

import { Prisma, BrandKnowledgeCategory, BrandKnowledgeSourceType } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import sanitizeHtml from "sanitize-html";

export class BrandKnowledgeError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "BrandKnowledgeError";
    this.statusCode = statusCode;
  }
}

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 4000;
const MAX_TAG_LENGTH = 40;
const MAX_TAGS = 15;
const MAX_SOURCE_REFERENCE_LENGTH = 300;

// Brand Knowledge is plain text by design, same reasoning as
// AffiliateProduct's own free-text fields (see
// adminAffiliateProduct.service.ts) — nothing here is ever meant to
// carry HTML formatting, so every string field strips all tags rather
// than allowing a restricted subset.
function stripHtml(raw: string): string {
  return sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} }).trim();
}

function requireTrimmedString(raw: unknown, fieldName: string, maxLength: number): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new BrandKnowledgeError(`${fieldName} is required.`);
  }
  const cleaned = stripHtml(raw);
  if (cleaned.length === 0) {
    throw new BrandKnowledgeError(`${fieldName} is required.`);
  }
  if (cleaned.length > maxLength) {
    throw new BrandKnowledgeError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return cleaned;
}

function optionalTrimmedString(raw: unknown, fieldName: string, maxLength: number): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    throw new BrandKnowledgeError(`${fieldName} must be a string.`);
  }
  const cleaned = stripHtml(raw);
  if (cleaned.length > maxLength) {
    throw new BrandKnowledgeError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return cleaned.length > 0 ? cleaned : null;
}

function requireCategory(raw: unknown): BrandKnowledgeCategory {
  if (typeof raw !== "string" || !(Object.values(BrandKnowledgeCategory) as string[]).includes(raw)) {
    throw new BrandKnowledgeError(`category must be one of: ${Object.values(BrandKnowledgeCategory).join(", ")}.`);
  }
  return raw as BrandKnowledgeCategory;
}

function requireSourceType(raw: unknown): BrandKnowledgeSourceType {
  if (typeof raw !== "string" || !(Object.values(BrandKnowledgeSourceType) as string[]).includes(raw)) {
    throw new BrandKnowledgeError(`sourceType must be one of: ${Object.values(BrandKnowledgeSourceType).join(", ")}.`);
  }
  return raw as BrandKnowledgeSourceType;
}

function normaliseTags(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new BrandKnowledgeError("tags must be an array of strings.");
  }
  if (raw.length > MAX_TAGS) {
    throw new BrandKnowledgeError(`tags must contain ${MAX_TAGS} or fewer entries.`);
  }
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new BrandKnowledgeError("Every tag must be a non-empty string.");
    }
    const cleaned = stripHtml(entry).toLowerCase();
    if (cleaned.length === 0) continue;
    if (cleaned.length > MAX_TAG_LENGTH) {
      throw new BrandKnowledgeError(`Each tag must be ${MAX_TAG_LENGTH} characters or fewer.`);
    }
    seen.add(cleaned);
  }
  return Array.from(seen);
}

function optionalPriority(raw: unknown): number {
  if (raw === undefined || raw === null) return 0;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new BrandKnowledgeError("priority must be a whole number.");
  }
  return value;
}

function optionalPastOrPresentDate(raw: unknown, fieldName: string): Date | null {
  if (raw === undefined || raw === null) return null;
  const date = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(date.getTime())) {
    throw new BrandKnowledgeError(`${fieldName} must be a valid date.`);
  }
  if (date.getTime() > Date.now() + 60_000) {
    throw new BrandKnowledgeError(`${fieldName} cannot be in the future.`);
  }
  return date;
}

async function relatedProductExists(id: string): Promise<boolean> {
  const found = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  return Boolean(found);
}

async function pillarExists(id: string): Promise<boolean> {
  const found = await prisma.contentPillar.findUnique({ where: { id }, select: { id: true } });
  return Boolean(found);
}

async function audienceExists(id: string): Promise<boolean> {
  const found = await prisma.audience.findUnique({ where: { id }, select: { id: true } });
  return Boolean(found);
}

async function optionalRelatedProductId(raw: unknown): Promise<string | null> {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") throw new BrandKnowledgeError("relatedProductId must be a string.");
  if (!(await relatedProductExists(raw))) throw new BrandKnowledgeError(`No product found with id "${raw}".`, 404);
  return raw;
}

async function optionalPillarId(raw: unknown): Promise<string | null> {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") throw new BrandKnowledgeError("pillarId must be a string.");
  if (!(await pillarExists(raw))) throw new BrandKnowledgeError(`No content pillar found with id "${raw}".`, 404);
  return raw;
}

async function optionalAudienceId(raw: unknown): Promise<string | null> {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") throw new BrandKnowledgeError("audienceId must be a string.");
  if (!(await audienceExists(raw))) throw new BrandKnowledgeError(`No audience found with id "${raw}".`, 404);
  return raw;
}

// ---------------------------------------------------------------------------
// Output shape — dates as ISO strings, same convention as every other
// admin service in this backend (see adminAffiliateProduct.service.ts's
// own toOutput()).
// ---------------------------------------------------------------------------

type BrandKnowledgeEntryRow = Prisma.BrandKnowledgeEntryGetPayload<Record<string, never>>;

export interface BrandKnowledgeEntryOutput {
  id: string;
  category: BrandKnowledgeCategory;
  title: string;
  body: string;
  tags: string[];
  isActive: boolean;
  priority: number;
  sourceType: BrandKnowledgeSourceType;
  sourceReference: string | null;
  lastVerifiedAt: string | null;
  relatedProductId: string | null;
  pillarId: string | null;
  audienceId: string | null;
  createdByAdminId: string | null;
  updatedByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
}

function toOutput(entry: BrandKnowledgeEntryRow): BrandKnowledgeEntryOutput {
  return {
    id: entry.id,
    category: entry.category,
    title: entry.title,
    body: entry.body,
    tags: entry.tags,
    isActive: entry.isActive,
    priority: entry.priority,
    sourceType: entry.sourceType,
    sourceReference: entry.sourceReference,
    lastVerifiedAt: entry.lastVerifiedAt ? entry.lastVerifiedAt.toISOString() : null,
    relatedProductId: entry.relatedProductId,
    pillarId: entry.pillarId,
    audienceId: entry.audienceId,
    createdByAdminId: entry.createdByAdminId,
    updatedByAdminId: entry.updatedByAdminId,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Admin list / get.
// ---------------------------------------------------------------------------

export interface AdminBrandKnowledgeListFilters {
  page: number;
  limit: number;
  category?: BrandKnowledgeCategory;
  isActive?: boolean;
  search?: string;
  tag?: string;
}

export interface AdminBrandKnowledgeListResult {
  entries: BrandKnowledgeEntryOutput[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function buildAdminWhere(filters: AdminBrandKnowledgeListFilters): Prisma.BrandKnowledgeEntryWhereInput {
  const and: Prisma.BrandKnowledgeEntryWhereInput[] = [];
  if (filters.category) and.push({ category: filters.category });
  if (filters.isActive !== undefined) and.push({ isActive: filters.isActive });
  if (filters.tag) and.push({ tags: { has: filters.tag.trim().toLowerCase() } });
  if (filters.search) {
    and.push({
      OR: [{ title: { contains: filters.search, mode: "insensitive" } }, { body: { contains: filters.search, mode: "insensitive" } }],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

export async function listBrandKnowledgeEntriesForAdmin(filters: AdminBrandKnowledgeListFilters): Promise<AdminBrandKnowledgeListResult> {
  const where = buildAdminWhere(filters);

  const [total, entries] = await Promise.all([
    prisma.brandKnowledgeEntry.count({ where }),
    prisma.brandKnowledgeEntry.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return {
    entries: entries.map(toOutput),
    total,
    page: filters.page,
    limit: filters.limit,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
  };
}

export async function getBrandKnowledgeEntryForAdmin(id: string): Promise<BrandKnowledgeEntryOutput | null> {
  const entry = await prisma.brandKnowledgeEntry.findUnique({ where: { id } });
  return entry ? toOutput(entry) : null;
}

// ---------------------------------------------------------------------------
// Create.
// ---------------------------------------------------------------------------

export interface BrandKnowledgeEntryCreateInput {
  category?: unknown;
  title?: unknown;
  body?: unknown;
  tags?: unknown;
  priority?: unknown;
  sourceType?: unknown;
  sourceReference?: unknown;
  lastVerifiedAt?: unknown;
  relatedProductId?: unknown;
  pillarId?: unknown;
  audienceId?: unknown;
  isActive?: unknown;
}

export async function createBrandKnowledgeEntry(rawInput: unknown, createdByAdminId: string | null): Promise<BrandKnowledgeEntryOutput> {
  if (typeof rawInput !== "object" || rawInput === null) {
    throw new BrandKnowledgeError("Request body must be an object.");
  }
  const input = rawInput as BrandKnowledgeEntryCreateInput;

  const category = requireCategory(input.category);
  const title = requireTrimmedString(input.title, "title", MAX_TITLE_LENGTH);
  const body = requireTrimmedString(input.body, "body", MAX_BODY_LENGTH);
  const tags = normaliseTags(input.tags);
  const priority = optionalPriority(input.priority);
  const sourceType = requireSourceType(input.sourceType);
  const sourceReference = optionalTrimmedString(input.sourceReference, "sourceReference", MAX_SOURCE_REFERENCE_LENGTH);
  const lastVerifiedAt = optionalPastOrPresentDate(input.lastVerifiedAt, "lastVerifiedAt");
  const relatedProductId = await optionalRelatedProductId(input.relatedProductId);
  const pillarId = await optionalPillarId(input.pillarId);
  const audienceId = await optionalAudienceId(input.audienceId);
  const isActive = input.isActive === undefined ? true : Boolean(input.isActive);

  const entry = await prisma.brandKnowledgeEntry.create({
    data: {
      category,
      title,
      body,
      tags,
      priority,
      sourceType,
      sourceReference,
      lastVerifiedAt,
      relatedProductId,
      pillarId,
      audienceId,
      isActive,
      createdByAdminId,
      updatedByAdminId: createdByAdminId,
    },
  });

  return toOutput(entry);
}

// ---------------------------------------------------------------------------
// Update — same restricted-fields discipline as
// adminAffiliateProduct.service.ts: only a named allowlist can ever be
// edited, and a field absent from the request body is never touched.
// ---------------------------------------------------------------------------

const ALLOWED_UPDATE_FIELDS = [
  "category",
  "title",
  "body",
  "tags",
  "priority",
  "sourceType",
  "sourceReference",
  "lastVerifiedAt",
  "relatedProductId",
  "pillarId",
  "audienceId",
] as const;

export async function updateBrandKnowledgeEntry(id: string, rawInput: unknown, updatedByAdminId: string | null): Promise<BrandKnowledgeEntryOutput> {
  const existing = await prisma.brandKnowledgeEntry.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new BrandKnowledgeError(`No brand knowledge entry found with id "${id}".`, 404);
  }
  if (typeof rawInput !== "object" || rawInput === null) {
    throw new BrandKnowledgeError("Request body must be an object.");
  }
  const input = rawInput as BrandKnowledgeEntryCreateInput;

  const data: Prisma.BrandKnowledgeEntryUpdateInput = updatedByAdminId ? { updatedByAdmin: { connect: { id: updatedByAdminId } } } : { updatedByAdmin: { disconnect: true } };

  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (!(field in input)) continue;
    switch (field) {
      case "category":
        data.category = requireCategory(input.category);
        break;
      case "title":
        data.title = requireTrimmedString(input.title, "title", MAX_TITLE_LENGTH);
        break;
      case "body":
        data.body = requireTrimmedString(input.body, "body", MAX_BODY_LENGTH);
        break;
      case "tags":
        data.tags = normaliseTags(input.tags);
        break;
      case "priority":
        data.priority = optionalPriority(input.priority);
        break;
      case "sourceType":
        data.sourceType = requireSourceType(input.sourceType);
        break;
      case "sourceReference":
        data.sourceReference = optionalTrimmedString(input.sourceReference, "sourceReference", MAX_SOURCE_REFERENCE_LENGTH);
        break;
      case "lastVerifiedAt":
        data.lastVerifiedAt = optionalPastOrPresentDate(input.lastVerifiedAt, "lastVerifiedAt");
        break;
      case "relatedProductId": {
        const value = await optionalRelatedProductId(input.relatedProductId);
        data.relatedProduct = value ? { connect: { id: value } } : { disconnect: true };
        break;
      }
      case "pillarId": {
        const value = await optionalPillarId(input.pillarId);
        data.pillar = value ? { connect: { id: value } } : { disconnect: true };
        break;
      }
      case "audienceId": {
        const value = await optionalAudienceId(input.audienceId);
        data.audience = value ? { connect: { id: value } } : { disconnect: true };
        break;
      }
    }
  }

  const entry = await prisma.brandKnowledgeEntry.update({ where: { id }, data });
  return toOutput(entry);
}

// Deactivate/reactivate only — brief section 19's own "prefer
// deactivation" rule. No hard-delete function exists in this service
// at all.
export async function setBrandKnowledgeEntryActive(id: string, isActive: boolean, updatedByAdminId: string | null): Promise<BrandKnowledgeEntryOutput> {
  const existing = await prisma.brandKnowledgeEntry.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new BrandKnowledgeError(`No brand knowledge entry found with id "${id}".`, 404);
  }
  const entry = await prisma.brandKnowledgeEntry.update({ where: { id }, data: { isActive, updatedByAdminId } });
  return toOutput(entry);
}

// ---------------------------------------------------------------------------
// Retrieval boundary for future AI context building (brief section 24).
// Deterministic and database-only — no fuzzy matching, no ranking
// beyond priority/recency, no AI call. Never returns an inactive entry.
// ---------------------------------------------------------------------------

export interface KnowledgeContextQuery {
  productId?: string;
  audienceId?: string;
  pillarId?: string;
  categories?: BrandKnowledgeCategory[];
}

export async function getKnowledgeContext(query: KnowledgeContextQuery = {}): Promise<BrandKnowledgeEntryOutput[]> {
  const and: Prisma.BrandKnowledgeEntryWhereInput[] = [{ isActive: true }];

  // Broadly-applicable entries (no specific product/audience/pillar
  // link at all — e.g. a sitewide WRITING_RULE) always qualify,
  // regardless of what was asked about. An entry scoped to a specific
  // product/audience/pillar only qualifies when that exact thing was
  // asked about.
  const relevance: Prisma.BrandKnowledgeEntryWhereInput[] = [{ relatedProductId: null, audienceId: null, pillarId: null }];
  if (query.productId) relevance.push({ relatedProductId: query.productId });
  if (query.audienceId) relevance.push({ audienceId: query.audienceId });
  if (query.pillarId) relevance.push({ pillarId: query.pillarId });
  and.push({ OR: relevance });

  if (query.categories && query.categories.length > 0) {
    and.push({ category: { in: query.categories } });
  }

  const entries = await prisma.brandKnowledgeEntry.findMany({
    where: { AND: and },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });

  return entries.map(toOutput);
}

export async function getKnowledgeByTags(tags: string[]): Promise<BrandKnowledgeEntryOutput[]> {
  const normalised = tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);
  if (normalised.length === 0) return [];

  const entries = await prisma.brandKnowledgeEntry.findMany({
    where: { isActive: true, tags: { hasSome: normalised } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });

  return entries.map(toOutput);
}
