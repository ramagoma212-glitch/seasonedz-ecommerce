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

import { Prisma, ProductStatus, ProductType } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { sanitizeDescriptionHtml, countVisibleCharacters } from "../utils/descriptionSanitizer.js";
import { notifyStockAlertSubscribersForProduct } from "./stockAlert.service.js";
import { notifyWishlistStockAlertsForProduct } from "./wishlist.service.js";
import { validatePreorderConfig, derivePreorderAdminStatus, PreorderConfigError, type PreorderAdminStatus } from "./preorder.service.js";

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
// Version 7, Milestone 146: the Full Description rich text field's own
// limit, counted in *visible* characters (HTML tags excluded) — see
// utils/descriptionSanitizer.ts. Kept separate from MAX_LONG_TEXT_LENGTH
// above (unaffected, still used by nothing else) since the two fields
// now count length completely differently.
const MAX_DESCRIPTION_VISIBLE_LENGTH = 5000;

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

// Version 7, Milestone 146: the one place `description` is ever
// written from admin input — sanitises to the approved rich-text
// allowlist first (see utils/descriptionSanitizer.ts), then enforces
// the 5,000-*visible*-character limit against the sanitised result,
// never the raw input. A legacy plain-text description round-trips
// through sanitizeHtml() unchanged (nothing to strip or escape beyond
// the entities it already handles), so this needs no separate
// "is this old data" branch.
function optionalDescriptionHtml(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    throw new AdminProductError("description must be a string.");
  }
  if (raw.trim().length === 0) return null;

  const sanitized = sanitizeDescriptionHtml(raw);
  const visibleLength = countVisibleCharacters(sanitized);
  if (visibleLength > MAX_DESCRIPTION_VISIBLE_LENGTH) {
    throw new AdminProductError(`description must be ${MAX_DESCRIPTION_VISIBLE_LENGTH} visible characters or fewer (found ${visibleLength}).`);
  }
  return sanitized.length > 0 ? sanitized : null;
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

// Version 7, Milestone 152: secure digital downloads.
function parseProductType(raw: unknown): ProductType {
  if (typeof raw !== "string" || !(Object.values(ProductType) as string[]).includes(raw)) {
    throw new AdminProductError("productType must be PHYSICAL or DIGITAL.");
  }
  return raw as ProductType;
}

function optionalProductType(raw: unknown): ProductType | undefined {
  if (raw === undefined || raw === null) return undefined;
  return parseProductType(raw);
}

// Milestone 181, Part C: same "empty means null" convention
// adminAffiliateProductSetting.service.ts's own parseOptionalDate()
// already established for startsAt/endsAt on that form.
function optionalPreorderDate(raw: unknown, fieldLabel: string): Date | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const date = new Date(raw as string);
  if (Number.isNaN(date.getTime())) throw new AdminProductError(`${fieldLabel} is not a valid date.`);
  return date;
}

// A DIGITAL product must have a real, active file attached before it
// can ever be ACTIVE (visible/purchasable on the storefront) — a
// customer paying for a digital download that doesn't exist yet is
// exactly the failure mode this guards against. Never checked for
// PHYSICAL products, and never requires a file for DRAFT/ARCHIVED/
// OUT_OF_STOCK — an owner can prepare a digital product's text/price/
// images first and upload the file whenever it's ready, in any order.
async function assertDigitalProductHasFileIfActive(productId: string | null, productType: ProductType, status: ProductStatus): Promise<void> {
  if (productType !== ProductType.DIGITAL || status !== ProductStatus.ACTIVE) return;

  if (!productId) {
    // A brand-new product can never already have an uploaded file —
    // file upload requires an existing product id (see
    // adminDigitalAsset.service.ts) — so creating straight into ACTIVE
    // is never possible for a digital product.
    throw new AdminProductError(
      "A digital product cannot be created as Active. Save it first as Draft, then upload its digital file before activating it."
    );
  }

  const asset = await prisma.digitalAsset.findUnique({ where: { productId }, select: { isActive: true } });
  if (!asset || !asset.isActive) {
    throw new AdminProductError(
      "This digital product cannot be Active until a digital file has been uploaded and is active."
    );
  }
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
    throw new AdminProductError("Could not generate a slug from the product name. Please provide one manually.");
  }

  let candidate = baseSlug;
  let suffix = 2;
  for (let attempt = 0; attempt < MAX_SLUG_GENERATION_ATTEMPTS; attempt++) {
    const existing = await prisma.product.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  throw new AdminProductError("Could not generate a unique slug automatically. Please provide one manually.");
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
  // Version 7, Milestone 152: secure digital downloads.
  productType: true,
  digitalAsset: { select: { id: true, isActive: true } },
  // Milestone 181, Part C: enough to derive preorderAdminStatus without
  // a second query — see toAdminProductListItem() below.
  isPreorderEnabled: true,
  preorderStartAt: true,
  preorderEndAt: true,
  preorderReleaseAt: true,
  isPreorderDiscountEligible: true,
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
  productType: ProductType;
  hasDigitalFile: boolean;
  // True only for the specific dangerous combination this milestone's
  // validation is meant to prevent from ever being saved — surfaced
  // here too so the admin list itself flags it at a glance if it's
  // somehow ever reached (e.g. a file removed by other means).
  digitalFileMissingWarning: boolean;
  // Milestone 181, Part C: "Normal Sale" | "Preorder Scheduled" |
  // "Preorder Active" | "Preorder Ended" — always calculated fresh from
  // configuration + current server time, never a stored field that
  // could go stale (see preorder.service.ts's own comment).
  preorderAdminStatus: PreorderAdminStatus;
  isPreorderEnabled: boolean;
}

