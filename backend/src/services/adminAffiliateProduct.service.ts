// Version 7, Milestone 172B: admin management of affiliate recommendation
// products. Deliberately its own service, following the same shape as
// adminProduct.service.ts — the one place in the codebase that writes
// AffiliateProduct rows. No public route reads or writes any of this
// yet (see routes/adminAffiliate.routes.ts's own header comment); the
// public listing and the /go/:trackingSlug redirect are Milestone 172C.
//
// AffiliateProduct is deliberately never related to Product or
// Category — see the 172A architecture audit's own Phase 2/4 findings.
// Nothing in this file ever writes to, or even imports, product.service.ts,
// order.service.ts, or any cart/checkout/Merchant-feed code — that
// absence is itself the direct-store separation this milestone exists
// to prove.

import { Prisma, CommissionStatus } from "@prisma/client";
import sanitizeHtml from "sanitize-html";
import { prisma } from "../config/prisma.js";
import { validateAffiliateUrl } from "../validators/affiliateUrl.validator.js";

export class AdminAffiliateProductError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AdminAffiliateProductError";
    this.statusCode = statusCode;
  }
}

const MAX_TITLE_LENGTH = 200;
const MAX_AUTHOR_LENGTH = 150;
const MAX_SLUG_LENGTH = 100;
const MAX_TRACKING_SLUG_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_CATEGORY_LENGTH = 100;
const MAX_MERCHANT_NAME_LENGTH = 100;
const MAX_NETWORK_LENGTH = 100;
const MAX_DISCOUNT_TEXT_LENGTH = 100;
const MAX_IMAGE_URL_LENGTH = 2000;
const MAX_RATING = 5;
const MIN_RATING = 0;

// ---------------------------------------------------------------------------
// Field-level validation helpers. Every one throws
// AdminAffiliateProductError (never a raw Error), same pattern as
// adminProduct.service.ts's AdminProductError.
// ---------------------------------------------------------------------------

// AffiliateProduct's free-text fields are plain text by design (the
// 172A audit found no rich-text editor is needed here, unlike
// Product.description) — every one of them is stripped of HTML tags
// entirely, not just given a restricted allowlist, since none of them
// is ever meant to carry formatting. This is stricter than
// descriptionSanitizer.ts's ALLOWED_TAGS on purpose: it closes stored
// XSS at the data layer itself, rather than relying only on a future
// frontend remembering to escape on render.
function stripHtml(raw: string): string {
  return sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} }).trim();
}

function requireTrimmedString(raw: unknown, fieldName: string, maxLength: number): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new AdminAffiliateProductError(`${fieldName} is required.`);
  }
  const cleaned = stripHtml(raw);
  if (cleaned.length === 0) {
    throw new AdminAffiliateProductError(`${fieldName} is required.`);
  }
  if (cleaned.length > maxLength) {
    throw new AdminAffiliateProductError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return cleaned;
}

function optionalTrimmedString(raw: unknown, fieldName: string, maxLength: number): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    throw new AdminAffiliateProductError(`${fieldName} must be a string.`);
  }
  const cleaned = stripHtml(raw);
  if (cleaned.length > maxLength) {
    throw new AdminAffiliateProductError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return cleaned.length > 0 ? cleaned : null;
}

function optionalNonNegativeNumber(raw: unknown, fieldName: string): number | null {
  if (raw === undefined || raw === null) return null;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value < 0) {
    throw new AdminAffiliateProductError(`${fieldName} must be a non-negative number.`);
  }
  return value;
}

// Owner-entered only — this function can only ever check that the
// number is *shaped* like a real rating (0-5, matching a typical
// five-star display), never that it's genuine. Truthfulness is an
// editorial discipline, not something code can verify — see the
// schema's own comment on this field and the 172A audit's "never
// fabricate a rating" finding.
function optionalRating(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value < MIN_RATING || value > MAX_RATING) {
    throw new AdminAffiliateProductError(`rating must be a number between ${MIN_RATING} and ${MAX_RATING}.`);
  }
  return value;
}

function optionalCurrency(raw: unknown): string {
  if (raw === undefined || raw === null) return "ZAR";
  if (typeof raw !== "string" || !/^[A-Za-z]{3}$/.test(raw.trim())) {
    throw new AdminAffiliateProductError("currency must be a 3-letter currency code, e.g. ZAR or USD.");
  }
  return raw.trim().toUpperCase();
}

