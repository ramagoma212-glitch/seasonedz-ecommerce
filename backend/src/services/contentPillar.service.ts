// Content Studio Phase 2: admin management of ContentPillar — a named
// marketing content category, database managed on purpose (brief
// section 14) rather than hard-coded in frontend JavaScript. name is
// unique at the database level; createBrandKnowledgeEntry/
// updateBrandKnowledgeEntry (brandKnowledge.service.ts) are the only
// other place that ever reads a ContentPillar id, and only to confirm
// it still exists before linking to it.

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import sanitizeHtml from "sanitize-html";

export class ContentPillarError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ContentPillarError";
    this.statusCode = statusCode;
  }
}

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;

function stripHtml(raw: string): string {
  return sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} }).trim();
}

function requireName(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new ContentPillarError("name is required.");
  }
  const cleaned = stripHtml(raw);
  if (cleaned.length === 0) {
    throw new ContentPillarError("name is required.");
  }
  if (cleaned.length > MAX_NAME_LENGTH) {
    throw new ContentPillarError(`name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }
  return cleaned;
}

function optionalDescription(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw new ContentPillarError("description must be a string.");
  const cleaned = stripHtml(raw);
  if (cleaned.length > MAX_DESCRIPTION_LENGTH) {
    throw new ContentPillarError(`description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
  }
  return cleaned.length > 0 ? cleaned : null;
}

function optionalSortOrder(raw: unknown): number {
  if (raw === undefined || raw === null) return 0;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ContentPillarError("sortOrder must be a whole number.");
  }
  return value;
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

type ContentPillarRow = Prisma.ContentPillarGetPayload<Record<string, never>>;

export interface ContentPillarOutput {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

function toOutput(pillar: ContentPillarRow): ContentPillarOutput {
  return {
    id: pillar.id,
    name: pillar.name,
    description: pillar.description,
    isActive: pillar.isActive,
    sortOrder: pillar.sortOrder,
    createdAt: pillar.createdAt.toISOString(),
    updatedAt: pillar.updatedAt.toISOString(),
  };
}

export interface AdminContentPillarListFilters {
  isActive?: boolean;
  search?: string;
}

export async function listContentPillarsForAdmin(filters: AdminContentPillarListFilters = {}): Promise<ContentPillarOutput[]> {
  const and: Prisma.ContentPillarWhereInput[] = [];
  if (filters.isActive !== undefined) and.push({ isActive: filters.isActive });
  if (filters.search) and.push({ name: { contains: filters.search, mode: "insensitive" } });

  const pillars = await prisma.contentPillar.findMany({
    where: and.length > 0 ? { AND: and } : {},
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return pillars.map(toOutput);
}

export async function getContentPillarForAdmin(id: string): Promise<ContentPillarOutput | null> {
  const pillar = await prisma.contentPillar.findUnique({ where: { id } });
  return pillar ? toOutput(pillar) : null;
}

export interface ContentPillarInput {
  name?: unknown;
  description?: unknown;
  sortOrder?: unknown;
  isActive?: unknown;
}

export async function createContentPillar(rawInput: unknown): Promise<ContentPillarOutput> {
  if (typeof rawInput !== "object" || rawInput === null) {
    throw new ContentPillarError("Request body must be an object.");
  }
  const input = rawInput as ContentPillarInput;

  const name = requireName(input.name);
  const description = optionalDescription(input.description);
  const sortOrder = optionalSortOrder(input.sortOrder);
  const isActive = input.isActive === undefined ? true : Boolean(input.isActive);

  try {
    const pillar = await prisma.contentPillar.create({ data: { name, description, sortOrder, isActive } });
    return toOutput(pillar);
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new ContentPillarError(`A content pillar named "${name}" already exists.`, 409);
    }
    throw error;
  }
}

const ALLOWED_UPDATE_FIELDS = ["name", "description", "sortOrder"] as const;

export async function updateContentPillar(id: string, rawInput: unknown): Promise<ContentPillarOutput> {
  const existing = await prisma.contentPillar.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new ContentPillarError(`No content pillar found with id "${id}".`, 404);
  }
  if (typeof rawInput !== "object" || rawInput === null) {
    throw new ContentPillarError("Request body must be an object.");
  }
  const input = rawInput as ContentPillarInput;

  const data: Prisma.ContentPillarUpdateInput = {};
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (!(field in input)) continue;
    if (field === "name") data.name = requireName(input.name);
    if (field === "description") data.description = optionalDescription(input.description);
    if (field === "sortOrder") data.sortOrder = optionalSortOrder(input.sortOrder);
  }

  try {
    const pillar = await prisma.contentPillar.update({ where: { id }, data });
    return toOutput(pillar);
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new ContentPillarError(`A content pillar named "${data.name}" already exists.`, 409);
    }
    throw error;
  }
}

export async function setContentPillarActive(id: string, isActive: boolean): Promise<ContentPillarOutput> {
  const existing = await prisma.contentPillar.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new ContentPillarError(`No content pillar found with id "${id}".`, 404);
  }
  const pillar = await prisma.contentPillar.update({ where: { id }, data: { isActive } });
  return toOutput(pillar);
}