function toAdminProductListItem(product: AdminProductListRow): AdminProductListItem {
  const hasDigitalFile = Boolean(product.digitalAsset?.isActive);
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
    productType: product.productType,
    hasDigitalFile,
    digitalFileMissingWarning: product.productType === ProductType.DIGITAL && product.status === ProductStatus.ACTIVE && !hasDigitalFile,
    preorderAdminStatus: derivePreorderAdminStatus(product),
    isPreorderEnabled: product.isPreorderEnabled,
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
  productType: ProductType;
  digitalTermsNote: string | null;
  downloadEnabled: boolean;
  // Milestone 181, Part C.
  isPreorderEnabled: boolean;
  preorderStartAt: Date | null;
  preorderEndAt: Date | null;
  preorderReleaseAt: Date | null;
  isPreorderDiscountEligible: boolean;
  preorderAdminStatus: PreorderAdminStatus;
}

// Version 7, Milestone 146 (second review fix): sanitised again here,
// on every admin read, for the same reason product.service.ts's public
// toProductOutput() now does — optionalDescriptionHtml() above only
// ever sanitises a description at the moment it's saved, so a row
// written before this milestone existed (or written any other way that
// bypassed this service) could still hold unsafe raw HTML. Without
// this, the admin's own browser — not just customers' — would receive
// that unsafe HTML when opening the edit page, before the rich text
// editor ever gets a chance to touch it. Idempotent on an
// already-sanitised or plain-text description (nothing changes), so
// this is safe to apply unconditionally on every read regardless of
// which of createProduct/updateProduct/getProductForAdmin called it.
function sanitizeAdminDescription(description: string | null): string | null {
  if (!description) return description;
  return sanitizeDescriptionHtml(description);
}

function toAdminProductDetail(product: AdminProductDetailRow): AdminProductDetail {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    shortDescription: product.shortDescription,
    description: sanitizeAdminDescription(product.description),
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
    productType: product.productType,
    digitalTermsNote: product.digitalTermsNote,
    downloadEnabled: product.downloadEnabled,
    isPreorderEnabled: product.isPreorderEnabled,
    preorderStartAt: product.preorderStartAt,
    preorderEndAt: product.preorderEndAt,
    preorderReleaseAt: product.preorderReleaseAt,
    isPreorderDiscountEligible: product.isPreorderDiscountEligible,
    preorderAdminStatus: derivePreorderAdminStatus(product),
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
  productType?: unknown;
  digitalTermsNote?: unknown;
  downloadEnabled?: unknown;
  isPreorderEnabled?: unknown;
  preorderStartAt?: unknown;
  preorderEndAt?: unknown;
  preorderReleaseAt?: unknown;
  isPreorderDiscountEligible?: unknown;
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
  const description = optionalDescriptionHtml(input.description);
  const ageRange = optionalTrimmedString(input.ageRange, "ageRange", MAX_SHORT_TEXT_LENGTH);
  const discountLabel = optionalTrimmedString(input.discountLabel, "discountLabel", MAX_SHORT_TEXT_LENGTH);
  const features = parseFeatures(input.features);
  const isFeatured = Boolean(input.isFeatured);
  const isBestSeller = Boolean(input.isBestSeller);
  const isNewArrival = Boolean(input.isNewArrival);
  const productType = optionalProductType(input.productType) ?? ProductType.PHYSICAL;
  const digitalTermsNote = optionalTrimmedString(input.digitalTermsNote, "digitalTermsNote", MAX_LONG_TEXT_LENGTH);
  const downloadEnabled = input.downloadEnabled === undefined ? true : Boolean(input.downloadEnabled);
  const isPreorderEnabled = Boolean(input.isPreorderEnabled);
  const preorderStartAt = optionalPreorderDate(input.preorderStartAt, "preorderStartAt");
  const preorderEndAt = optionalPreorderDate(input.preorderEndAt, "preorderEndAt");
  const preorderReleaseAt = optionalPreorderDate(input.preorderReleaseAt, "preorderReleaseAt");
  const isPreorderDiscountEligible = Boolean(input.isPreorderDiscountEligible);

  await assertDigitalProductHasFileIfActive(null, productType, status);
  try {
    validatePreorderConfig({ isPreorderEnabled, preorderStartAt, preorderEndAt, preorderReleaseAt, isPreorderDiscountEligible });
  } catch (error) {
    if (error instanceof PreorderConfigError) throw new AdminProductError(error.message, error.statusCode);
    throw error;
  }

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
      productType,
      digitalTermsNote,
      downloadEnabled,
      isPreorderEnabled,
      preorderStartAt,
      preorderEndAt,
      preorderReleaseAt,
      isPreorderDiscountEligible,
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
  "productType",
  "digitalTermsNote",
  "downloadEnabled",
  "isPreorderEnabled",
  "preorderStartAt",
  "preorderEndAt",
  "preorderReleaseAt",
  "isPreorderDiscountEligible",
] as const;

