// Version 7, Milestone 176: affiliate application document upload,
// replacement and signed-access — LEVEL 1 file validation (brief
// section 11/45) plus the orchestration that runs LEVEL 2/3
// classification (affiliateDocumentClassification.service.ts) at
// upload time and persists only the safe, derived result (never the
// raw extracted text — brief section 43).

import crypto from "node:crypto";
import { AffiliateDocumentSlot, AffiliateIdentityDocumentType, AffiliateProofOfResidenceType } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { affiliateDocumentStorage, AffiliateDocumentStorageError } from "./affiliateDocumentStorage.service.js";
import { extractTextFromDocument } from "./documentTextExtraction.service.js";
import { classifyDocumentType, matchExtractedData, type AffiliateDocumentTypeKey } from "./affiliateDocumentClassification.service.js";

export class AffiliateDocumentError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AffiliateDocumentError";
    this.statusCode = statusCode;
  }
}

// Recommended range per brief section 11: "5 MB to 10 MB... use the
// smallest practical limit while preserving readable documents." A
// clear photo of an ID/passport page or a multi-page bank statement PDF
// comfortably fits well under 8 MB.
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};

// Defense in depth, same discipline as adminDigitalAsset.service.ts's
// own DANGEROUS_EXTENSION_PATTERN — brief section 46 additionally bars
// SVG/HTML explicitly for this feature (never safe to "preview" as a
// verification document).
const DANGEROUS_EXTENSION_PATTERN = /\.(exe|js|mjs|cjs|html?|svg|bat|cmd|sh|ps1|msi|jar|com|scr|vbs|wsf)$/i;

// LEVEL 1 magic-byte check (brief section 11: "do not trust browser
// MIME type alone"). Each signature is checked against the buffer's own
// first bytes, independent of whatever Content-Type the browser sent.
function bufferMatchesDeclaredType(buffer: Buffer, mimetype: string): boolean {
  if (buffer.length < 4) return false;
  if (mimetype === "application/pdf") {
    return buffer.subarray(0, 4).toString("latin1") === "%PDF";
  }
  if (mimetype === "image/jpeg" || mimetype === "image/jpg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === "image/png") {
    const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return PNG_SIGNATURE.every((byte, i) => buffer[i] === byte);
  }
  return false;
}

export interface Level1ValidationInput {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalName?: string;
}

// LEVEL 1 — "is it an allowed, readable document file?" Throws
// AffiliateDocumentError with a safe, user-facing message on any
// failure; never inspects file *content* beyond the first few magic
// bytes (that's LEVEL 2, after upload).
export function validateDocumentFileLevel1(input: Level1ValidationInput): string {
  if (input.size <= 0) throw new AffiliateDocumentError("Uploaded file is empty.");
  if (input.size > MAX_FILE_SIZE_BYTES) throw new AffiliateDocumentError("File is too large. Maximum size is 8 MB.");

  const ext = ALLOWED_MIME_TYPES[input.mimetype];
  if (!ext) throw new AffiliateDocumentError("Unsupported file type. Allowed types: PDF, JPG, PNG.");

  if (input.originalName && DANGEROUS_EXTENSION_PATTERN.test(input.originalName)) {
    throw new AffiliateDocumentError("This file type is not allowed for security reasons.");
  }

  if (!bufferMatchesDeclaredType(input.buffer, input.mimetype)) {
    throw new AffiliateDocumentError("This file does not appear to be a genuine PDF, JPG or PNG. Please upload the original, unmodified file.");
  }

  return ext;
}

// Never includes the original name verbatim (brief section 15: no
// name/email/id-number-shaped identifiers in a storage path) and never
// includes any application-owner-identifying fragment — a fresh random
// id is the only thing that makes each object's path unique.
function buildStoragePath(applicationId: string, ext: string): string {
  const randomId = crypto.randomBytes(16).toString("hex");
  return `affiliate-applications/${applicationId}/${randomId}.${ext}`;
}

