// Version 7, Milestone 69: admin product image upload/management.
// Deliberately its own service file — same reasoning as
// adminProduct.service.ts and adminOrderStatus.service.ts before it:
// an independent, easy-to-find write path.
//
// Version 7, Milestone 74 adds deleteProductImage — deliberately the
// last capability added, after upload/list/set-primary/alt-text had
// already been live and proven (VERSION_7_PRODUCT_IMAGE_UPLOAD_PLAN.md
// Section 10 recommended deferring delete past the very first
// version, not skipping it forever). Still no bulk delete, and still
// no route that touches the Product row itself.
//
// This file never touches Product.name/price/stockQuantity/etc — it
// only ever reads a product's id (existence check) and writes
// ProductImage rows.
//
// Milestone 197: adds dedicated per-variant images, reusing this exact
// same Supabase Storage pipeline (no new bucket, no new storage
// provider). Every query below is now explicitly scoped by
// `variantId` — `null` means "the shared/normal product gallery",
// a real id means "this one variant's own dedicated images" — the two
// are never merged (see ProductImage.variantId's schema comment). The
// original product-level functions (listProductImages,
// uploadImageForProduct, updateProductImage, deleteProductImage) keep
// their exact existing signatures and behaviour, now with an explicit
// `variantId: null` filter added so they can never accidentally read
// or touch a variant's dedicated images once those exist.

import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import {
  isProductImageUploadConfigured,
  uploadProductImage,
  removeProductImageObjectBestEffort,
  isSupabaseStorageUrl,
  extractStoragePathFromPublicUrl,
  ProductImageStorageError,
} from "./supabaseStorage.service.js";

export class AdminProductImageError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AdminProductImageError";
    this.statusCode = statusCode;
  }
}

const MAX_ALT_TEXT_LENGTH = 200;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// SVG and PDF are deliberately absent — rejected in the first version
// per VERSION_7_PRODUCT_IMAGE_UPLOAD_PLAN.md Section 5.
const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type ProductImageKind = "main" | "gallery";

export interface AdminProductImageRow {
  id: string;
  productId: string;
  variantId: string | null;
  url: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: Date;
}

const IMAGE_ROW_SELECT = {
  id: true,
  productId: true,
  variantId: true,
  url: true,
  altText: true,
  sortOrder: true,
  isPrimary: true,
  createdAt: true,
} as const;

async function requireProductExists(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) {
    throw new AdminProductImageError(`Product not found: ${productId}`, 404);
  }
}

// Milestone 197: the one place that decides "does this variant id
// genuinely belong to this product id" — every variant-image route
// calls this before touching any ProductImage row, so a variant id
// belonging to a different product can never be used to read/write
// images through this product's URL.
async function requireVariantBelongsToProduct(
  productId: string,
  variantId: string
): Promise<{ id: string; productId: string; optionValues: unknown; product: { name: string } }> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, productId: true, optionValues: true, product: { select: { name: true } } },
  });
  if (!variant || variant.productId !== productId) {
    throw new AdminProductImageError(`Variant not found on this product: ${variantId}`, 404);
  }
  return variant;
}

// Same "A4 / Framed" join the schema's own ProductVariant.optionValues
// comment describes — kept local and simple since this is only ever
// used to build a default alt-text fragment, never shown as the
// variant's canonical label anywhere else.
function formatVariantLabelForAltText(optionValues: unknown): string {
  if (typeof optionValues !== "object" || optionValues === null) return "";
  return Object.values(optionValues as Record<string, string>).join(" / ");
}

// ---------------------------------------------------------------------------
// List (GET /api/admin/products/:id/images). Read-only — never changes data.
// ---------------------------------------------------------------------------

export async function listProductImages(productId: string): Promise<AdminProductImageRow[]> {
  await requireProductExists(productId);

  return prisma.productImage.findMany({
    where: { productId, variantId: null },
    orderBy: { sortOrder: "asc" },
    select: IMAGE_ROW_SELECT,
  });
}

// Milestone 197: the variant-scoped counterpart — this variant's own
// dedicated images only, never the shared product gallery and never
// another variant's images.
export async function listVariantImages(productId: string, variantId: string): Promise<AdminProductImageRow[]> {
  await requireProductExists(productId);
  await requireVariantBelongsToProduct(productId, variantId);

  return prisma.productImage.findMany({
    where: { productId, variantId },
    orderBy: { sortOrder: "asc" },
    select: IMAGE_ROW_SELECT,
  });
}

// ---------------------------------------------------------------------------
// Upload (POST /api/admin/products/:id/images).
// ---------------------------------------------------------------------------