export async function updateProduct(id: string, rawInput: unknown): Promise<AdminProductDetail> {
  const existing = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      productType: true,
      status: true,
      stockQuantity: true,
      isPreorderEnabled: true,
      preorderStartAt: true,
      preorderEndAt: true,
      preorderReleaseAt: true,
      isPreorderDiscountEligible: true,
    },
  });
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
  if ("description" in input) data.description = optionalDescriptionHtml(input.description);
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
  if ("productType" in input) data.productType = parseProductType(input.productType);
  if ("digitalTermsNote" in input) data.digitalTermsNote = optionalTrimmedString(input.digitalTermsNote, "digitalTermsNote", MAX_LONG_TEXT_LENGTH);
  if ("downloadEnabled" in input) data.downloadEnabled = Boolean(input.downloadEnabled);
  if ("isPreorderEnabled" in input) data.isPreorderEnabled = Boolean(input.isPreorderEnabled);
  if ("preorderStartAt" in input) data.preorderStartAt = optionalPreorderDate(input.preorderStartAt, "preorderStartAt");
  if ("preorderEndAt" in input) data.preorderEndAt = optionalPreorderDate(input.preorderEndAt, "preorderEndAt");
  if ("preorderReleaseAt" in input) data.preorderReleaseAt = optionalPreorderDate(input.preorderReleaseAt, "preorderReleaseAt");
  if ("isPreorderDiscountEligible" in input) data.isPreorderDiscountEligible = Boolean(input.isPreorderDiscountEligible);

  // Milestone 181, Part C: same "EFFECTIVE" merged-value discipline as
  // productType/status below — an update that only touches ONE
  // preorder field (e.g. just flipping isPreorderEnabled) is still
  // validated against the row's own existing values for every field it
  // didn't touch, never just the ones named in this one request.
  try {
    validatePreorderConfig({
      isPreorderEnabled: "isPreorderEnabled" in input ? Boolean(data.isPreorderEnabled) : existing.isPreorderEnabled,
      preorderStartAt: "preorderStartAt" in input ? (data.preorderStartAt as Date | null) : existing.preorderStartAt,
      preorderEndAt: "preorderEndAt" in input ? (data.preorderEndAt as Date | null) : existing.preorderEndAt,
      preorderReleaseAt: "preorderReleaseAt" in input ? (data.preorderReleaseAt as Date | null) : existing.preorderReleaseAt,
      isPreorderDiscountEligible: "isPreorderDiscountEligible" in input ? Boolean(data.isPreorderDiscountEligible) : existing.isPreorderDiscountEligible,
    });
  } catch (error) {
    if (error instanceof PreorderConfigError) throw new AdminProductError(error.message, error.statusCode);
    throw error;
  }

  // Version 7, Milestone 152: checked against the EFFECTIVE productType/
  // status this update would result in — either value may come from this
  // request or, if not included, from the row as it already exists —
  // never just the values named directly in this one request, so a
  // request that only sets status: ACTIVE on an already-DIGITAL product
  // is validated exactly the same as one that sets both fields together.
  const effectiveProductType = ("productType" in input ? (data.productType as ProductType) : existing.productType);
  const effectiveStatus = ("status" in input ? (data.status as ProductStatus) : existing.status);
  await assertDigitalProductHasFileIfActive(id, effectiveProductType, effectiveStatus);

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

  // Version 7, Milestone 174C, brief section 24: fires strictly after
  // the write above has committed, only on a genuine 0 -> positive
  // transition (never merely "stock is currently positive," which
  // would re-fire on every unrelated edit to an already-in-stock
  // product). Fire-and-forget — a stock-alert failure must never
  // affect the product update this function is already committed to
  // returning successfully.
  if (existing.stockQuantity === 0 && updated.stockQuantity > 0) {
    void notifyStockAlertSubscribersForProduct(id).catch((error) => {
      console.warn(`[notifications] failed to notify stock-alert subscribers for product=${id}: ${error instanceof Error ? error.message : "Unknown error"}`);
    });
    void notifyWishlistStockAlertsForProduct(id).catch((error) => {
      console.warn(`[notifications] failed to notify wishlist stock alerts for product=${id}: ${error instanceof Error ? error.message : "Unknown error"}`);
    });
  }

  return toAdminProductDetail(updated);
}
