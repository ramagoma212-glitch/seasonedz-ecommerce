// Version 7, Milestone 66: admin product management. Deliberately its
// own service file, separate from product.service.ts (which stays the
// public, unauthenticated read path — VISIBLE_STATUSES-filtered,
// costPrice never exposed) and from adminDashboard.service.ts (which
// stays 100% read queries). This is the one place in the codebase
// that writes Product rows.
//
// No schema change was needed for this milestone — every field this
// service reads or writes already exists on Product/Category exactly
// as designed in VERSION_7_PRODUCT_MANAGEMENT_PLAN.md.

import { Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export class AdminProductError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AdminProductError";
    this.statusCode = statusCode;
  }
}

const MAX_FEATURE_ITEMS = 20;
const MAX_FEATURE_ITEM_LENGTH = 200;
const MAX_SHORT_TEXT_LENGTH = 200;
const MAX_LONG_TEXT_LENGTH = 5000;

// ---------------------------------------------------------------------------
// Field-level validation helpers. Every one of these throws
// AdminProductError (never a raw Error) so the controller can turn it
// into a clean 400 — same pattern as OrderStatusUpdateError in
// adminOrderStatus.service.ts.
// ---------------------------------------------------------------------------

function requireTrimmedString(raw: unknown, fieldName: string, maxLength = MAX_SHORT_TEXT_LENGTH): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new AdminProductError(`${fieldName} is required.`);
  }
  const trimmed = raw.trim();
  if (trimmed.length > maxLength) {
    throw new AdminProductError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
}

function optionalTrimmedString(raw: unknown, fieldName: string, maxLength = MAX_LONG_TEXT_LENGTH): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    throw new AdminProductError(`${fieldName} must be a string.`);
  }
  const trimmed = raw.trim();
  if (trimmed.length > maxLength) {
    throw new AdminProductError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return trimmed.length > 0 ? trimmed : null;
}

function requirePositiveNumber(raw: unknown, fieldName: string): number {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value <= 0) {
    throw new AdminProductError(`${fieldName} must be a number greater than 0.`);
  }
  return value;
}

function optionalPositiveNumber(raw: unknown, fieldName: string): number | null {
  if (raw === undefined || raw === null) return null;
  return requirePositiveNumber(raw, fieldName);
}

function requiredNonNegativeInteger(raw: unknown, fieldName: string): number {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value < 0) {
    throw new AdminProductError(`${fieldName} must be a whole number of 0 or more.`);
  }
  return value;
}

function nonNegativeIntegerWithDefault(raw: unknown, fieldName: string, fallback: number): number {
  if (raw === undefined || raw === null) return fallback;
  return requiredNonNegativeInteger(raw, fieldName);
}

function parseStatus(raw: unknown): ProductStatus {
  if (typeof raw !== "string" || !(Object.values(ProductStatus) as string[]).includes(raw)) {
    throw new AdminProductError("status must be a valid product status.");
  }
  return raw as ProductStatus;
}

function optionalStatus(raw: unknown): ProductStatus | undefined {
  if (raw === undefined || raw === null) return undefined;
  return parseStatus(raw);
}

// features is stored as a loose Json column (per the schema's own
// comment: "the exact shape may evolve") but every existing use
// (seed.ts) is a flat array of short bullet-point strings — validated
// as exactly that here, never trusted as arbitrary JSON, and never
// rendered as HTML by any consumer of this field (the future admin
// and storefront UIs must keep escaping it, matching this project's
// existing escapeHtml() discipline).
function parseFeatures(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) {
    throw new AdminProductError("features must be an array of short text bullet points.");
  }
  if (raw.length > MAX_FEATURE_ITEMS) {
    throw new AdminProductError(`features cannot have more than ${MAX_FEATURE_ITEMS} items.`);
  }
  return raw.map((item, index) => {
    if (typeof item !== "string") {
      throw new AdminProductError(`features[${index}] must be a string.`);
    }
    const trimmed = item.trim();
    if (trimmed.length === 0) {
      throw new AdminProductError(`features[${index}] cannot be empty.`);
    }
    if (trimmed.length > MAX_FEATURE_ITEM_LENGTH) {
      throw new AdminProductError(`features[${index}] must be ${MAX_FEATURE_ITEM_LENGTH} characters or fewer.`);
    }
    return trimmed;
  });
}

