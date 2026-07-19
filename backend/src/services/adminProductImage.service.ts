// Version 7, Milestone 69: admin product image upload/management.
// Deliberately its own service file — same reasoning as
// adminProduct.service.ts and adminOrderStatus.service.ts before it:
// an independent, easy-to-find write path. No DELETE anywhere in this
// file, by design — deleting a product image is explicitly out of
// scope for this milestone (VERSION_7_PRODUCT_IMAGE_UPLOAD_PLAN.md
// Section 10 recommends deferring it).
//
// This file never touches Product.name/price/stockQuantity/etc — it
// only ever reads a product's id (existence check) and writes
// ProductImage rows.

import { prisma } from "../config/prisma.js";
import {
  isProductImageUploadConfigured,
  uploadProductImage,
  removeProductImageObjectBestEffort,
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
  url: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: Date;
}

async function requireProductExists(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) {
    throw new AdminProductImageError(`Product not found: ${productId}`, 404);
  }
}

// ---------------------------------------------------------------------------
// List (GET /api/admin/products/:id/images). Read-only — never changes data.
// ---------------------------------------------------------------------------

export async function listProductImages(productId: string): Promise<AdminProductImageRow[]> {
  await requireProductExists(productId);

  return prisma.productImage.findMany({
    where: { productId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, productId: true, url: true, altText: true, sortOrder: true, isPrimary: true, createdAt: true },
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

  const existingCount = await prisma.productImage.count({ where: { productId } });
  const isFirstImage = existingCount === 0;
  // Explicit "main" always wins; otherwise the very first image for a
  // product becomes primary automatically (Plan Section 8); any other
  // gallery upload never changes the existing primary.
  const effectiveKind: ProductImageKind = requestedKind ?? (isFirstImage ? "main" : "gallery");
  const willBePrimary = effectiveKind === "main" || isFirstImage;

  const path = buildStoragePath(productId, effectiveKind, ext, originalName);
  const { publicUrl } = await uploadProductImage({ path, buffer, contentType: mimetype });

  const maxSortOrder = await prisma.productImage.aggregate({
    where: { productId },
    _max: { sortOrder: true },
  });
  const nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

  try {
    return await prisma.$transaction(async (tx) => {
      if (willBePrimary) {
        await tx.productImage.updateMany({
          where: { productId, isPrimary: true },
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
        select: {
          id: true,
          productId: true,
          url: true,
          altText: true,
          sortOrder: true,
          isPrimary: true,
          createdAt: true,
        },
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

export async function updateProductImage(
  productId: string,
  imageId: string,
  input: UpdateProductImageInput
): Promise<UpdateProductImageResult> {
  await requireProductExists(productId);

  const existing = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!existing || existing.productId !== productId) {
    throw new AdminProductImageError(`Image not found: ${imageId}`, 404);
  }

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
    throw new AdminProductImageError("isPrimary can only be set to true directly — set another image as primary instead.");
  }

  if (Object.keys(data).length === 0) {
    throw new AdminProductImageError("No recognised fields to update. Allowed: isPrimary, altText, sortOrder.");
  }

  const image = await prisma.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.productImage.updateMany({
        where: { productId, isPrimary: true, id: { not: imageId } },
        data: { isPrimary: false },
      });
    }

    return tx.productImage.update({
      where: { id: imageId },
      data,
      select: {
        id: true,
        productId: true,
        url: true,
        altText: true,
        sortOrder: true,
        isPrimary: true,
        createdAt: true,
      },
    });
  });

  const images = await listProductImages(productId);

  return { image, images };
}