function validateAltText(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new AdminProductImageError("altText is required.");
  }
  const trimmed = raw.trim();
  if (trimmed.length > MAX_ALT_TEXT_LENGTH) {
    throw new AdminProductImageError(`altText must be ${MAX_ALT_TEXT_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

// Milestone 197: variant uploads may omit altText — a sensible default
// ("<product name> — <variant option>") is generated instead, per the
// brief's "default product name + variant option, admin-overridable"
// rule. An explicitly supplied altText is still validated exactly like
// the product-level path — no keyword stuffing beyond the same length
// ceiling.
function resolveVariantAltText(raw: unknown, productName: string, variantLabel: string): string {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim().length === 0)) {
    const fallback = variantLabel ? `${productName} — ${variantLabel}` : productName;
    return fallback.slice(0, MAX_ALT_TEXT_LENGTH);
  }
  return validateAltText(raw);
}

function validateKind(raw: unknown): ProductImageKind | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (raw === "main" || raw === "gallery") return raw;
  throw new AdminProductImageError('kind must be "main" or "gallery" if provided.');
}

function validateMimeType(mimetype: string): string {
  const ext = ALLOWED_MIME_TYPES[mimetype];
  if (!ext) {
    throw new AdminProductImageError(
      "Unsupported image type. Allowed types: image/jpeg, image/png, image/webp."
    );
  }
  return ext;
}

function validateFileSize(size: number): void {
  if (size <= 0) {
    throw new AdminProductImageError("Uploaded file is empty.");
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    throw new AdminProductImageError("Image file is too large. Maximum size is 5 MB.");
  }
}

// Never trusts the original filename beyond borrowing a human-readable
// fragment for it — no path separators, no unicode tricks, no
// extension carried through (the extension always comes from the
// validated MIME type instead, see validateMimeType).
function safeFileNameFragment(originalName: string | undefined): string {
  const base = (originalName || "image").replace(/\.[^/.]+$/, "");
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "image";
}

function buildStoragePath(productId: string, kind: ProductImageKind, ext: string, originalName: string | undefined): string {
  const timestamp = Date.now();
  const safeName = safeFileNameFragment(originalName);
  const folder = kind === "main" ? "main" : "gallery";
  return `products/${productId}/${folder}/${timestamp}-${safeName}.${ext}`;
}

function buildVariantStoragePath(productId: string, variantId: string, ext: string, originalName: string | undefined): string {
  const timestamp = Date.now();
  const safeName = safeFileNameFragment(originalName);
  return `products/${productId}/variants/${variantId}/${timestamp}-${safeName}.${ext}`;
}

// Milestone 197: recomputes ProductVariant.imageUrl from whichever
// ProductImage row is currently primary for that variant (or null if
// none) — called at the end of every variant-image create/update/
// delete so the mirror can never drift from the dedicated rows it's
// supposed to reflect. Deliberately a full recompute, not an
// incremental patch, so it's correct regardless of which mutation
// triggered it.
async function syncVariantImageUrlMirror(tx: Prisma.TransactionClient, variantId: string): Promise<void> {
  const primary = await tx.productImage.findFirst({
    where: { variantId, isPrimary: true },
    select: { url: true },
  });
  await tx.productVariant.update({
    where: { id: variantId },
    data: { imageUrl: primary?.url ?? null },
  });
}

export interface UploadProductImageInput {
  productId: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalName?: string;
  altText: unknown;
  kind: unknown;
}

export async function uploadImageForProduct(input: UploadProductImageInput): Promise<AdminProductImageRow> {
  const { productId, buffer, mimetype, size, originalName } = input;

  await requireProductExists(productId);

  const ext = validateMimeType(mimetype);
  validateFileSize(size);
  const altText = validateAltText(input.altText);
  const requestedKind = validateKind(input.kind);

  if (!isProductImageUploadConfigured()) {
    throw new ProductImageStorageError("Product image upload is not configured.");
  }

  const existingCount = await prisma.productImage.count({ where: { productId, variantId: null } });
  const isFirstImage = existingCount === 0;
  // Explicit "main" always wins; otherwise the very first image for a
  // product becomes primary automatically (Plan Section 8); any other
  // gallery upload never changes the existing primary.
  const effectiveKind: ProductImageKind = requestedKind ?? (isFirstImage ? "main" : "gallery");
  const willBePrimary = effectiveKind === "main" || isFirstImage;

  const path = buildStoragePath(productId, effectiveKind, ext, originalName);
  const { publicUrl } = await uploadProductImage({ path, buffer, contentType: mimetype });

  const maxSortOrder = await prisma.productImage.aggregate({
    where: { productId, variantId: null },
    _max: { sortOrder: true },
  });
  const nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

  try {
    return await prisma.$transaction(async (tx) => {
      if (willBePrimary) {
        await tx.productImage.updateMany({
          where: { productId, variantId: null, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.productImage.create({
        data: {
          productId,
          url: publicUrl,
          altText,
          sortOrder: nextSortOrder,
          isPrimary: willBePrimary,
        },
        select: IMAGE_ROW_SELECT,
      });
    });
  } catch (dbError) {
    // Best-effort cleanup only — the upload already succeeded in
    // Storage, so if the database write fails we try to remove the
    // now-orphaned object. This is deliberately swallowed: a cleanup
    // failure must never mask the real error the caller needs to see,
    // and per VERSION_7_PRODUCT_IMAGE_UPLOAD_PLAN.md Section 10, an
    // occasional leftover unused file is an acceptable, low-risk
    // tradeoff for a simple first version — not left to fail loudly.
    await removeProductImageObjectBestEffort(path);
    throw dbError;
  }
}

// Milestone 197: variant-scoped upload — same validation/storage/
// primary-promotion discipline as uploadImageForProduct above, scoped
// to (productId, variantId) throughout, plus the imageUrl mirror sync.
export interface UploadVariantImageInput {
  productId: string;
  variantId: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalName?: string;
  altText: unknown;
}

export async function uploadImageForVariant(input: UploadVariantImageInput): Promise<AdminProductImageRow> {
  const { productId, variantId, buffer, mimetype, size, originalName } = input;

  await requireProductExists(productId);
  const variant = await requireVariantBelongsToProduct(productId, variantId);

  const ext = validateMimeType(mimetype);
  validateFileSize(size);
  const altText = resolveVariantAltText(input.altText, variant.product.name, formatVariantLabelForAltText(variant.optionValues));

  if (!isProductImageUploadConfigured()) {
    throw new ProductImageStorageError("Product image upload is not configured.");
  }

  const existingCount = await prisma.productImage.count({ where: { productId, variantId } });
  const isFirstImage = existingCount === 0;
  const willBePrimary = isFirstImage;

  const path = buildVariantStoragePath(productId, variantId, ext, originalName);
  const { publicUrl } = await uploadProductImage({ path, buffer, contentType: mimetype });

  const maxSortOrder = await prisma.productImage.aggregate({
    where: { productId, variantId },
    _max: { sortOrder: true },
  });
  const nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

  try {
    return await prisma.$transaction(async (tx) => {
      if (willBePrimary) {
        await tx.productImage.updateMany({
          where: { productId, variantId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const created = await tx.productImage.create({
        data: {
          productId,
          variantId,
          url: publicUrl,
          altText,
          sortOrder: nextSortOrder,
          isPrimary: willBePrimary,
        },
        select: IMAGE_ROW_SELECT,
      });

      if (willBePrimary) {
        await syncVariantImageUrlMirror(tx, variantId);
      }

      return created;
    });
  } catch (dbError) {
    await removeProductImageObjectBestEffort(path);
    throw dbError;
  }
}

// ---------------------------------------------------------------------------
// Update (PATCH /api/admin/products/:id/images/:imageId). Never uploads a
// new file, never deletes the storage object or the ProductImage row.
// ---------------------------------------------------------------------------

export interface UpdateProductImageInput {
  isPrimary?: unknown;
  altText?: unknown;
  sortOrder?: unknown;
}

export interface UpdateProductImageResult {
  image: AdminProductImageRow;
  images: AdminProductImageRow[];
}

function parseUpdateImageData(input: UpdateProductImageInput): { altText?: string; sortOrder?: number; isPrimary?: boolean } {
  const data: { altText?: string; sortOrder?: number; isPrimary?: boolean } = {};

  if ("altText" in input && input.altText !== undefined) {
    data.altText = validateAltText(input.altText);
  }

  if ("sortOrder" in input && input.sortOrder !== undefined) {
    const raw = input.sortOrder;
    const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (!Number.isInteger(value) || value < 0) {
      throw new AdminProductImageError("sortOrder must be a whole number of 0 or more.");
    }
    data.sortOrder = value;
  }

  const setPrimary = "isPrimary" in input && input.isPrimary !== undefined ? Boolean(input.isPrimary) : undefined;
  if (setPrimary === true) {
    data.isPrimary = true;
  } else if (setPrimary === false) {
    throw new AdminProductImageError("isPrimary can only be set to true directly. Set another image as primary instead.");
  }

  if (Object.keys(data).length === 0) {
    throw new AdminProductImageError("No recognised fields to update. Allowed: isPrimary, altText, sortOrder.");
  }

  return data;
}

export async function updateProductImage(
  productId: string,
  imageId: string,
  input: UpdateProductImageInput
): Promise<UpdateProductImageResult> {
  await requireProductExists(productId);

  const existing = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!existing || existing.productId !== productId || existing.variantId !== null) {
    throw new AdminProductImageError(`Image not found: ${imageId}`, 404);
  }

  const data = parseUpdateImageData(input);

  const image = await prisma.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.productImage.updateMany({
        where: { productId, variantId: null, isPrimary: true, id: { not: imageId } },
        data: { isPrimary: false },
      });
    }

    return tx.productImage.update({
      where: { id: imageId },
      data,
      select: IMAGE_ROW_SELECT,
    });
  });

  const images = await listProductImages(productId);

  return { image, images };
}

// Milestone 197: variant-scoped counterpart of updateProductImage —
// same field rules, scoped primary-reset, plus the imageUrl mirror
// sync whenever the primary changes.
export async function updateVariantImage(
  productId: string,
  variantId: string,
  imageId: string,
  input: UpdateProductImageInput
): Promise<UpdateProductImageResult> {
  await requireProductExists(productId);
  await requireVariantBelongsToProduct(productId, variantId);

  const existing = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!existing || existing.productId !== productId || existing.variantId !== variantId) {
    throw new AdminProductImageError(`Image not found: ${imageId}`, 404);
  }

  const data = parseUpdateImageData(input);

  const image = await prisma.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.productImage.updateMany({
        where: { productId, variantId, isPrimary: true, id: { not: imageId } },
        data: { isPrimary: false },
      });
    }

    const updated = await tx.productImage.update({
      where: { id: imageId },
      data,
      select: IMAGE_ROW_SELECT,
    });

    if (data.isPrimary) {
      await syncVariantImageUrlMirror(tx, variantId);
    }

    return updated;
  });

  const images = await listVariantImages(productId, variantId);

  return { image, images };
}

// ---------------------------------------------------------------------------
// Delete (DELETE /api/admin/products/:id/images/:imageId). Version 7,
// Milestone 74. Deliberately single-image only — no bulk delete route
// exists, and this never touches the Product row itself, only the one
// ProductImage row named in the URL.
// ---------------------------------------------------------------------------

export interface DeleteProductImageResult {
  deletedImageId: string;
  images: AdminProductImageRow[];
}

export async function deleteProductImage(productId: string, imageId: string): Promise<DeleteProductImageResult> {
  await requireProductExists(productId);

  const existing = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!existing || existing.productId !== productId || existing.variantId !== null) {
    throw new AdminProductImageError(`Image not found: ${imageId}`, 404);
  }

  // Database row is the source of truth for what the storefront shows
  // — deleted first, in the same transaction that promotes a new
  // primary if needed, so there is never a moment where the product
  // has images but zero of them marked primary.
  await prisma.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: imageId } });

    if (existing.isPrimary) {
      const nextPrimary = await tx.productImage.findFirst({
        where: { productId, variantId: null },
        orderBy: { sortOrder: "asc" },
      });
      if (nextPrimary) {
        await tx.productImage.update({ where: { id: nextPrimary.id }, data: { isPrimary: true } });
      }
    }
  });

  // Storage cleanup only after the database change has succeeded, and
  // only for a Supabase-hosted image — a root-relative static path
  // (e.g. "/images/product-1.jpg") is a frontend build asset with no
  // Storage object behind it at all, never something this backend
  // deletes. Best-effort and never throws (see
  // removeProductImageObjectBestEffort's own comment) — the database
  // change (what actually controls what the storefront shows) has
  // already succeeded regardless of whether this step does.
  if (isSupabaseStorageUrl(existing.url)) {
    const path = extractStoragePathFromPublicUrl(existing.url);
    if (path) {
      await removeProductImageObjectBestEffort(path);
    }
  }

  const images = await listProductImages(productId);

  return { deletedImageId: imageId, images };
}

// Milestone 197: variant-scoped counterpart of deleteProductImage —
// same delete-then-promote-then-cleanup sequence, plus the imageUrl
// mirror sync (becomes the new primary's url, or null when the last
// dedicated image is removed — never a stale/restored value, see
// ProductVariant.imageUrl's schema comment).
export async function deleteVariantImage(
  productId: string,
  variantId: string,
  imageId: string
): Promise<DeleteProductImageResult> {
  await requireProductExists(productId);
  await requireVariantBelongsToProduct(productId, variantId);

  const existing = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!existing || existing.productId !== productId || existing.variantId !== variantId) {
    throw new AdminProductImageError(`Image not found: ${imageId}`, 404);
  }

  await prisma.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: imageId } });

    if (existing.isPrimary) {
      const nextPrimary = await tx.productImage.findFirst({
        where: { productId, variantId },
        orderBy: { sortOrder: "asc" },
      });
      if (nextPrimary) {
        await tx.productImage.update({ where: { id: nextPrimary.id }, data: { isPrimary: true } });
      }
    }

    await syncVariantImageUrlMirror(tx, variantId);
  });

  if (isSupabaseStorageUrl(existing.url)) {
    const path = extractStoragePathFromPublicUrl(existing.url);
    if (path) {
      await removeProductImageObjectBestEffort(path);
    }
  }

  const images = await listVariantImages(productId, variantId);

  return { deletedImageId: imageId, images };
}
