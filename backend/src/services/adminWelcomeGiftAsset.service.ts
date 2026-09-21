// Milestone 189, brief Parts O/P: admin upload/activation of the three
// fixed welcome-gift sample PDFs. Deliberately its own service file,
// same "independent, easy-to-find write path" reasoning as
// adminDigitalAsset.service.ts, which this closely mirrors — MIME/
// extension/size validation, timestamped storage path, upload-then-
// database-write-then-best-effort-old-object-cleanup ordering. The one
// genuinely new piece: a real PDF page-count check via pdf-lib (not a
// byte-regex heuristic) — the milestone brief is explicit that a
// fabricated "yes it's 4 pages" claim is worse than reporting a
// limitation, and a real, lightweight, pure-JS parse is practical here.
//
// Reuses the SAME private Supabase bucket as paid digital products
// (env.digitalProductsBucket) under its own "welcome-gift/" path
// prefix — these are downloadable files with the exact same
// sensitivity/access pattern, and a fourth bucket would add nothing.

import { PDFDocument } from "pdf-lib";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { digitalAssetStorage, DigitalAssetStorageError } from "./digitalAssetStorage.service.js";
import { WELCOME_GIFT_ASSET_KEYS, type WelcomeGiftAssetKey } from "./welcomeGift.service.js";

export class AdminWelcomeGiftAssetError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AdminWelcomeGiftAssetError";
    this.statusCode = statusCode;
  }
}

// Only PDF — unlike adminDigitalAsset.service.ts's PDF+ZIP, these three
// are specifically described as PDFs in the milestone brief, and a page
// count can only be verified for a PDF.
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const REQUIRED_MIME_TYPE = "application/pdf";
const REQUIRED_PAGE_COUNT = 4;
const DANGEROUS_EXTENSION_PATTERN = /\.(exe|js|mjs|cjs|html?|svg|bat|cmd|sh|ps1|msi|jar|com|scr|vbs|wsf)$/i;

const ASSET_DISPLAY_NAMES: Record<WelcomeGiftAssetKey, string> = {
  abc_sample: "ABC Learning Sample",
  mindfulness_sample: "Mindfulness Colouring Sample",
  creative_activity_sample: "Seasonedz Creative Activity Sample",
};

function isWelcomeGiftAssetKey(value: string): value is WelcomeGiftAssetKey {
  return (WELCOME_GIFT_ASSET_KEYS as readonly string[]).includes(value);
}

function requireAssetKey(assetKey: string): WelcomeGiftAssetKey {
  if (!isWelcomeGiftAssetKey(assetKey)) {
    throw new AdminWelcomeGiftAssetError(`Unknown welcome-gift asset key: ${assetKey}`, 404);
  }
  return assetKey;
}

function validateMimeType(mimetype: string): void {
  if (mimetype !== REQUIRED_MIME_TYPE) {
    throw new AdminWelcomeGiftAssetError("Unsupported file type. Only PDF is allowed for welcome-gift samples.");
  }
}

function validateOriginalFileName(originalName: string | undefined): void {
  if (originalName && DANGEROUS_EXTENSION_PATTERN.test(originalName)) {
    throw new AdminWelcomeGiftAssetError("This file type is not allowed for security reasons.");
  }
}

function validateFileSize(size: number): void {
  if (size <= 0) {
    throw new AdminWelcomeGiftAssetError("Uploaded file is empty.");
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    throw new AdminWelcomeGiftAssetError("File is too large. Maximum size is 50 MB.");
  }
}

