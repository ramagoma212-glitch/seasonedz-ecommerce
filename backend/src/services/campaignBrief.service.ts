// Milestone 182: the Seasonedz Marketing Control Centre's Campaign
// Brief CRUD + workflow status. Reuses Content Studio Phase 3A's
// buildContentContext() (Product + Audience + Pillar + Brand Voice
// retrieval — unchanged) and the new zeelyBriefText.service.ts
// (deterministic text assembly, no AI provider call) to actually
// produce generatedBriefText. See CampaignBrief's own schema comment
// for the snapshot discipline this file implements.

import { CampaignBriefStatus, CampaignGoal, CampaignPlatform, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { buildContentContext, ContentContextError } from "./ai/contentContext.service.js";
import { buildZeelyCampaignBriefText } from "./ai/zeelyBriefText.service.js";
import { getPreorderProgrammeSettings } from "./preorderProgrammeSettings.service.js";

export class CampaignBriefError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "CampaignBriefError";
    this.statusCode = statusCode;
  }
}

const MAX_PLATFORMS = 7; // one of each real CampaignPlatform value
const MAX_CAMPAIGN_TYPE_LENGTH = 100;
const MAX_CALL_TO_ACTION_LENGTH = 300;
const MAX_ADDITIONAL_INSTRUCTIONS_LENGTH = 2000;
const MAX_CONTENT_QUANTITY = 100;

function parseGoal(raw: unknown): CampaignGoal {
  if (typeof raw === "string" && (Object.values(CampaignGoal) as string[]).includes(raw)) {
    return raw as CampaignGoal;
  }
  throw new CampaignBriefError(`goal must be one of: ${Object.values(CampaignGoal).join(", ")}.`);
}

function parsePlatforms(raw: unknown): CampaignPlatform[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new CampaignBriefError("At least one platform must be selected.");
  }
  if (raw.length > MAX_PLATFORMS) {
    throw new CampaignBriefError(`No more than ${MAX_PLATFORMS} platforms may be selected.`);
  }
  const valid = Object.values(CampaignPlatform) as string[];
  const platforms = raw.map((entry) => {
    if (typeof entry !== "string" || !valid.includes(entry)) {
      throw new CampaignBriefError(`platforms must each be one of: ${valid.join(", ")}.`);
    }
    return entry as CampaignPlatform;
  });
  // De-duplicate while preserving the admin's own selection order —
  // a checkbox group can never actually submit a duplicate, but this
  // stays defensive rather than assuming the request body is well-formed.
  return Array.from(new Set(platforms));
}

function optionalTrimmedText(raw: unknown, fieldLabel: string, maxLength: number): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") throw new CampaignBriefError(`${fieldLabel} must be text.`);
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) throw new CampaignBriefError(`${fieldLabel} must be ${maxLength} characters or fewer.`);
  return trimmed;
}

function optionalPositiveInt(raw: unknown, fieldLabel: string, max: number): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > max) {
    throw new CampaignBriefError(`${fieldLabel} must be a whole number between 1 and ${max}.`);
  }
  return value;
}

function optionalDate(raw: unknown, fieldLabel: string): Date | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const date = new Date(raw as string);
  if (Number.isNaN(date.getTime())) throw new CampaignBriefError(`${fieldLabel} is not a valid date.`);
  return date;
}

export interface CampaignBriefInput {
  productId?: unknown;
  audienceId?: unknown;
  pillarId?: unknown;
  platforms?: unknown;
  goal?: unknown;
  campaignType?: unknown;
  contentQuantity?: unknown;
  campaignStartAt?: unknown;
  campaignEndAt?: unknown;
  callToAction?: unknown;
  additionalInstructions?: unknown;
}

interface ParsedCampaignFields {
  productId: string;
  audienceId: string;
  pillarId: string;
  platforms: CampaignPlatform[];
  goal: CampaignGoal;
  campaignType: string | null;
  contentQuantity: number | null;
  campaignStartAt: Date | null;
  campaignEndAt: Date | null;
  callToAction: string | null;
  additionalInstructions: string | null;
}

