// Content Studio Phase 2: admin management of Audience — a named
// marketing audience (brief section 16), never a customer record. This
// service must never accept or return anything resembling an
// individual's PII; every field here is a description of a group, the
// same discipline Customer/Order data already keeps completely
// separate from anything Content Studio touches.

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import sanitizeHtml from "sanitize-html";

export class AudienceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AudienceError";
    this.statusCode = statusCode;
  }
}

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_PARAGRAPH_LENGTH = 1000;

function stripHtml(raw: string): string {
  return sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} }).trim();
}

function requireName(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new AudienceError("name is required.");
  }
  const cleaned = stripHtml(raw);
  if (cleaned.length === 0) {
    throw new AudienceError("name is required.");
  }
  if (cleaned.length > MAX_NAME_LENGTH) {
    throw new AudienceError(`name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }
  return cleaned;
}

function optionalParagraph(raw: unknown, fieldName: string, maxLength: number): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw new AudienceError(`${fieldName} must be a string.`);
  const cleaned = stripHtml(raw);
  if (cleaned.length > maxLength) {
    throw new AudienceError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return cleaned.length > 0 ? cleaned : null;
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

type AudienceRow = Prisma.AudienceGetPayload<Record<string, never>>;

export interface AudienceOutput {
  id: string;
  name: string;
  description: string | null;
  painPoints: string | null;
  motivations: string | null;
  preferredContent: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function toOutput(audience: AudienceRow): AudienceOutput {
  return {
    id: audience.id,
    name: audience.name,
    description: audience.description,
    painPoints: audience.painPoints,
    motivations: audience.motivations,
    preferredContent: audience.preferredContent,
    isActive: audience.isActive,
    createdAt: audience.createdAt.toISOString(),
    updatedAt: audience.updatedAt.toISOString(),
  };
}

export interface AdminAudienceListFilters {
  isActive?: boolean;
  search?: string;
}

export async function listAudiencesForAdmin(filters: AdminAudienceListFilters = {}): Promise<AudienceOutput[]> {
  const and: Prisma.AudienceWhereInput[] = [];
  if (filters.isActive !== undefined) and.push({ isActive: filters.isActive });
  if (filters.search) and.push({ name: { contains: filters.search, mode: "insensitive" } });

  const audiences = await prisma.audience.findMany({
    where: and.length > 0 ? { AND: and } : {},
    orderBy: { name: "asc" },
  });
  return audiences.map(toOutput);
}

export async function getAudienceForAdmin(id: string): Promise<AudienceOutput | null> {
  const audience = await prisma.audience.findUnique({ where: { id } });
  return audience ? toOutput(audience) : null;
}

export interface AudienceInput {
  name?: unknown;
  description?: unknown;
  painPoints?: unknown;
  motivations?: unknown;
  preferredContent?: unknown;
  isActive?: unknown;
}

export async function createAudience(rawInput: unknown): Promise<AudienceOutput> {
  if (typeof rawInput !== "object" || rawInput === null) {
    throw new AudienceError("Request body must be an object.");
  }
  const input = rawInput as AudienceInput;

  const name = requireName(input.name);
  const description = optionalParagraph(input.description, "description", MAX_DESCRIPTION_LENGTH);
  const painPoints = optionalParagraph(input.painPoints, "painPoints", MAX_PARAGRAPH_LENGTH);
  const motivations = optionalParagraph(input.motivations, "motivations", MAX_PARAGRAPH_LENGTH);
  const preferredContent = optionalParagraph(input.preferredContent, "preferredContent", MAX_PARAGRAPH_LENGTH);
  const isActive = input.isActive === undefined ? true : Boolean(input.isActive);

  try {
    const audience = await prisma.audience.create({
      data: { name, description, painPoints, motivations, preferredContent, isActive },
    });
    return toOutput(audience);
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new AudienceError(`An audience named "${name}" already exists.`, 409);
    }
    throw error;
  }
}

const ALLOWED_UPDATE_FIELDS = ["name", "description", "painPoints", "motivations", "preferredContent"] as const;

export async function updateAudience(id: string, rawInput: unknown): Promise<AudienceOutput> {
  const existing = await prisma.audience.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AudienceError(`No audience found with id "${id}".`, 404);
  }
  if (typeof rawInput !== "object" || rawInput === null) {
    throw new AudienceError("Request body must be an object.");
  }
  const input = rawInput as AudienceInput;

  const data: Prisma.AudienceUpdateInput = {};
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (!(field in input)) continue;
    if (field === "name") data.name = requireName(input.name);
    if (field === "description") data.description = optionalParagraph(input.description, "description", MAX_DESCRIPTION_LENGTH);
    if (field === "painPoints") data.painPoints = optionalParagraph(input.painPoints, "painPoints", MAX_PARAGRAPH_LENGTH);
    if (field === "motivations") data.motivations = optionalParagraph(input.motivations, "motivations", MAX_PARAGRAPH_LENGTH);
    if (field === "preferredContent") data.preferredContent = optionalParagraph(input.preferredContent, "preferredContent", MAX_PARAGRAPH_LENGTH);
  }

  try {
    const audience = await prisma.audience.update({ where: { id }, data });
    return toOutput(audience);
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new AudienceError(`An audience named "${data.name}" already exists.`, 409);
    }
    throw error;
  }
}

export async function setAudienceActive(id: string, isActive: boolean): Promise<AudienceOutput> {
  const existing = await prisma.audience.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AudienceError(`No audience found with id "${id}".`, 404);
  }
  const audience = await prisma.audience.update({ where: { id }, data: { isActive } });
  return toOutput(audience);
}
