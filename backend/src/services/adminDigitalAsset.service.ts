// Version 7, Milestone 152: admin digital-asset (file) management for
// DIGITAL products. Deliberately its own service file, same reasoning
// as adminProductImage.service.ts — an independent, easy-to-find write
// path, kept separate from adminProduct.service.ts (product text/price/
// status) and from digitalAssetStorage.service.ts (the raw Supabase
// Storage client).
//
// This file never touches Product.name/price/status/etc — it only
// ever reads a product's id/productType (existence + type check) and
// writes the one DigitalAsset row belonging to it.

import { prisma } from "../config/prisma.js";
import { ProductType } from "@prisma/client";
import { digitalAssetStorage, DigitalAssetStorageError } from "./digitalAssetStorage.service.js";
import { env } from "../config/env.js";

export class AdminDigitalAssetError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AdminDigitalAssetError";
    this.statusCode = statusCode;
  }
}

// 50 MB — Milestone 153A: matches the real Supabase Storage bucket's
// own file-size limit (digital-products, configured 50 MB) exactly, so
// a file this backend accepts can never fail the storage upload step
// on size alone. Multer's memoryStorage buffers the whole file in the
// Node process's memory before this service ever runs, so a very small
// hosting plan could still want this lower — revisit if real uploads
// ever approach this size.
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_DISPLAY_NAME_LENGTH = 200;
const MAX_VERSION_LENGTH = 50;

// PDF first, per the brief; ZIP optional and included since it's a
// safe, common container for multi-page printable sets — both are
// read-only document formats with no embedded active content Node/the
// browser would ever execute. Every other type (including images,
// audio/video, and every "risky" type named in the brief) is rejected.
const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/zip": "zip",
  // Windows' own zip implementation sometimes reports this alias MIME
  // type instead of the standard one above — both map to the same safe
  // "zip" extension.
  "application/x-zip-compressed": "zip",
};

// Defense in depth: even though the object's *stored* extension always
// comes from the validated MIME type above (never trusted from the
// original filename), a filename ending in one of these is rejected
// outright rather than silently accepted with a mismatched name —
// exactly the risky types the brief names explicitly.
const DANGEROUS_EXTENSION_PATTERN = /\.(exe|js|mjs|cjs|html?|svg|bat|cmd|sh|ps1|msi|jar|com|scr|vbs|wsf)$/i;

function validateMimeType(mimetype: string): string {
  const ext = ALLOWED_MIME_TYPES[mimetype];
  if (!ext) {
    throw new AdminDigitalAssetError("Unsupported file type. Allowed types: PDF, ZIP.");
  }
  return ext;
}

function validateOriginalFileName(originalName: string | undefined): void {
  if (originalName && DANGEROUS_EXTENSION_PATTERN.test(originalName)) {
    throw new AdminDigitalAssetError("This file type is not allowed for security reasons.");
  }
}

function validateFileSize(size: number): void {
  if (size <= 0) {
    throw new AdminDigitalAssetError("Uploaded file is empty.");
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    throw new AdminDigitalAssetError("File is too large. Maximum size is 50 MB.");
  }
}

function requireTrimmedString(raw: unknown, fieldName: string, maxLength: number): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new AdminDigitalAssetError(`${fieldName} is required.`);
  }
  const trimmed = raw.trim();
  if (trimmed.length > maxLength) {
    throw new AdminDigitalAssetError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
}

function optionalTrimmedString(raw: unknown, fieldName: string, maxLength: number): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") {
    throw new AdminDigitalAssetError(`${fieldName} must be a string.`);
  }
  const trimmed = raw.trim();
  if (trimmed.length > maxLength) {
    throw new AdminDigitalAssetError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return trimmed.length > 0 ? trimmed : null;
}

function optionalPositiveInteger(raw: unknown, fieldName: string): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new AdminDigitalAssetError(`${fieldName} must be a whole number greater than 0.`);
  }
  return value;
}

function safeFileNameFragment(originalName: string | undefined): string {
  const base = (originalName || "file").replace(/\.[^/.]+$/, "");
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "file";
}

function buildStoragePath(productId: string, ext: string, originalName: string | undefined): string {
  const timestamp = Date.now();
  const safeName = safeFileNameFragment(originalName);
  return `digital-assets/${productId}/${timestamp}-${safeName}.${ext}`;
}

async function requireProduct(productId: string): Promise<{ id: string; productType: ProductType }> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, productType: true } });
  if (!product) {
    throw new AdminDigitalAssetError(`Product not found: ${productId}`, 404);
  }
  return product;
}