// Part D: Product/Audience/Pillar/Platforms/Goal are the controlled
// fields a complete, useful brief needs — required, matching every
// section the BRIEF OUTPUT spec expects to actually have content
// (Target Audience, Content Pillar, Platform Requirements all assume a
// real selection exists). Everything else stays optional, same as the
// brief's own "Recommended fields" list implies for the free-text ones.
function parseCampaignFields(rawInput: unknown): ParsedCampaignFields {
  if (typeof rawInput !== "object" || rawInput === null) {
    throw new CampaignBriefError("Request body must be an object.");
  }
  const input = rawInput as CampaignBriefInput;

  if (typeof input.productId !== "string" || !input.productId.trim()) {
    throw new CampaignBriefError("productId is required.");
  }
  if (typeof input.audienceId !== "string" || !input.audienceId.trim()) {
    throw new CampaignBriefError("audienceId is required.");
  }
  if (typeof input.pillarId !== "string" || !input.pillarId.trim()) {
    throw new CampaignBriefError("pillarId is required.");
  }

  const campaignStartAt = optionalDate(input.campaignStartAt, "campaignStartAt");
  const campaignEndAt = optionalDate(input.campaignEndAt, "campaignEndAt");
  if (campaignStartAt && campaignEndAt && campaignEndAt < campaignStartAt) {
    throw new CampaignBriefError("campaignEndAt cannot be before campaignStartAt.");
  }

  return {
    productId: input.productId.trim(),
    audienceId: input.audienceId.trim(),
    pillarId: input.pillarId.trim(),
    platforms: parsePlatforms(input.platforms),
    goal: parseGoal(input.goal),
    campaignType: optionalTrimmedText(input.campaignType, "campaignType", MAX_CAMPAIGN_TYPE_LENGTH),
    contentQuantity: optionalPositiveInt(input.contentQuantity, "contentQuantity", MAX_CONTENT_QUANTITY),
    campaignStartAt,
    campaignEndAt,
    callToAction: optionalTrimmedText(input.callToAction, "callToAction", MAX_CALL_TO_ACTION_LENGTH),
    additionalInstructions: optionalTrimmedText(input.additionalInstructions, "additionalInstructions", MAX_ADDITIONAL_INSTRUCTIONS_LENGTH),
  };
}

// The one place generatedBriefText is actually produced — reused by
// create, update (when a content-affecting field changes) and the
// explicit regenerate action. Always re-reads CURRENT Product/Brand
// Knowledge/programme data (Part K: "Read live Product/programme
// configuration", never a cached copy) — this is exactly what makes a
// stale preorder claim impossible in a NEWLY generated brief, even for
// an existing brief being edited or explicitly regenerated.
async function generateBriefText(fields: ParsedCampaignFields): Promise<string> {
  const context = await buildContentContext({
    productId: fields.productId,
    audienceId: fields.audienceId,
    pillarId: fields.pillarId,
    purpose: "zeely-campaign-brief",
    platforms: fields.platforms,
  });

  const settings = await getPreorderProgrammeSettings();
  const preorderDiscountPercent = settings.firstRegisteredPreorderDiscountEnabled ? settings.firstRegisteredPreorderDiscountPercent : null;

  return buildZeelyCampaignBriefText(context, fields, preorderDiscountPercent);
}

const campaignBriefInclude = {
  product: { select: { id: true, name: true, slug: true, price: true } },
  audience: { select: { id: true, name: true } },
  pillar: { select: { id: true, name: true } },
  createdByAdmin: { select: { id: true, name: true } },
  updatedByAdmin: { select: { id: true, name: true } },
  contentRecords: { orderBy: { createdAt: Prisma.SortOrder.desc } },
} satisfies Prisma.CampaignBriefInclude;

type CampaignBriefRow = Prisma.CampaignBriefGetPayload<{ include: typeof campaignBriefInclude }>;

