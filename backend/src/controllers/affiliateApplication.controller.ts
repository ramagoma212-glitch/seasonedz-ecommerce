// Version 7, Milestone 176: customer-facing affiliate application
// endpoints. Every handler derives identity exclusively from
// req.customerUser.id (requireCustomerAuth) — never from a body/param
// application id, matching this backend's own "never trust the body
// for identity" discipline (order.service.ts, customerOrder.service.ts,
// customerAffiliate.controller.ts). This is also the structural IDOR
// defence brief section 48 requires: there is no route anywhere that
// accepts an arbitrary applicationId from an unauthenticated or
// wrongly-authenticated caller — every lookup goes through
// requireOwnedApplication()/req.customerUser.id inside the service
// layer.

import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { AffiliateApplicationError, getOrCreateMyApplication, submitMyApplication, updateMyApplicationFields } from "../services/affiliateApplication.service.js";
import { AffiliateDocumentError, getSignedUrlForOwnDocument, uploadOrReplaceDocument } from "../services/affiliateDocument.service.js";
import { AffiliateDocumentStorageError } from "../services/affiliateDocumentStorage.service.js";
import { prisma } from "../config/prisma.js";

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
});

export const uploadAffiliateDocumentMiddleware = upload.single("file");

function handleKnownErrors(res: Response, error: unknown): boolean {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      sendError(res, { message: "File is too large. Maximum size is 8 MB.", statusCode: 400 });
      return true;
    }
    sendError(res, { message: "File upload failed. Please try a different file.", statusCode: 400 });
    return true;
  }
  if (error instanceof AffiliateApplicationError || error instanceof AffiliateDocumentError || error instanceof AffiliateDocumentStorageError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return true;
  }
  return false;
}

export async function getMyApplicationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.customerUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }
    const application = await getOrCreateMyApplication(req.customerUser.id);
    sendSuccess(res, { message: "Affiliate application retrieved successfully", data: { hasApplication: application !== null, application } });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function updateMyApplicationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.customerUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }
    const application = await updateMyApplicationFields(req.customerUser.id, req.body ?? {});
    sendSuccess(res, { message: "Application updated successfully", data: { application } });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function submitMyApplicationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.customerUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }
    const application = await submitMyApplication(req.customerUser.id);
    sendSuccess(res, { message: "Application submitted successfully", data: { application } });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

const VALID_SLOTS = new Set(["IDENTITY", "PROOF_OF_RESIDENCE"]);
const VALID_IDENTITY_TYPES = new Set(["SA_ID", "PASSPORT"]);
const VALID_POR_TYPES = new Set(["BANK_STATEMENT", "MUNICIPAL_ACCOUNT_OR_LETTER", "PROOF_OF_RESIDENCE"]);

// Ownership check (brief section 48): confirms req.customerUser.id
// genuinely owns the AffiliateApplication row this upload is for —
// never trusts an applicationId from the body/param alone. Since every
// document route here only ever operates on "my own" application
// (looked up fresh from req.customerUser.id, never from a client-
// supplied application id), a customer can structurally never reach
// another customer's application id even by guessing one.
async function requireMyApplicationId(customerId: string): Promise<string> {
  const application = await prisma.affiliateApplication.findUnique({ where: { customerId }, select: { id: true, status: true } });
  if (!application) throw new AffiliateApplicationError("No affiliate application found for this account.", 404);
  if (application.status !== "DRAFT" && application.status !== "ACTION_REQUIRED") {
    throw new AffiliateApplicationError(`Documents cannot be uploaded while the application status is ${application.status}.`, 409);
  }
  return application.id;
}

// No editable-status restriction — viewing an already-submitted
// document must keep working after DRAFT/ACTION_REQUIRED, unlike
// uploading a new one (requireMyApplicationId above).
async function requireMyApplicationIdForViewing(customerId: string): Promise<string> {
  const application = await prisma.affiliateApplication.findUnique({ where: { customerId }, select: { id: true } });
  if (!application) throw new AffiliateApplicationError("No affiliate application found for this account.", 404);
  return application.id;
}

export async function uploadMyDocumentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.customerUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }

    const file = req.file;
    if (!file) {
      sendError(res, { message: "A file is required (field name: file).", statusCode: 400 });
      return;
    }

    const slot = req.body?.slot;
    if (typeof slot !== "string" || !VALID_SLOTS.has(slot)) {
      sendError(res, { message: "slot must be IDENTITY or PROOF_OF_RESIDENCE.", statusCode: 400 });
      return;
    }

    let identityDocumentType: "SA_ID" | "PASSPORT" | undefined;
    let proofOfResidenceType: "BANK_STATEMENT" | "MUNICIPAL_ACCOUNT_OR_LETTER" | "PROOF_OF_RESIDENCE" | undefined;

    if (slot === "IDENTITY") {
      if (typeof req.body?.identityDocumentType !== "string" || !VALID_IDENTITY_TYPES.has(req.body.identityDocumentType)) {
        sendError(res, { message: "identityDocumentType must be SA_ID or PASSPORT.", statusCode: 400 });
        return;
      }
      identityDocumentType = req.body.identityDocumentType;
    } else {
      if (typeof req.body?.proofOfResidenceType !== "string" || !VALID_POR_TYPES.has(req.body.proofOfResidenceType)) {
        sendError(res, { message: "proofOfResidenceType must be BANK_STATEMENT, MUNICIPAL_ACCOUNT_OR_LETTER or PROOF_OF_RESIDENCE.", statusCode: 400 });
        return;
      }
      proofOfResidenceType = req.body.proofOfResidenceType;
    }

    const applicationId = await requireMyApplicationId(req.customerUser.id);

    const document = await uploadOrReplaceDocument({
      applicationId,
      slot: slot as "IDENTITY" | "PROOF_OF_RESIDENCE",
      identityDocumentType,
      proofOfResidenceType,
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
      originalName: file.originalname,
    });

    sendSuccess(res, {
      message: "Document uploaded successfully",
      statusCode: 201,
      data: {
        document: {
          id: document.id,
          slot: document.slot,
          fileName: document.fileName,
          classification: document.classification,
          classificationReason: document.classificationReason,
          nameMatchResult: document.nameMatchResult,
          addressMatchResult: document.addressMatchResult,
          idNumberMatchResult: document.idNumberMatchResult,
        },
      },
    });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function getMyDocumentSignedUrlHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.customerUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }
    const { documentId } = req.params;
    if (!documentId) {
      sendError(res, { message: "documentId is required.", statusCode: 400 });
      return;
    }

    const applicationId = await requireMyApplicationIdForViewing(req.customerUser.id);
    const signedUrl = await getSignedUrlForOwnDocument(applicationId, documentId);
    sendSuccess(res, { message: "Signed document URL generated successfully", data: { signedUrl } });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}