export interface AdminDigitalAssetRow {
  id: string;
  productId: string;
  fileName: string;
  displayName: string;
  mimeType: string;
  fileSizeBytes: number;
  pageCount: number | null;
  version: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Never selects storageBucket/storagePath — those are internal-only
// (see digitalAssetStorage.service.ts's own header comment) and must
// never reach any API response, including this admin one. An admin
// never needs the raw path; replacing/removing a file is done by id,
// and downloading (if an admin ever wants to check a file) goes through
// the same signed-URL request flow as a customer, scoped to admin auth.
const digitalAssetSelect = {
  id: true,
  productId: true,
  fileName: true,
  displayName: true,
  mimeType: true,
  fileSizeBytes: true,
  pageCount: true,
  version: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function getDigitalAssetForProduct(productId: string): Promise<AdminDigitalAssetRow | null> {
  await requireProduct(productId);
  return prisma.digitalAsset.findUnique({ where: { productId }, select: digitalAssetSelect });
}

export interface UploadDigitalAssetForProductInput {
  productId: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalName?: string;
  displayName: unknown;
  pageCount?: unknown;
  version?: unknown;
}

// Upload OR replace — a product has at most one DigitalAsset row (see
// schema.prisma's own comment on the unique productId), so this always
// upserts: a fresh upload for a product with no existing file creates
// the row; calling it again for the same product uploads to a brand-new
// storage path and then updates the same row to point at it, only
// removing the old storage object (best-effort) after that database
// write has already succeeded — so a failure partway through never
// leaves the product with no file at all.
export async function uploadOrReplaceDigitalAsset(input: UploadDigitalAssetForProductInput): Promise<AdminDigitalAssetRow> {
  const { productId, buffer, mimetype, size, originalName } = input;

  await requireProduct(productId);

  const ext = validateMimeType(mimetype);
  validateOriginalFileName(originalName);
  validateFileSize(size);
  const displayName = requireTrimmedString(input.displayName, "displayName", MAX_DISPLAY_NAME_LENGTH);
  const pageCount = optionalPositiveInteger(input.pageCount, "pageCount");
  const version = optionalTrimmedString(input.version, "version", MAX_VERSION_LENGTH);

  if (!digitalAssetStorage.isDigitalAssetStorageConfigured()) {
    throw new DigitalAssetStorageError("Digital product file storage is not configured.");
  }

  const existing = await prisma.digitalAsset.findUnique({ where: { productId }, select: { id: true, storagePath: true } });

  const path = buildStoragePath(productId, ext, originalName);
  await digitalAssetStorage.uploadDigitalAsset({ path, buffer, contentType: mimetype });

  const fileName = originalName?.trim() || `file.${ext}`;

  try {
    const saved = existing
      ? await prisma.digitalAsset.update({
          where: { productId },
          data: {
            fileName,
            displayName,
            storageBucket: env.digitalProductsBucket,
            storagePath: path,
            mimeType: mimetype,
            fileSizeBytes: size,
            pageCount,
            version,
            isActive: true,
          },
          select: digitalAssetSelect,
        })
      : await prisma.digitalAsset.create({
          data: {
            productId,
            fileName,
            displayName,
            storageBucket: env.digitalProductsBucket,
            storagePath: path,
            mimeType: mimetype,
            fileSizeBytes: size,
            pageCount,
            version,
            isActive: true,
          },
          select: digitalAssetSelect,
        });

    // Only reached once the new row/pointer is safely committed —
    // removing the previous object now (if this was a replace) can
    // never leave a moment where the database points at nothing.
    if (existing?.storagePath) {
      await digitalAssetStorage.removeDigitalAssetObjectBestEffort(existing.storagePath);
    }

    return saved;
  } catch (dbError) {
    // Same discipline as adminProductImage.service.ts's uploadImageForProduct:
    // the upload already succeeded in Storage, so on a database failure,
    // best-effort remove the now-orphaned new object. Never touches the
    // *old* object in this failure path — it's still the one the
    // database row (if any) actually points at.
    await digitalAssetStorage.removeDigitalAssetObjectBestEffort(path);
    throw dbError;
  }
}

// Deliberately no bulk delete, and this never touches the Product row
// itself — same "single, narrow write path" discipline as
// adminProductImage.service.ts's deleteProductImage. Blocks deleting the
// file of a currently-ACTIVE digital product: adminProduct.service.ts's
// own validation already refuses to let a DIGITAL product be(come)
// ACTIVE with no file, so allowing a delete here would silently create
// exactly the invalid state that validation exists to prevent — an
// admin must first move the product to DRAFT/ARCHIVED, then remove the
// file, matching how a would-be inconsistent state should always be
// reached through an explicit, visible status change, not a side effect
// of deleting the file underneath it.
export async function deleteDigitalAsset(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, status: true } });
  if (!product) {
    throw new AdminDigitalAssetError(`Product not found: ${productId}`, 404);
  }

  const existing = await prisma.digitalAsset.findUnique({ where: { productId }, select: { id: true, storagePath: true } });
  if (!existing) {
    throw new AdminDigitalAssetError("This product has no digital file to remove.", 404);
  }

  if (product.status === "ACTIVE") {
    throw new AdminDigitalAssetError(
      "This digital product is currently Active and customers may be able to buy it — set it to Draft or Archived before removing its file.",
      409
    );
  }

  await prisma.digitalAsset.delete({ where: { productId } });
  await digitalAssetStorage.removeDigitalAssetObjectBestEffort(existing.storagePath);
}
