// Milestone 178, Part C: admin CRUD for AffiliateProductSetting — which
// of Seasonedz's OWN real products earn the affiliate programme a
// commission, and at what rate/amount. Every display field (name/price/
// image/SKU/status) is always read LIVE from Product via a join, never
// copied or cached here — see AffiliateProductSetting's own schema
// comment for the full "no second product system" discipline. This
// file never touches Product's own name/price/image/SKU/stock fields.

import { AffiliateProductCommissionType, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export class AffiliateProductSettingError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AffiliateProductSettingError";
    this.statusCode = statusCode;
  }
}

const settingWithProductInclude = {
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      sku: true,
      price: true,
      status: true,
      images: { orderBy: { sortOrder: "asc" }, select: { url: true, isPrimary: true } },
    },
  },
} satisfies Prisma.AffiliateProductSettingInclude;

type SettingWithProduct = Prisma.AffiliateProductSettingGetPayload<{ include: typeof settingWithProductInclude }>;

export interface AffiliateProductSettingOutput {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  productSku: string | null;
  productPrice: number;
  productStatus: string;
  productImageUrl: string | null;
  commissionType: AffiliateProductCommissionType;
  commissionPercent: number | null;
  fixedCommissionAmount: number | null;
  isAffiliateAvailable: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  maximumCommission: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function primaryImageUrl(images: { url: string; isPrimary: boolean }[]): string | null {
  return images.find((image) => image.isPrimary)?.url ?? images[0]?.url ?? null;
}

function toOutput(row: SettingWithProduct): AffiliateProductSettingOutput {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.product.name,
    productSlug: row.product.slug,
    productSku: row.product.sku,
    productPrice: row.product.price.toNumber(),
    productStatus: row.product.status,
    productImageUrl: primaryImageUrl(row.product.images),
    commissionType: row.commissionType,
    commissionPercent: row.commissionPercent ? row.commissionPercent.toNumber() : null,
    fixedCommissionAmount: row.fixedCommissionAmount ? row.fixedCommissionAmount.toNumber() : null,
    isAffiliateAvailable: row.isAffiliateAvailable,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maximumCommission: row.maximumCommission ? row.maximumCommission.toNumber() : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface AffiliateProductSettingListFilters {
  page: number;
  limit: number;
  search?: string;
}

export interface AffiliateProductSettingListResult {
  items: AffiliateProductSettingOutput[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function listAffiliateProductSettings(filters: AffiliateProductSettingListFilters): Promise<AffiliateProductSettingListResult> {
  const where: Prisma.AffiliateProductSettingWhereInput = filters.search
    ? { product: { OR: [{ name: { contains: filters.search, mode: "insensitive" } }, { sku: { contains: filters.search, mode: "insensitive" } }] } }
    : {};

  const [total, rows] = await Promise.all([
    prisma.affiliateProductSetting.count({ where }),
    prisma.affiliateProductSetting.findMany({
      where,
      include: settingWithProductInclude,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return {
    items: rows.map(toOutput),
    total,
    page: filters.page,
    limit: filters.limit,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
  };
}

export async function getAffiliateProductSetting(id: string): Promise<AffiliateProductSettingOutput> {
  const row = await prisma.affiliateProductSetting.findUnique({ where: { id }, include: settingWithProductInclude });
  if (!row) throw new AffiliateProductSettingError(`Affiliate product setting not found: ${id}`, 404);
  return toOutput(row);
}

// ---------------------------------------------------------------------------
// Shared input validation — reused by create and update so the two can
// never quietly accept different rules.
// ---------------------------------------------------------------------------

export interface AffiliateProductSettingInput {
  commissionType: unknown;
  commissionPercent: unknown;
  fixedCommissionAmount: unknown;
  isAffiliateAvailable: unknown;
  startsAt: unknown;
  endsAt: unknown;
  maximumCommission: unknown;
}

interface ParsedSettingFields {
  commissionType: AffiliateProductCommissionType;
  commissionPercent: Prisma.Decimal | null;
  fixedCommissionAmount: Prisma.Decimal | null;
  isAffiliateAvailable: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  maximumCommission: Prisma.Decimal | null;
}

function parseOptionalDecimal(raw: unknown, fieldLabel: string, min = 0): Prisma.Decimal | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const num = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(num) || num < min) throw new AffiliateProductSettingError(`${fieldLabel} must be a valid number of at least ${min}.`);
  return new Prisma.Decimal(num);
}

function parseOptionalDate(raw: unknown, fieldLabel: string): Date | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const date = new Date(raw as string);
  if (Number.isNaN(date.getTime())) throw new AffiliateProductSettingError(`${fieldLabel} is not a valid date.`);
  return date;
}

function parseSettingFields(input: AffiliateProductSettingInput): ParsedSettingFields {
  if (input.commissionType !== "PERCENTAGE" && input.commissionType !== "FIXED_AMOUNT") {
    throw new AffiliateProductSettingError("commissionType must be PERCENTAGE or FIXED_AMOUNT.");
  }
  const commissionType = input.commissionType as AffiliateProductCommissionType;

  const commissionPercent = parseOptionalDecimal(input.commissionPercent, "commissionPercent");
  const fixedCommissionAmount = parseOptionalDecimal(input.fixedCommissionAmount, "fixedCommissionAmount");

  if (commissionType === "PERCENTAGE") {
    if (commissionPercent !== null && commissionPercent.gt(100)) {
      throw new AffiliateProductSettingError("commissionPercent cannot exceed 100.");
    }
    if (fixedCommissionAmount !== null) {
      throw new AffiliateProductSettingError("fixedCommissionAmount must not be set when commissionType is PERCENTAGE.");
    }
  } else {
    if (fixedCommissionAmount === null) {
      throw new AffiliateProductSettingError("fixedCommissionAmount is required when commissionType is FIXED_AMOUNT.");
    }
    if (commissionPercent !== null) {
      throw new AffiliateProductSettingError("commissionPercent must not be set when commissionType is FIXED_AMOUNT.");
    }
  }

  const maximumCommission = parseOptionalDecimal(input.maximumCommission, "maximumCommission");
  const startsAt = parseOptionalDate(input.startsAt, "startsAt");
  const endsAt = parseOptionalDate(input.endsAt, "endsAt");
  if (startsAt && endsAt && startsAt > endsAt) {
    throw new AffiliateProductSettingError("startsAt must be before endsAt.");
  }

  const isAffiliateAvailable = input.isAffiliateAvailable === undefined ? true : Boolean(input.isAffiliateAvailable);

  return { commissionType, commissionPercent, fixedCommissionAmount, isAffiliateAvailable, startsAt, endsAt, maximumCommission };
}

// ---------------------------------------------------------------------------
// Create — the searchable Product picker on the admin UI supplies a real
// productId; a duplicate is rejected both here (a friendly message) and
// by the schema's own @unique(productId) constraint (defense in depth,
// same discipline every other "add once" flow in this backend follows).
// ---------------------------------------------------------------------------

export async function createAffiliateProductSetting(productId: unknown, input: AffiliateProductSettingInput): Promise<AffiliateProductSettingOutput> {
  if (typeof productId !== "string" || productId.trim().length === 0) {
    throw new AffiliateProductSettingError("productId is required.");
  }

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw new AffiliateProductSettingError(`Product not found: ${productId}`, 404);

  const existing = await prisma.affiliateProductSetting.findUnique({ where: { productId } });
  if (existing) throw new AffiliateProductSettingError("This product is already in the Affiliate Products list.", 409);

  const fields = parseSettingFields(input);

  const created = await prisma.affiliateProductSetting.create({
    data: { productId, ...fields },
    include: settingWithProductInclude,
  });

  return toOutput(created);
}

export async function updateAffiliateProductSetting(id: string, input: AffiliateProductSettingInput): Promise<AffiliateProductSettingOutput> {
  const existing = await prisma.affiliateProductSetting.findUnique({ where: { id } });
  if (!existing) throw new AffiliateProductSettingError(`Affiliate product setting not found: ${id}`, 404);

  const fields = parseSettingFields(input);

  const updated = await prisma.affiliateProductSetting.update({
    where: { id },
    data: fields,
    include: settingWithProductInclude,
  });

  return toOutput(updated);
}

// Hard delete is safe here — OrderAffiliateProductCommission never
// references AffiliateProductSetting by foreign key at all (every field
// it needs is snapshotted at order-creation time), so removing a
// product from the Affiliate Products list can never cascade into or
// alter historical commission rows. See OrderAffiliateProductCommission's
// own schema comment.
export async function deleteAffiliateProductSetting(id: string): Promise<void> {
  const existing = await prisma.affiliateProductSetting.findUnique({ where: { id } });
  if (!existing) throw new AffiliateProductSettingError(`Affiliate product setting not found: ${id}`, 404);
  await prisma.affiliateProductSetting.delete({ where: { id } });
}