// A "last checked" timestamp that claims a future moment can never be
// genuine — rejected rather than silently accepted, same "don't create
// misleading stale pricing" discipline the field itself exists for.
function optionalPastOrPresentDate(raw: unknown, fieldName: string): Date | null {
  if (raw === undefined || raw === null) return null;
  const date = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(date.getTime())) {
    throw new AdminAffiliateProductError(`${fieldName} must be a valid date.`);
  }
  if (date.getTime() > Date.now() + 60_000) {
    // A small tolerance for clock skew between the admin's browser and
    // this server — not a strict "exactly now" check.
    throw new AdminAffiliateProductError(`${fieldName} cannot be in the future.`);
  }
  return date;
}

function requiredSaleDate(raw: unknown): Date {
  if (raw === undefined || raw === null) {
    throw new AdminAffiliateProductError("saleDate is required.");
  }
  const date = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(date.getTime())) {
    throw new AdminAffiliateProductError("saleDate must be a valid date.");
  }
  return date;
}

function requiredNonNegativeNumber(raw: unknown, fieldName: string): number {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value < 0) {
    throw new AdminAffiliateProductError(`${fieldName} must be a non-negative number.`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Slug / tracking-slug handling. Same explicit-input-deserves-a-clear-
// 409 vs. auto-generate-with-suffix split as adminProduct.service.ts's
// own slug handling, applied to two independent unique columns here.
// ---------------------------------------------------------------------------

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const MAX_SLUG_GENERATION_ATTEMPTS = 50;

async function generateUniqueValue(base: string, maxLength: number, checkExists: (candidate: string) => Promise<boolean>): Promise<string> {
  const baseSlug = slugify(base).slice(0, maxLength);
  if (!baseSlug) {
    throw new AdminAffiliateProductError("Could not generate a URL-safe value from the title — please provide one manually.");
  }

  let candidate = baseSlug;
  let suffix = 2;
  for (let attempt = 0; attempt < MAX_SLUG_GENERATION_ATTEMPTS; attempt++) {
    if (!(await checkExists(candidate))) return candidate;
    const suffixText = `-${suffix}`;
    candidate = `${baseSlug.slice(0, maxLength - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  throw new AdminAffiliateProductError("Could not generate a unique value automatically — please provide one manually.");
}

function validateExplicitSlugFormat(raw: string, fieldName: string, maxLength: number): string {
  const normalized = slugify(raw);
  if (!normalized) {
    throw new AdminAffiliateProductError(`${fieldName} is not valid.`);
  }
  if (normalized.length > maxLength) {
    throw new AdminAffiliateProductError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// Output shape. Every field here is safe for an authenticated admin to
// see — including affiliateUrl and internal identifiers, since this is
// the ADMIN read path only. The separate, still-unbuilt public read
// path (172C) is what must strip affiliateUrl/commission data — see
// this milestone's own final report on why it's deferred.
// ---------------------------------------------------------------------------

export interface AdminAffiliateProductOutput {
  id: string;
  title: string;
  author: string | null;
  slug: string;
  trackingSlug: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  merchantName: string;
  affiliateNetwork: string | null;
  affiliateUrl: string;
  price: number | null;
  currency: string;
  priceLastCheckedAt: Date | null;
  discountText: string | null;
  rating: number | null;
  isFeatured: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type AffiliateProductRow = Prisma.AffiliateProductGetPayload<Record<string, never>>;

function toOutput(row: AffiliateProductRow): AdminAffiliateProductOutput {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    slug: row.slug,
    trackingSlug: row.trackingSlug,
    description: row.description,
    imageUrl: row.imageUrl,
    category: row.category,
    merchantName: row.merchantName,
    affiliateNetwork: row.affiliateNetwork,
    affiliateUrl: row.affiliateUrl,
    price: row.price ? row.price.toNumber() : null,
    currency: row.currency,
    priceLastCheckedAt: row.priceLastCheckedAt,
    discountText: row.discountText,
    rating: row.rating ? row.rating.toNumber() : null,
    isFeatured: row.isFeatured,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// List / detail.
// ---------------------------------------------------------------------------

export interface AdminAffiliateProductListFilters {
  page: number;
  limit: number;
  isActive?: boolean;
  search?: string;
}

export interface AdminAffiliateProductListResult {
  products: AdminAffiliateProductOutput[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function buildWhere(filters: AdminAffiliateProductListFilters): Prisma.AffiliateProductWhereInput {
  const and: Prisma.AffiliateProductWhereInput[] = [];
  if (filters.isActive !== undefined) and.push({ isActive: filters.isActive });
  if (filters.search) {
    and.push({
      OR: [
        { title: { contains: filters.search, mode: "insensitive" } },
        { author: { contains: filters.search, mode: "insensitive" } },
        { merchantName: { contains: filters.search, mode: "insensitive" } },
      ],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

// Version 7, Milestone 172B: the brief's own expected catalogue size
// (5-20 curated recommendations) doesn't need pagination to function
// correctly, but the admin list still paginates — the same shape as
// listProductsForAdmin() — since the existing admin table/list UI
// component already expects a paginated response, and a consistent
// envelope is simpler than a one-off unpaginated endpoint for what is
// still, structurally, a list.
export async function listAffiliateProductsForAdmin(filters: AdminAffiliateProductListFilters): Promise<AdminAffiliateProductListResult> {
  const where = buildWhere(filters);

  const [total, products] = await Promise.all([
    prisma.affiliateProduct.count({ where }),
    prisma.affiliateProduct.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return {
    products: products.map(toOutput),
    total,
    page: filters.page,
    limit: filters.limit,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
  };
}

export async function getAffiliateProductForAdmin(id: string): Promise<AdminAffiliateProductOutput | null> {
  const product = await prisma.affiliateProduct.findUnique({ where: { id } });
  return product ? toOutput(product) : null;
}

// ---------------------------------------------------------------------------
// Create.
// ---------------------------------------------------------------------------

export interface AdminAffiliateProductCreateInput {
  title?: unknown;
  author?: unknown;
  slug?: unknown;
  trackingSlug?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  category?: unknown;
  merchantName?: unknown;
  affiliateNetwork?: unknown;
  affiliateUrl?: unknown;
  price?: unknown;
  currency?: unknown;
  priceLastCheckedAt?: unknown;
  discountText?: unknown;
  rating?: unknown;
  isFeatured?: unknown;
  isActive?: unknown;
}

async function slugExists(candidate: string): Promise<boolean> {
  const existing = await prisma.affiliateProduct.findUnique({ where: { slug: candidate }, select: { id: true } });
  return Boolean(existing);
}

async function trackingSlugExists(candidate: string): Promise<boolean> {
  const existing = await prisma.affiliateProduct.findUnique({ where: { trackingSlug: candidate }, select: { id: true } });
  return Boolean(existing);
}

export async function createAffiliateProduct(rawInput: unknown): Promise<AdminAffiliateProductOutput> {
  if (typeof rawInput !== "object" || rawInput === null) {
    throw new AdminAffiliateProductError("Request body must be an object.");
  }
  const input = rawInput as AdminAffiliateProductCreateInput;

  const title = requireTrimmedString(input.title, "title", MAX_TITLE_LENGTH);
  const author = optionalTrimmedString(input.author, "author", MAX_AUTHOR_LENGTH);
  const description = optionalTrimmedString(input.description, "description", MAX_DESCRIPTION_LENGTH);
  const category = optionalTrimmedString(input.category, "category", MAX_CATEGORY_LENGTH);
  const merchantName = requireTrimmedString(input.merchantName, "merchantName", MAX_MERCHANT_NAME_LENGTH);
  const affiliateNetwork = optionalTrimmedString(input.affiliateNetwork, "affiliateNetwork", MAX_NETWORK_LENGTH);
  const discountText = optionalTrimmedString(input.discountText, "discountText", MAX_DISCOUNT_TEXT_LENGTH);
  const imageUrl = optionalImageUrl(input.imageUrl);
  const price = optionalNonNegativeNumber(input.price, "price");
  const currency = optionalCurrency(input.currency);
  const rating = optionalRating(input.rating);
  const isFeatured = Boolean(input.isFeatured);
  const isActive = input.isActive === undefined ? true : Boolean(input.isActive);

  const urlResult = validateAffiliateUrl(input.affiliateUrl);
  if (!urlResult.isValid) {
    throw new AdminAffiliateProductError(urlResult.error ?? "affiliateUrl is not valid.");
  }
  const affiliateUrl = urlResult.normalizedUrl as string;

  // See the "price UX" note on the update path below — the same
  // "never update a price without updating when it was checked" rule
  // applies on create.
  const explicitPriceLastCheckedAt = optionalPastOrPresentDate(input.priceLastCheckedAt, "priceLastCheckedAt");
  const priceLastCheckedAt = price !== null ? (explicitPriceLastCheckedAt ?? new Date()) : null;

  let slug: string;
  const requestedSlug = optionalTrimmedString(input.slug, "slug", MAX_SLUG_LENGTH);
  if (requestedSlug) {
    const normalized = validateExplicitSlugFormat(requestedSlug, "slug", MAX_SLUG_LENGTH);
    if (await slugExists(normalized)) {
      throw new AdminAffiliateProductError(`Slug already in use: ${normalized}`, 409);
    }
    slug = normalized;
  } else {
    slug = await generateUniqueValue(title, MAX_SLUG_LENGTH, slugExists);
  }

  let trackingSlug: string;
  const requestedTrackingSlug = optionalTrimmedString(input.trackingSlug, "trackingSlug", MAX_TRACKING_SLUG_LENGTH);
  if (requestedTrackingSlug) {
    const normalized = validateExplicitSlugFormat(requestedTrackingSlug, "trackingSlug", MAX_TRACKING_SLUG_LENGTH);
    if (await trackingSlugExists(normalized)) {
      throw new AdminAffiliateProductError(`Tracking slug already in use: ${normalized}`, 409);
    }
    trackingSlug = normalized;
  } else {
    trackingSlug = await generateUniqueValue(title, MAX_TRACKING_SLUG_LENGTH, trackingSlugExists);
  }

  const product = await prisma.affiliateProduct.create({
    data: {
      title,
      author,
      slug,
      trackingSlug,
      description,
      imageUrl,
      category,
      merchantName,
      affiliateNetwork,
      affiliateUrl,
      price,
      currency,
      priceLastCheckedAt,
      discountText,
      rating,
      isFeatured,
      isActive,
    },
  });

  return toOutput(product);
}

function optionalImageUrl(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const trimmed = raw.trim();
  if (trimmed.length > MAX_IMAGE_URL_LENGTH) {
    throw new AdminAffiliateProductError(`imageUrl must be ${MAX_IMAGE_URL_LENGTH} characters or fewer.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AdminAffiliateProductError("imageUrl must be a valid, absolute URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new AdminAffiliateProductError("imageUrl must start with https://.");
  }
  return parsed.toString();
}

// ---------------------------------------------------------------------------
// Update. Same restricted-fields discipline as adminProduct.service.ts:
// only a named allowlist of fields can ever be edited, and a field
// absent from the request body is never touched — this is exactly what
// keeps trackingSlug from ever being silently rewritten by an unrelated
// edit (e.g. changing isFeatured never touches trackingSlug, because
// "trackingSlug" simply isn't a key in that request).
// ---------------------------------------------------------------------------

const ALLOWED_UPDATE_FIELDS = [
  "title",
  "author",
  "slug",
  "trackingSlug",
  "description",
  "imageUrl",
  "category",
  "merchantName",
  "affiliateNetwork",
  "affiliateUrl",
  "price",
  "currency",
  "priceLastCheckedAt",
  "discountText",
  "rating",
  "isFeatured",
  "isActive",
] as const;

export async function updateAffiliateProduct(id: string, rawInput: unknown): Promise<AdminAffiliateProductOutput> {
  const existing = await prisma.affiliateProduct.findUnique({ where: { id }, select: { id: true, price: true } });
  if (!existing) {
    throw new AdminAffiliateProductError(`Affiliate product not found: ${id}`, 404);
  }

  if (typeof rawInput !== "object" || rawInput === null) {
    throw new AdminAffiliateProductError("Request body must be an object.");
  }
  const input = rawInput as Record<string, unknown>;

  const disallowedKeys = Object.keys(input).filter((key) => !(ALLOWED_UPDATE_FIELDS as readonly string[]).includes(key));
  if (disallowedKeys.length > 0) {
    throw new AdminAffiliateProductError(`These fields cannot be edited: ${disallowedKeys.join(", ")}.`);
  }

  const data: Prisma.AffiliateProductUpdateInput = {};

  if ("title" in input) data.title = requireTrimmedString(input.title, "title", MAX_TITLE_LENGTH);
  if ("author" in input) data.author = optionalTrimmedString(input.author, "author", MAX_AUTHOR_LENGTH);
  if ("description" in input) data.description = optionalTrimmedString(input.description, "description", MAX_DESCRIPTION_LENGTH);
  if ("imageUrl" in input) data.imageUrl = optionalImageUrl(input.imageUrl);
  if ("category" in input) data.category = optionalTrimmedString(input.category, "category", MAX_CATEGORY_LENGTH);
  if ("merchantName" in input) data.merchantName = requireTrimmedString(input.merchantName, "merchantName", MAX_MERCHANT_NAME_LENGTH);
  if ("affiliateNetwork" in input) data.affiliateNetwork = optionalTrimmedString(input.affiliateNetwork, "affiliateNetwork", MAX_NETWORK_LENGTH);
  if ("discountText" in input) data.discountText = optionalTrimmedString(input.discountText, "discountText", MAX_DISCOUNT_TEXT_LENGTH);
  if ("currency" in input) data.currency = optionalCurrency(input.currency);
  if ("rating" in input) data.rating = optionalRating(input.rating);
  if ("isFeatured" in input) data.isFeatured = Boolean(input.isFeatured);
  if ("isActive" in input) data.isActive = Boolean(input.isActive);

  if ("affiliateUrl" in input) {
    const urlResult = validateAffiliateUrl(input.affiliateUrl);
    if (!urlResult.isValid) {
      throw new AdminAffiliateProductError(urlResult.error ?? "affiliateUrl is not valid.");
    }
    data.affiliateUrl = urlResult.normalizedUrl;
  }

  // Version 7, Milestone 172B: "never claim a merchant's external price
  // is current" — if this request changes the price, and doesn't also
  // explicitly supply priceLastCheckedAt, this defaults it to now()
  // rather than leaving a stale or absent checked-at date sitting next
  // to a freshly-changed price. Clearing the price back to null also
  // clears priceLastCheckedAt — there is never a "checked at" date with
  // no price to have checked.
  if ("price" in input) {
    const price = optionalNonNegativeNumber(input.price, "price");
    data.price = price;
    if (price === null) {
      data.priceLastCheckedAt = null;
    } else if ("priceLastCheckedAt" in input) {
      data.priceLastCheckedAt = optionalPastOrPresentDate(input.priceLastCheckedAt, "priceLastCheckedAt");
    } else {
      data.priceLastCheckedAt = new Date();
    }
  } else if ("priceLastCheckedAt" in input) {
    if (existing.price === null) {
      throw new AdminAffiliateProductError("priceLastCheckedAt cannot be set without a price.");
    }
    data.priceLastCheckedAt = optionalPastOrPresentDate(input.priceLastCheckedAt, "priceLastCheckedAt");
  }

  if ("slug" in input) {
    const requested = requireTrimmedString(input.slug, "slug", MAX_SLUG_LENGTH);
    const normalized = validateExplicitSlugFormat(requested, "slug", MAX_SLUG_LENGTH);
    const owner = await prisma.affiliateProduct.findUnique({ where: { slug: normalized }, select: { id: true } });
    if (owner && owner.id !== id) {
      throw new AdminAffiliateProductError(`Slug already in use: ${normalized}`, 409);
    }
    data.slug = normalized;
  }

  if ("trackingSlug" in input) {
    const requested = requireTrimmedString(input.trackingSlug, "trackingSlug", MAX_TRACKING_SLUG_LENGTH);
    const normalized = validateExplicitSlugFormat(requested, "trackingSlug", MAX_TRACKING_SLUG_LENGTH);
    const owner = await prisma.affiliateProduct.findUnique({ where: { trackingSlug: normalized }, select: { id: true } });
    if (owner && owner.id !== id) {
      throw new AdminAffiliateProductError(`Tracking slug already in use: ${normalized}`, 409);
    }
    data.trackingSlug = normalized;
  }

  if (Object.keys(data).length === 0) {
    throw new AdminAffiliateProductError("No editable fields were provided.");
  }

  const updated = await prisma.affiliateProduct.update({ where: { id }, data });
  return toOutput(updated);
}

// ---------------------------------------------------------------------------
// Activate / deactivate / feature / unfeature — thin, explicit wrappers
// around the same update path, matching the brief's own "isActive=false
// is the ordinary removal path, never a hard delete" instruction. No
// separate hard-delete function exists in this file at all (see the
// final report's own reasoning).
// ---------------------------------------------------------------------------

export async function setAffiliateProductActive(id: string, isActive: boolean): Promise<AdminAffiliateProductOutput> {
  return updateAffiliateProduct(id, { isActive });
}

export async function setAffiliateProductFeatured(id: string, isFeatured: boolean): Promise<AdminAffiliateProductOutput> {
  return updateAffiliateProduct(id, { isFeatured });
}

// ---------------------------------------------------------------------------
// Manual commission records. Never derived from AffiliateClick — every
// value here comes from an admin's own manual entry of a real network
// statement. See CommissionStatus's own schema comment.
// ---------------------------------------------------------------------------

export interface AdminAffiliateCommissionCreateInput {
  affiliateProductId?: unknown;
  affiliateNetwork?: unknown;
  externalReference?: unknown;
  saleDate?: unknown;
  saleAmount?: unknown;
  commissionRate?: unknown;
  commissionEarned?: unknown;
  currency?: unknown;
  status?: unknown;
  notes?: unknown;
}

export interface AdminAffiliateCommissionOutput {
  id: string;
  affiliateProductId: string | null;
  productTitleSnapshot: string;
  affiliateNetwork: string | null;
  externalReference: string | null;
  saleDate: Date;
  saleAmount: number;
  commissionRate: number | null;
  commissionEarned: number;
  currency: string;
  status: CommissionStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type AffiliateCommissionRow = Prisma.AffiliateCommissionGetPayload<Record<string, never>>;

function toCommissionOutput(row: AffiliateCommissionRow): AdminAffiliateCommissionOutput {
  return {
    id: row.id,
    affiliateProductId: row.affiliateProductId,
    productTitleSnapshot: row.productTitleSnapshot,
    affiliateNetwork: row.affiliateNetwork,
    externalReference: row.externalReference,
    saleDate: row.saleDate,
    saleAmount: row.saleAmount.toNumber(),
    commissionRate: row.commissionRate ? row.commissionRate.toNumber() : null,
    commissionEarned: row.commissionEarned.toNumber(),
    currency: row.currency,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseCommissionStatus(raw: unknown): CommissionStatus {
  if (typeof raw !== "string" || !(Object.values(CommissionStatus) as string[]).includes(raw)) {
    throw new AdminAffiliateProductError("status must be a valid commission status.");
  }
  return raw as CommissionStatus;
}

// Not wired to any route in 172B (the admin UI only builds the
// Products area this milestone — see the brief's own Step 13), but
// implemented now alongside the schema so 172D's own change is UI +
// routing only, never another service rewrite.
export async function createAffiliateCommission(rawInput: unknown): Promise<AdminAffiliateCommissionOutput> {
  if (typeof rawInput !== "object" || rawInput === null) {
    throw new AdminAffiliateProductError("Request body must be an object.");
  }
  const input = rawInput as AdminAffiliateCommissionCreateInput;

  let affiliateProductId: string | null = null;
  let productTitleSnapshot: string;

  if (typeof input.affiliateProductId === "string" && input.affiliateProductId.trim().length > 0) {
    const product = await prisma.affiliateProduct.findUnique({ where: { id: input.affiliateProductId.trim() }, select: { id: true, title: true } });
    if (!product) {
      throw new AdminAffiliateProductError("affiliateProductId does not match an existing affiliate product.");
    }
    affiliateProductId = product.id;
    productTitleSnapshot = product.title;
  } else {
    productTitleSnapshot = requireTrimmedString(
      (input as Record<string, unknown>).productTitleSnapshot,
      "productTitleSnapshot",
      MAX_TITLE_LENGTH
    );
  }

  const affiliateNetwork = optionalTrimmedString(input.affiliateNetwork, "affiliateNetwork", MAX_NETWORK_LENGTH);
  const externalReference = optionalTrimmedString(input.externalReference, "externalReference", MAX_TITLE_LENGTH);
  const saleDate = requiredSaleDate(input.saleDate);
  const saleAmount = requiredNonNegativeNumber(input.saleAmount, "saleAmount");
  const commissionRate = optionalNonNegativeNumber(input.commissionRate, "commissionRate");
  const commissionEarned = requiredNonNegativeNumber(input.commissionEarned, "commissionEarned");
  const currency = optionalCurrency(input.currency);
  const status = input.status === undefined ? CommissionStatus.PENDING : parseCommissionStatus(input.status);
  const notes = optionalTrimmedString(input.notes, "notes", MAX_DESCRIPTION_LENGTH);

  const commission = await prisma.affiliateCommission.create({
    data: {
      affiliateProductId,
      productTitleSnapshot,
      affiliateNetwork,
      externalReference,
      saleDate,
      saleAmount,
      commissionRate,
      commissionEarned,
      currency,
      status,
      notes,
    },
  });

  return toCommissionOutput(commission);
}