// A short, sanitised display fragment only — never the raw original
// filename verbatim (which could itself carry a person's name/id
// number), matching adminDigitalAsset.service.ts's own
// safeFileNameFragment() precedent.
function safeDisplayFileName(originalName: string | undefined, ext: string): string {
  const base = (originalName || "document").replace(/\.[^/.]+$/, "");
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "document"}.${ext}`;
}

interface RunClassificationInput {
  slot: AffiliateDocumentSlot;
  documentTypeKey: AffiliateDocumentTypeKey;
  buffer: Buffer;
  mimetype: string;
  applicantFullName: string;
  identityNumber: string | null;
  address: { addressLine1: string; suburb: string; city: string; postalCode: string } | null;
}

// Runs LEVEL 2 (type classification) and LEVEL 3 (data matching)
// synchronously, right after upload — see this file's own header
// comment and documentTextExtraction.service.ts's for why. The
// extracted text lives only inside this function's own call stack and
// is never returned, logged, or persisted — only the derived,
// already-safe results are.
async function runClassification(input: RunClassificationInput) {
  const extractedText = await extractTextFromDocument(input.buffer, input.mimetype);
  const typeResult = classifyDocumentType(input.documentTypeKey, extractedText);

  const matchInputs =
    input.slot === "IDENTITY"
      ? { fullName: input.applicantFullName, idOrPassportNumber: input.identityNumber ?? undefined }
      : { fullName: input.applicantFullName, address: input.address ?? undefined };
  const dataMatch = matchExtractedData(matchInputs, extractedText);

  return { typeResult, dataMatch };
}

export interface UploadDocumentInput {
  applicationId: string;
  slot: AffiliateDocumentSlot;
  identityDocumentType?: AffiliateIdentityDocumentType;
  proofOfResidenceType?: AffiliateProofOfResidenceType;
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalName?: string;
}

function documentTypeKeyFor(slot: AffiliateDocumentSlot, identityDocumentType?: AffiliateIdentityDocumentType, proofOfResidenceType?: AffiliateProofOfResidenceType): AffiliateDocumentTypeKey | null {
  if (slot === "IDENTITY") return identityDocumentType ?? null;
  if (proofOfResidenceType === "BANK_STATEMENT") return "BANK_STATEMENT";
  if (proofOfResidenceType === "MUNICIPAL_ACCOUNT_OR_LETTER") return "MUNICIPAL_ACCOUNT_OR_LETTER";
  // "PROOF_OF_RESIDENCE" (the flexible "Other Accepted" category) has no
  // dedicated classifier — see affiliateDocumentClassification.service.ts's
  // own header comment; always MANUAL_REVIEW, a human decides.
  return null;
}

// Upload OR replace (brief section 40) — a slot's previous CURRENT
// document, if any, is marked isCurrent: false (never deleted from the
// database — audit history survives) and its storage object is removed
// only AFTER the new row is safely committed, same
// upload-then-commit-then-cleanup ordering as
// adminDigitalAsset.service.ts's uploadOrReplaceDigitalAsset().
export async function uploadOrReplaceDocument(input: UploadDocumentInput) {
  const ext = validateDocumentFileLevel1(input);

  if (!affiliateDocumentStorage.isAffiliateDocumentStorageConfigured()) {
    throw new AffiliateDocumentStorageError("Affiliate document storage is not configured.");
  }

  const application = await prisma.affiliateApplication.findUnique({ where: { id: input.applicationId } });
  if (!application) throw new AffiliateDocumentError("Application not found.", 404);

  const existing = await prisma.affiliateApplicationDocument.findFirst({
    where: { applicationId: input.applicationId, slot: input.slot, isCurrent: true },
  });

  const path = buildStoragePath(input.applicationId, ext);
  await affiliateDocumentStorage.uploadAffiliateDocument({ path, buffer: input.buffer, contentType: input.mimetype });

  const applicantFullName = `${application.firstName || ""} ${application.surname || ""}`.trim();
  const identityNumber = application.identityType === "SA_ID" ? application.idNumber : application.identityType === "PASSPORT" ? application.passportNumber : null;
  const address =
    application.addressLine1 && application.suburb && application.city && application.postalCode
      ? { addressLine1: application.addressLine1, suburb: application.suburb, city: application.city, postalCode: application.postalCode }
      : null;

  const documentTypeKey = documentTypeKeyFor(input.slot, input.identityDocumentType, input.proofOfResidenceType);
  const classification = documentTypeKey
    ? await runClassification({ slot: input.slot, documentTypeKey, buffer: input.buffer, mimetype: input.mimetype, applicantFullName, identityNumber, address })
    : null;

  try {
    const created = await prisma.affiliateApplicationDocument.create({
      data: {
        applicationId: input.applicationId,
        slot: input.slot,
        identityDocumentType: input.slot === "IDENTITY" ? input.identityDocumentType ?? null : null,
        proofOfResidenceType: input.slot === "PROOF_OF_RESIDENCE" ? input.proofOfResidenceType ?? null : null,
        storageBucket: env.affiliateVerificationDocumentsBucket,
        storagePath: path,
        fileName: safeDisplayFileName(input.originalName, ext),
        mimeType: input.mimetype,
        fileSizeBytes: input.size,
        isCurrent: true,
        classification: classification?.typeResult.result ?? null,
        classificationReason: classification?.typeResult.reason ?? "This document type does not support automated classification — a Seasonedz admin will review it manually.",
        nameMatchResult: classification?.dataMatch.nameMatchResult ?? null,
        addressMatchResult: classification?.dataMatch.addressMatchResult ?? null,
        idNumberMatchResult: classification?.dataMatch.idNumberMatchResult ?? null,
      },
    });

    if (existing) {
      await prisma.affiliateApplicationDocument.update({ where: { id: existing.id }, data: { isCurrent: false } });
    }

    await prisma.affiliateApplicationEvent.create({
      data: {
        applicationId: input.applicationId,
        eventType: existing ? "DOCUMENT_REPLACED" : "DOCUMENT_UPLOADED",
        actorType: "CUSTOMER",
        summary: `${input.slot === "IDENTITY" ? "Identity document" : "Proof of residence"} ${existing ? "replaced" : "uploaded"} — classification: ${classification?.typeResult.result ?? "manual review"}.`,
      },
    });

    if (existing) {
      await affiliateDocumentStorage.removeAffiliateDocumentObjectBestEffort(existing.storagePath);
    }

    return created;
  } catch (dbError) {
    await affiliateDocumentStorage.removeAffiliateDocumentObjectBestEffort(path);
    throw dbError;
  }
}

// Short-lived signed URL for the applicant's OWN current document in a
// slot — ownership already verified by the caller (controller checks
// req.customerUser.id against the application's customerId before ever
// reaching here; see affiliateDocument.controller.ts).
const SIGNED_URL_EXPIRY_SECONDS = 300;

export async function getSignedUrlForOwnDocument(applicationId: string, documentId: string): Promise<string> {
  const document = await prisma.affiliateApplicationDocument.findFirst({ where: { id: documentId, applicationId } });
  if (!document) throw new AffiliateDocumentError("Document not found.", 404);
  return affiliateDocumentStorage.createSignedAffiliateDocumentUrl(document.storagePath, SIGNED_URL_EXPIRY_SECONDS);
}