// ---------------------------------------------------------------------------
// Slug handling. Decision (documented here, not just in code): if the
// admin explicitly supplies a slug, a collision is a 409 — explicit
// input deserves clear feedback, never a silent rewrite. If no slug is
// supplied, one is generated from `name` and, on collision, a numeric
// suffix is appended automatically — friendlier for the common "just
// let it default" path, and safe because nothing the admin typed is
// being silently changed.
// ---------------------------------------------------------------------------

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const MAX_SLUG_GENERATION_ATTEMPTS = 50;

async function generateUniqueSlug(base: string): Promise<string> {
  const baseSlug = slugify(base);
  if (!baseSlug) {
    throw new AdminProductError("Could not generate a slug from the product name — please provide one manually.");
  }

  let candidate = baseSlug;
  let suffix = 2;
  for (let attempt = 0; attempt < MAX_SLUG_GENERATION_ATTEMPTS; attempt++) {
    const existing = await prisma.product.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  throw new AdminProductError("Could not generate a unique slug automatically — please provide one manually.");
}

// ---------------------------------------------------------------------------
// List (admin — every status, unlike the public product list which
// only ever shows ACTIVE/OUT_OF_STOCK via product.service.ts's
// VISIBLE_STATUSES).
// ---------------------------------------------------------------------------

const adminProductListSelect = {
  id: true,
  name: true,
  slug: true,
  sku: true,
  price: true,
  oldPrice: true,
  stockQuantity: true,
  lowStockThreshold: true,
  status: true,
  isFeatured: true,
  isBestSeller: true,
  isNewArrival: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ProductSelect;

type AdminProductListRow = Prisma.ProductGetPayload<{ select: typeof adminProductListSelect }>;

export interface AdminProductListItem {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  price: number;
  oldPrice: number | null;
  stockQuantity: number;
  lowStockThreshold: number;
  status: ProductStatus;
  category: { id: string; name: string; slug: string };
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toAdminProductListItem(product: AdminProductListRow): AdminProductListItem {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    price: product.price.toNumber(),
    oldPrice: product.oldPrice ? product.oldPrice.toNumber() : null,
    stockQuantity: product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold,
    status: product.status,
    category: product.category,
    isFeatured: product.isFeatured,
    isBestSeller: product.isBestSeller,
    isNewArrival: product.isNewArrival,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export interface AdminProductListFilters {
  page: number;
  limit: number;
  status?: ProductStatus;
  categoryId?: string;
  search?: string;
}

export interface AdminProductListResult {
  products: AdminProductListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function buildAdminProductWhere(filters: AdminProductListFilters): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];

  if (filters.status) and.push({ status: filters.status });
  if (filters.categoryId) and.push({ categoryId: filters.categoryId });
  if (filters.search) {
    and.push({
      OR: [
        { name: { contains: filters.search, mode: "insensitive" } },
        { sku: { contains: filters.search, mode: "insensitive" } },
        { slug: { contains: filters.search, mode: "insensitive" } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

export async function listProductsForAdmin(filters: AdminProductListFilters): Promise<AdminProductListResult> {
  const where = buildAdminProductWhere(filters);

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      select: adminProductListSelect,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return {
    products: products.map(toAdminProductListItem),
    total,
    page: filters.page,
    limit: filters.limit,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
  };
}

// ---------------------------------------------------------------------------
// Detail (admin). costPrice is deliberately never selected or returned
// here — the plan (Section 6) said to leave it out if unsure, and this
// matches the public API's own existing, already-reviewed discipline
// of never exposing costPrice (product.service.ts's toProductOutput
// never includes it either). Revisiting this for a future margin-
// reporting feature is a separate, deliberate decision, not assumed.
// ---------------------------------------------------------------------------

const adminProductDetailInclude = {
  category: { select: { id: true, name: true, slug: true } },
  images: {
    orderBy: { sortOrder: "asc" },
    select: { url: true, altText: true, isPrimary: true, sortOrder: true },
  },
} satisfies Prisma.ProductInclude;

type AdminProductDetailRow = Prisma.ProductGetPayload<{ include: typeof adminProductDetailInclude }>;

export interface AdminProductDetail {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  shortDescription: string | null;
  description: string | null;
  price: number;
  oldPrice: number | null;
  stockQuantity: number;
  lowStockThreshold: number;
  status: ProductStatus;
  categoryId: string;
  category: { id: string; name: string; slug: string };
  ageRange: string | null;
  features: Prisma.JsonValue | null;
  discountLabel: string | null;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  images: { url: string; altText: string | null; isPrimary: boolean; sortOrder: number }[];
  createdAt: Date;
  updatedAt: Date;
}

function toAdminProductDetail(product: AdminProductDetailRow): AdminProductDetail {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    shortDescription: product.shortDescription,
    description: product.description,
    price: product.price.toNumber(),
    oldPrice: product.oldPrice ? product.oldPrice.toNumber() : null,
    stockQuantity: product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold,
    status: product.status,
    categoryId: product.categoryId,
    category: product.category,
    ageRange: product.ageRange,
    features: product.features,
    discountLabel: product.discountLabel,
    isFeatured: product.isFeatured,
    isBestSeller: product.isBestSeller,
    isNewArrival: product.isNewArrival,
    images: product.images,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export async function getProductForAdmin(id: string): Promise<AdminProductDetail | null> {
  const product = await prisma.product.findUnique({
    where: { id },
    include: adminProductDetailInclude,
  });

  return product ? toAdminProductDetail(product) : null;
}

// ---------------------------------------------------------------------------
// Create. New products default to DRAFT (per the plan, Section 6) so
// nothing goes live accidentally before the admin is ready. No image
// is created by this route — ProductImage rows are entirely out of
// scope until the image-upload milestones (68-69).
// ---------------------------------------------------------------------------

export interface AdminProductCreateInput {
  name?: unknown;
  slug?: unknown;
  sku?: unknown;
  categoryId?: unknown;
  shortDescription?: unknown;
  description?: unknown;
  price?: unknown;
  oldPrice?: unknown;
  stockQuantity?: unknown;
  lowStockThreshold?: unknown;
  status?: unknown;
  ageRange?: unknown;
  features?: unknown;
  discountLabel?: unknown;
  isFeatured?: unknown;
  isBestSeller?: unknown;
  isNewArrival?: unknown;
}

export async function createProduct(rawInput: unknown): Promise<AdminProductDetail> {
  if (typeof rawInput !== "object" || rawInput === null) {
    throw new AdminProductError("Request body must be an object.");
  }
  const input = rawInput as AdminProductCreateInput;

  const name = requireTrimmedString(input.name, "name");
  const sku = requireTrimmedString(input.sku, "sku");
  const categoryId = requireTrimmedString(input.categoryId, "categoryId");
  const price = requirePositiveNumber(input.price, "price");
  const oldPrice = optionalPositiveNumber(input.oldPrice, "oldPrice");
  const stockQuantity = nonNegativeIntegerWithDefault(input.stockQuantity, "stockQuantity", 0);
  const lowStockThreshold = nonNegativeIntegerWithDefault(input.lowStockThreshold, "lowStockThreshold", 5);
  const status = optionalStatus(input.status) ?? ProductStatus.DRAFT;
  const shortDescription = optionalTrimmedString(input.shortDescription, "shortDescription", MAX_SHORT_TEXT_LENGTH);
  const description = optionalTrimmedString(input.description, "description", MAX_LONG_TEXT_LENGTH);
  const ageRange = optionalTrimmedString(input.ageRange, "ageRange", MAX_SHORT_TEXT_LENGTH);
  const discountLabel = optionalTrimmedString(input.discountLabel, "discountLabel", MAX_SHORT_TEXT_LENGTH);
  const features = parseFeatures(input.features);
  const isFeatured = Boolean(input.isFeatured);
  const isBestSeller = Boolean(input.isBestSeller);
  const isNewArrival = Boolean(input.isNewArrival);

  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!category) {
    throw new AdminProductError("categoryId does not match an existing category.");
  }

  const existingSku = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
  if (existingSku) {
    throw new AdminProductError(`SKU already in use: ${sku}`, 409);
  }

  let slug: string;
  const requestedSlug = optionalTrimmedString(input.slug, "slug", MAX_SHORT_TEXT_LENGTH);
  if (requestedSlug) {
    const normalizedSlug = slugify(requestedSlug);
    if (!normalizedSlug) {
      throw new AdminProductError("slug is not valid.");
    }
    const existingSlug = await prisma.product.findUnique({ where: { slug: normalizedSlug }, select: { id: true } });
    if (existingSlug) {
      throw new AdminProductError(`Slug already in use: ${normalizedSlug}`, 409);
    }
    slug = normalizedSlug;
  } else {
    slug = await generateUniqueSlug(name);
  }

  const product = await prisma.product.create({
    data: {
      name,
      slug,
      sku,
      categoryId,
      shortDescription,
      description,
      price,
      oldPrice,
      stockQuantity,
      lowStockThreshold,
      status,
      ageRange,
      features,
      discountLabel,
      isFeatured,
      isBestSeller,
      isNewArrival,
    },
    include: adminProductDetailInclude,
  });

  return toAdminProductDetail(product);
}

// ---------------------------------------------------------------------------
// Update. Only fields in ALLOWED_UPDATE_FIELDS are ever accepted — id,
// createdAt, updatedAt, sku, slug, ratingAverage, reviewCount, and
// costPrice are all deliberately absent from this list, so submitting
// any of them (or any unrecognised key) is rejected with a clear 400
// rather than silently ignored or silently applied. This is the
// enforcement of VERSION_7_PRODUCT_MANAGEMENT_PLAN.md Section 7's
// restricted-fields list — not just a comment, a runtime check.
// ---------------------------------------------------------------------------

const ALLOWED_UPDATE_FIELDS = [
  "name",
  "shortDescription",
  "description",
  "price",
  "oldPrice",
  "stockQuantity",
  "lowStockThreshold",
  "status",
  "categoryId",
  "ageRange",
  "features",
  "discountLabel",
  "isFeatured",
  "isBestSeller",
  "isNewArrival",
] as const;

export async function updateProduct(id: string, rawInput: unknown): Promise<AdminProductDetail> {
  const existing = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AdminProductError(`Product not found: ${id}`, 404);
  }

  if (typeof rawInput !== "object" || rawInput === null) {
    throw new AdminProductError("Request body must be an object.");
  }
  const input = rawInput as Record<string, unknown>;

  const disallowedKeys = Object.keys(input).filter(
    (key) => !(ALLOWED_UPDATE_FIELDS as readonly string[]).includes(key)
  );
  if (disallowedKeys.length > 0) {
    throw new AdminProductError(`These fields cannot be edited: ${disallowedKeys.join(", ")}.`);
  }

  const data: Prisma.ProductUpdateInput = {};

  if ("name" in input) data.name = requireTrimmedString(input.name, "name");
  if ("shortDescription" in input) data.shortDescription = optionalTrimmedString(input.shortDescription, "shortDescription", MAX_SHORT_TEXT_LENGTH);
  if ("description" in input) data.description = optionalTrimmedString(input.description, "description", MAX_LONG_TEXT_LENGTH);
  if ("price" in input) data.price = requirePositiveNumber(input.price, "price");
  if ("oldPrice" in input) data.oldPrice = optionalPositiveNumber(input.oldPrice, "oldPrice");
  if ("stockQuantity" in input) data.stockQuantity = requiredNonNegativeInteger(input.stockQuantity, "stockQuantity");
  if ("lowStockThreshold" in input) data.lowStockThreshold = requiredNonNegativeInteger(input.lowStockThreshold, "lowStockThreshold");
  if ("status" in input) data.status = parseStatus(input.status);
  if ("ageRange" in input) data.ageRange = optionalTrimmedString(input.ageRange, "ageRange", MAX_SHORT_TEXT_LENGTH);
  if ("discountLabel" in input) data.discountLabel = optionalTrimmedString(input.discountLabel, "discountLabel", MAX_SHORT_TEXT_LENGTH);
  if ("features" in input) data.features = parseFeatures(input.features) ?? Prisma.JsonNull;
  if ("isFeatured" in input) data.isFeatured = Boolean(input.isFeatured);
  if ("isBestSeller" in input) data.isBestSeller = Boolean(input.isBestSeller);
  if ("isNewArrival" in input) data.isNewArrival = Boolean(input.isNewArrival);

  if ("categoryId" in input) {
    const categoryId = requireTrimmedString(input.categoryId, "categoryId");
    const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!category) {
      throw new AdminProductError("categoryId does not match an existing category.");
    }
    data.category = { connect: { id: categoryId } };
  }

  if (Object.keys(data).length === 0) {
    throw new AdminProductError("No editable fields were provided.");
  }

  // Deliberately never touches OrderItem — every past order already
  // snapshots productName/productSlug/sku/unitPrice at the time of
  // purchase (order.service.ts), so nothing this function does can
  // retroactively change what a historical order says the customer
  // bought or paid.
  const updated = await prisma.product.update({
    where: { id },
    data,
    include: adminProductDetailInclude,
  });

  return toAdminProductDetail(updated);
}