// A genuine parse via pdf-lib, not a byte-pattern guess — confirms the
// buffer really is a well-formed PDF (rejects anything that merely
// claims application/pdf as its MIME type) and returns its real page
// count. Throws a safe, generic message on a corrupt/unreadable file —
// never the underlying parser's own error detail.
async function readRealPageCount(buffer: Buffer): Promise<number> {
  try {
    const doc = await PDFDocument.load(buffer, { updateMetadata: false });
    return doc.getPageCount();
  } catch {
    throw new AdminWelcomeGiftAssetError("This file could not be read as a valid PDF.");
  }
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

function buildStoragePath(assetKey: WelcomeGiftAssetKey, originalName: string | undefined): string {
  const timestamp = Date.now();
  const safeName = safeFileNameFragment(originalName);
  return `welcome-gift/${assetKey}/${timestamp}-${safeName}.pdf`;
}

export interface AdminWelcomeGiftAssetRow {
  assetKey: string;
  displayName: string;
  isConfigured: boolean;
  fileSizeBytes: number | null;
  pageCount: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// Never selects storageBucket/storagePath — same "internal-only,
// never reaches an API response" discipline as adminDigitalAsset.service.ts.
const assetSelect = {
  assetKey: true,
  displayName: true,
  isConfigured: true,
  fileSizeBytes: true,
  pageCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Always returns exactly the three allowlisted keys, in a stable order,
// each either a real (possibly not-yet-configured) row or a synthetic
// "never uploaded" placeholder — an admin screen can render all three
// slots without first checking which rows happen to exist yet.
export async function listWelcomeGiftAssets(): Promise<AdminWelcomeGiftAssetRow[]> {
  const rows = await prisma.welcomeGiftAsset.findMany({
    where: { assetKey: { in: [...WELCOME_GIFT_ASSET_KEYS] } },
    select: assetSelect,
  });
  const byKey = new Map(rows.map((row) => [row.assetKey, row]));

  return WELCOME_GIFT_ASSET_KEYS.map(
    (assetKey) =>
      byKey.get(assetKey) ?? {
        assetKey,
        displayName: ASSET_DISPLAY_NAMES[assetKey],
        isConfigured: false,
        fileSizeBytes: null,
        pageCount: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      }
  );
}

export interface UploadWelcomeGiftAssetInput {
  assetKey: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalName?: string;
}

// Upload OR replace, same ordering discipline as
// adminDigitalAsset.service.ts's uploadOrReplaceDigitalAsset: upload the
// new object first, write the database row second, only remove the old
// storage object (best-effort) once the new pointer is safely
// committed. isConfigured only ever becomes true here, after every
// validation (including the real page-count check) has passed —
// maybeSendWelcomeGift() in welcomeGift.service.ts treats a row that
// exists but isn't configured exactly the same as one that doesn't
// exist at all.
export async function uploadWelcomeGiftAsset(input: UploadWelcomeGiftAssetInput): Promise<AdminWelcomeGiftAssetRow> {
  const assetKey = requireAssetKey(input.assetKey);
  const { buffer, mimetype, size, originalName } = input;

  validateMimeType(mimetype);
  validateOriginalFileName(originalName);
  validateFileSize(size);
  const pageCount = await readRealPageCount(buffer);

  if (pageCount !== REQUIRED_PAGE_COUNT) {
    throw new AdminWelcomeGiftAssetError(`This sample must be exactly ${REQUIRED_PAGE_COUNT} pages. The uploaded file has ${pageCount}.`);
  }

  if (!digitalAssetStorage.isDigitalAssetStorageConfigured()) {
    throw new DigitalAssetStorageError("Digital product file storage is not configured.");
  }

  const existing = await prisma.welcomeGiftAsset.findUnique({ where: { assetKey }, select: { storagePath: true } });

  const path = buildStoragePath(assetKey, originalName);
  await digitalAssetStorage.uploadDigitalAsset({ path, buffer, contentType: mimetype });

  try {
    const saved = await prisma.welcomeGiftAsset.upsert({
      where: { assetKey },
      create: {
        assetKey,
        displayName: ASSET_DISPLAY_NAMES[assetKey],
        isConfigured: true,
        storageBucket: env.digitalProductsBucket,
        storagePath: path,
        mimeType: mimetype,
        fileSizeBytes: size,
        pageCount,
      },
      update: {
        isConfigured: true,
        storageBucket: env.digitalProductsBucket,
        storagePath: path,
        mimeType: mimetype,
        fileSizeBytes: size,
        pageCount,
      },
      select: assetSelect,
    });

    if (existing?.storagePath) {
      await digitalAssetStorage.removeDigitalAssetObjectBestEffort(existing.storagePath);
    }

    return saved;
  } catch (dbError) {
    await digitalAssetStorage.removeDigitalAssetObjectBestEffort(path);
    throw dbError;
  }
}