export interface CampaignBriefOutput {
  id: string;
  product: { id: string; name: string; slug: string; price: number } | null;
  audience: { id: string; name: string } | null;
  pillar: { id: string; name: string } | null;
  platforms: CampaignPlatform[];
  goal: CampaignGoal;
  campaignType: string | null;
  contentQuantity: number | null;
  campaignStartAt: Date | null;
  campaignEndAt: Date | null;
  callToAction: string | null;
  additionalInstructions: string | null;
  generatedBriefText: string;
  generatedAt: Date;
  status: CampaignBriefStatus;
  createdByAdmin: { id: string; name: string } | null;
  updatedByAdmin: { id: string; name: string } | null;
  contentRecords: CampaignContentRecordOutput[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignContentRecordOutput {
  id: string;
  contentType: string;
  platform: CampaignPlatform | null;
  caption: string | null;
  notes: string | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  externalReference: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toCampaignBriefOutput(row: CampaignBriefRow): CampaignBriefOutput {
  return {
    id: row.id,
    product: row.product ? { id: row.product.id, name: row.product.name, slug: row.product.slug, price: Number(row.product.price) } : null,
    audience: row.audience ? { id: row.audience.id, name: row.audience.name } : null,
    pillar: row.pillar ? { id: row.pillar.id, name: row.pillar.name } : null,
    platforms: row.platforms,
    goal: row.goal,
    campaignType: row.campaignType,
    contentQuantity: row.contentQuantity,
    campaignStartAt: row.campaignStartAt,
    campaignEndAt: row.campaignEndAt,
    callToAction: row.callToAction,
    additionalInstructions: row.additionalInstructions,
    generatedBriefText: row.generatedBriefText,
    generatedAt: row.generatedAt,
    status: row.status,
    createdByAdmin: row.createdByAdmin,
    updatedByAdmin: row.updatedByAdmin,
    contentRecords: row.contentRecords.map(toContentRecordOutput),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toContentRecordOutput(row: Prisma.CampaignContentRecordGetPayload<Record<string, never>>): CampaignContentRecordOutput {
  return {
    id: row.id,
    contentType: row.contentType,
    platform: row.platform,
    caption: row.caption,
    notes: row.notes,
    scheduledAt: row.scheduledAt,
    publishedAt: row.publishedAt,
    externalReference: row.externalReference,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createCampaignBrief(rawInput: unknown, adminUserId: string | null): Promise<CampaignBriefOutput> {
  const fields = parseCampaignFields(rawInput);

  let briefText: string;
  try {
    briefText = await generateBriefText(fields);
  } catch (error) {
    if (error instanceof ContentContextError) throw new CampaignBriefError(error.message, error.statusCode);
    throw error;
  }

  const created = await prisma.campaignBrief.create({
    data: {
      productId: fields.productId,
      audienceId: fields.audienceId,
      pillarId: fields.pillarId,
      platforms: fields.platforms,
      goal: fields.goal,
      campaignType: fields.campaignType,
      contentQuantity: fields.contentQuantity,
      campaignStartAt: fields.campaignStartAt,
      campaignEndAt: fields.campaignEndAt,
      callToAction: fields.callToAction,
      additionalInstructions: fields.additionalInstructions,
      generatedBriefText: briefText,
      generatedAt: new Date(),
      status: CampaignBriefStatus.DRAFT,
      createdByAdminId: adminUserId,
      updatedByAdminId: adminUserId,
    },
    include: campaignBriefInclude,
  });

  return toCampaignBriefOutput(created);
}

export interface CampaignBriefListFilters {
  status?: CampaignBriefStatus;
  page?: number;
  limit?: number;
}

export interface CampaignBriefListResult {
  briefs: CampaignBriefOutput[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function listCampaignBriefsForAdmin(filters: CampaignBriefListFilters = {}): Promise<CampaignBriefListResult> {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 50) : 20;
  const where: Prisma.CampaignBriefWhereInput = filters.status ? { status: filters.status } : {};

  const [rows, total] = await Promise.all([
    prisma.campaignBrief.findMany({
      where,
      include: campaignBriefInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.campaignBrief.count({ where }),
  ]);

  return { briefs: rows.map(toCampaignBriefOutput), total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getCampaignBriefForAdmin(id: string): Promise<CampaignBriefOutput | null> {
  const row = await prisma.campaignBrief.findUnique({ where: { id }, include: campaignBriefInclude });
  return row ? toCampaignBriefOutput(row) : null;
}

// Part J: STAFF may "edit working campaign briefs" — enforced here as
// "any non-ARCHIVED brief", never at the route level alone, so this
// rule holds regardless of which role is calling.
async function assertBriefIsEditable(id: string): Promise<CampaignBriefRow> {
  const existing = await prisma.campaignBrief.findUnique({ where: { id }, include: campaignBriefInclude });
  if (!existing) throw new CampaignBriefError(`Campaign brief not found: ${id}`, 404);
  if (existing.status === CampaignBriefStatus.ARCHIVED) {
    throw new CampaignBriefError("This campaign brief is archived and can no longer be edited.", 409);
  }
  return existing;
}

// A partial update — only the fields actually present in rawInput are
// changed; every other field keeps the brief's existing value. Any
// content-affecting field present triggers a regeneration of
// generatedBriefText using the EFFECTIVE (existing where not
// overridden) field set — the same "effective value" discipline
// adminProduct.service.ts's own updateProduct() already established
// for preorder validation.
export async function updateCampaignBrief(id: string, rawInput: unknown, adminUserId: string | null): Promise<CampaignBriefOutput> {
  const existing = await assertBriefIsEditable(id);

  if (typeof rawInput !== "object" || rawInput === null) {
    throw new CampaignBriefError("Request body must be an object.");
  }
  const input = rawInput as CampaignBriefInput;

  const effective: CampaignBriefInput = {
    productId: "productId" in input ? input.productId : existing.productId,
    audienceId: "audienceId" in input ? input.audienceId : existing.audienceId,
    pillarId: "pillarId" in input ? input.pillarId : existing.pillarId,
    platforms: "platforms" in input ? input.platforms : existing.platforms,
    goal: "goal" in input ? input.goal : existing.goal,
    campaignType: "campaignType" in input ? input.campaignType : existing.campaignType,
    contentQuantity: "contentQuantity" in input ? input.contentQuantity : existing.contentQuantity,
    campaignStartAt: "campaignStartAt" in input ? input.campaignStartAt : existing.campaignStartAt,
    campaignEndAt: "campaignEndAt" in input ? input.campaignEndAt : existing.campaignEndAt,
    callToAction: "callToAction" in input ? input.callToAction : existing.callToAction,
    additionalInstructions: "additionalInstructions" in input ? input.additionalInstructions : existing.additionalInstructions,
  };

  const fields = parseCampaignFields(effective);

  let briefText: string;
  try {
    briefText = await generateBriefText(fields);
  } catch (error) {
    if (error instanceof ContentContextError) throw new CampaignBriefError(error.message, error.statusCode);
    throw error;
  }

  const updated = await prisma.campaignBrief.update({
    where: { id },
    data: {
      productId: fields.productId,
      audienceId: fields.audienceId,
      pillarId: fields.pillarId,
      platforms: fields.platforms,
      goal: fields.goal,
      campaignType: fields.campaignType,
      contentQuantity: fields.contentQuantity,
      campaignStartAt: fields.campaignStartAt,
      campaignEndAt: fields.campaignEndAt,
      callToAction: fields.callToAction,
      additionalInstructions: fields.additionalInstructions,
      generatedBriefText: briefText,
      generatedAt: new Date(),
      updatedByAdminId: adminUserId,
    },
    include: campaignBriefInclude,
  });

  return toCampaignBriefOutput(updated);
}

// Part K: the explicit "pick up drift" action — re-reads current
// Product/Brand Knowledge/programme data against the brief's OWN
// already-stored field selections (no field is changed), and
// overwrites generatedBriefText. Useful once a preorder window ends,
// or once Brand Knowledge changes, without editing anything else.
export async function regenerateCampaignBrief(id: string, adminUserId: string | null): Promise<CampaignBriefOutput> {
  const existing = await assertBriefIsEditable(id);

  const fields: ParsedCampaignFields = {
    productId: existing.productId ?? "",
    audienceId: existing.audienceId ?? "",
    pillarId: existing.pillarId ?? "",
    platforms: existing.platforms,
    goal: existing.goal,
    campaignType: existing.campaignType,
    contentQuantity: existing.contentQuantity,
    campaignStartAt: existing.campaignStartAt,
    campaignEndAt: existing.campaignEndAt,
    callToAction: existing.callToAction,
    additionalInstructions: existing.additionalInstructions,
  };
  if (!fields.productId || !fields.audienceId || !fields.pillarId) {
    throw new CampaignBriefError("This brief is missing its product, audience or pillar and cannot be regenerated. Edit it with a full selection first.", 409);
  }

  let briefText: string;
  try {
    briefText = await generateBriefText(fields);
  } catch (error) {
    if (error instanceof ContentContextError) throw new CampaignBriefError(error.message, error.statusCode);
    throw error;
  }

  const updated = await prisma.campaignBrief.update({
    where: { id },
    data: { generatedBriefText: briefText, generatedAt: new Date(), updatedByAdminId: adminUserId },
    include: campaignBriefInclude,
  });

  return toCampaignBriefOutput(updated);
}

// Part G: manually controlled only — never inferred from any Zeely
// activity (this backend has no Zeely integration, see Part I). Linear
// forward path plus ARCHIVED, reachable from anywhere except itself —
// a brief can be archived at any working stage, not only at the end.
// ARCHIVED itself is excluded here on purpose: the dedicated
// archiveCampaignBrief() below is the only way in, and there is no way
// back out (an archived brief must be treated as done).
const ALLOWED_STATUS_TRANSITIONS: Record<CampaignBriefStatus, CampaignBriefStatus[]> = {
  DRAFT: [CampaignBriefStatus.READY_FOR_ZEELY],
  READY_FOR_ZEELY: [CampaignBriefStatus.CREATED_IN_ZEELY, CampaignBriefStatus.DRAFT],
  CREATED_IN_ZEELY: [CampaignBriefStatus.APPROVED, CampaignBriefStatus.READY_FOR_ZEELY],
  APPROVED: [CampaignBriefStatus.SCHEDULED, CampaignBriefStatus.CREATED_IN_ZEELY],
  SCHEDULED: [CampaignBriefStatus.PUBLISHED, CampaignBriefStatus.APPROVED],
  PUBLISHED: [],
  ARCHIVED: [],
};

export async function updateCampaignBriefStatus(id: string, rawStatus: unknown, adminUserId: string | null): Promise<CampaignBriefOutput> {
  if (typeof rawStatus !== "string" || !(Object.values(CampaignBriefStatus) as string[]).includes(rawStatus)) {
    throw new CampaignBriefError(`status must be one of: ${Object.values(CampaignBriefStatus).join(", ")}.`);
  }
  const nextStatus = rawStatus as CampaignBriefStatus;
  if (nextStatus === CampaignBriefStatus.ARCHIVED) {
    throw new CampaignBriefError("Use the archive action to archive a campaign brief.", 400);
  }

  const existing = await prisma.campaignBrief.findUnique({ where: { id } });
  if (!existing) throw new CampaignBriefError(`Campaign brief not found: ${id}`, 404);

  const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new CampaignBriefError(`Cannot move a campaign brief from ${existing.status} to ${nextStatus}.`, 409);
  }

  const updated = await prisma.campaignBrief.update({
    where: { id },
    data: { status: nextStatus, updatedByAdminId: adminUserId },
    include: campaignBriefInclude,
  });
  return toCampaignBriefOutput(updated);
}

// Part J: ADMIN-only — enforced at the route level (see
// campaignBrief.routes.ts), same discipline as every other ADMIN-only
// write in this codebase. Reachable from any status, any time.
export async function archiveCampaignBrief(id: string, adminUserId: string | null): Promise<CampaignBriefOutput> {
  const existing = await prisma.campaignBrief.findUnique({ where: { id } });
  if (!existing) throw new CampaignBriefError(`Campaign brief not found: ${id}`, 404);
  if (existing.status === CampaignBriefStatus.ARCHIVED) {
    throw new CampaignBriefError("This campaign brief is already archived.", 409);
  }

  const updated = await prisma.campaignBrief.update({
    where: { id },
    data: { status: CampaignBriefStatus.ARCHIVED, updatedByAdminId: adminUserId },
    include: campaignBriefInclude,
  });
  return toCampaignBriefOutput(updated);
}

// ---------------------------------------------------------------------------
// Part H: lightweight content records — never auto-populated, never
// verified against Zeely (see Part I). Create/update/delete only; no
// separate list endpoint since a brief's own detail response already
// includes contentRecords (campaignBriefInclude above).
// ---------------------------------------------------------------------------

export interface CampaignContentRecordInput {
  contentType?: unknown;
  platform?: unknown;
  caption?: unknown;
  notes?: unknown;
  scheduledAt?: unknown;
  publishedAt?: unknown;
  externalReference?: unknown;
}

const MAX_CONTENT_TYPE_LENGTH = 50;
const MAX_CAPTION_LENGTH = 2000;
const MAX_NOTES_LENGTH = 2000;
const MAX_EXTERNAL_REFERENCE_LENGTH = 500;

function parseOptionalPlatform(raw: unknown): CampaignPlatform | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const valid = Object.values(CampaignPlatform) as string[];
  if (typeof raw !== "string" || !valid.includes(raw)) {
    throw new CampaignBriefError(`platform must be one of: ${valid.join(", ")}.`);
  }
  return raw as CampaignPlatform;
}

export async function createCampaignContentRecord(campaignBriefId: string, rawInput: unknown, adminUserId: string | null): Promise<CampaignContentRecordOutput> {
  const brief = await prisma.campaignBrief.findUnique({ where: { id: campaignBriefId }, select: { id: true } });
  if (!brief) throw new CampaignBriefError(`Campaign brief not found: ${campaignBriefId}`, 404);

  if (typeof rawInput !== "object" || rawInput === null) {
    throw new CampaignBriefError("Request body must be an object.");
  }
  const input = rawInput as CampaignContentRecordInput;

  const contentType = optionalTrimmedText(input.contentType, "contentType", MAX_CONTENT_TYPE_LENGTH);
  if (!contentType) throw new CampaignBriefError("contentType is required.");

  const created = await prisma.campaignContentRecord.create({
    data: {
      campaignBriefId,
      contentType,
      platform: parseOptionalPlatform(input.platform),
      caption: optionalTrimmedText(input.caption, "caption", MAX_CAPTION_LENGTH),
      notes: optionalTrimmedText(input.notes, "notes", MAX_NOTES_LENGTH),
      scheduledAt: optionalDate(input.scheduledAt, "scheduledAt"),
      publishedAt: optionalDate(input.publishedAt, "publishedAt"),
      externalReference: optionalTrimmedText(input.externalReference, "externalReference", MAX_EXTERNAL_REFERENCE_LENGTH),
      createdByAdminId: adminUserId,
    },
  });

  return toContentRecordOutput(created);
}

export async function updateCampaignContentRecord(recordId: string, rawInput: unknown): Promise<CampaignContentRecordOutput> {
  const existing = await prisma.campaignContentRecord.findUnique({ where: { id: recordId } });
  if (!existing) throw new CampaignBriefError(`Content record not found: ${recordId}`, 404);

  if (typeof rawInput !== "object" || rawInput === null) {
    throw new CampaignBriefError("Request body must be an object.");
  }
  const input = rawInput as CampaignContentRecordInput;
  const data: Prisma.CampaignContentRecordUpdateInput = {};

  if ("contentType" in input) {
    const contentType = optionalTrimmedText(input.contentType, "contentType", MAX_CONTENT_TYPE_LENGTH);
    if (!contentType) throw new CampaignBriefError("contentType cannot be cleared.");
    data.contentType = contentType;
  }
  if ("platform" in input) data.platform = parseOptionalPlatform(input.platform);
  if ("caption" in input) data.caption = optionalTrimmedText(input.caption, "caption", MAX_CAPTION_LENGTH);
  if ("notes" in input) data.notes = optionalTrimmedText(input.notes, "notes", MAX_NOTES_LENGTH);
  if ("scheduledAt" in input) data.scheduledAt = optionalDate(input.scheduledAt, "scheduledAt");
  if ("publishedAt" in input) data.publishedAt = optionalDate(input.publishedAt, "publishedAt");
  if ("externalReference" in input) data.externalReference = optionalTrimmedText(input.externalReference, "externalReference", MAX_EXTERNAL_REFERENCE_LENGTH);

  const updated = await prisma.campaignContentRecord.update({ where: { id: recordId }, data });
  return toContentRecordOutput(updated);
}

export async function deleteCampaignContentRecord(recordId: string): Promise<void> {
  const existing = await prisma.campaignContentRecord.findUnique({ where: { id: recordId } });
  if (!existing) throw new CampaignBriefError(`Content record not found: ${recordId}`, 404);
  await prisma.campaignContentRecord.delete({ where: { id: recordId } });
}
