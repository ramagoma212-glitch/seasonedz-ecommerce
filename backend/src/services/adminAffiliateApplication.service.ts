// Version 7, Milestone 176: admin-facing affiliate application review —
// list/detail/decisions. Approve/reject reuse
// referralAffiliate.service.ts's EXISTING approveAffiliate()/
// rejectAffiliate() completely unchanged (brief section 37: "only
// authorised admin approval should transition the applicant into the
// existing ACTIVE affiliate state... do not generate a second affiliate
// account") — this file never writes Affiliate.status itself.

import { AffiliateApplicationEventType, AffiliateApplicationStatus, Prisma } from "@prisma/client";
import sanitizeHtml from "sanitize-html";
import { prisma } from "../config/prisma.js";
import { approveAffiliate, rejectAffiliate } from "./referralAffiliate.service.js";
import { maskIdentityNumber, revealIdentityNumber } from "./affiliateApplication.service.js";
import { affiliateDocumentStorage } from "./affiliateDocumentStorage.service.js";
import { preferredFrontendBaseUrl } from "../utils/frontendUrl.js";
import { renderAffiliateApplicationActionRequiredEmail } from "./email/emailTemplates.js";
import * as notificationEngine from "./notificationEngine.service.js";

export class AdminAffiliateApplicationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AdminAffiliateApplicationError";
    this.statusCode = statusCode;
  }
}

function stripHtml(raw: string): string {
  return sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} }).trim();
}

function documentSlotLabel(slot: string): string {
  if (slot === "IDENTITY") return "identity";
  if (slot === "BANKING_CONFIRMATION_LETTER") return "banking confirmation letter";
  return "proof of residence";
}

// ---------------------------------------------------------------------------
// List — summary fields only (brief section 33). Never selects
// idNumber/passportNumber at all, not even masked — masking is for the
// detail view; the list view goes further and omits the column
// entirely.
// ---------------------------------------------------------------------------

const listSelect = {
  id: true,
  status: true,
  applicantType: true,
  firstName: true,
  surname: true,
  contactEmail: true,
  mobileNumber: true,
  city: true,
  province: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AffiliateApplicationSelect;

export interface AffiliateApplicationListFilters {
  page: number;
  limit: number;
  status?: AffiliateApplicationStatus;
  search?: string;
}

function buildWhere(filters: AffiliateApplicationListFilters): Prisma.AffiliateApplicationWhereInput {
  const and: Prisma.AffiliateApplicationWhereInput[] = [];
  if (filters.status) and.push({ status: filters.status });
  if (filters.search) {
    and.push({
      OR: [
        { firstName: { contains: filters.search, mode: "insensitive" } },
        { surname: { contains: filters.search, mode: "insensitive" } },
        { contactEmail: { contains: filters.search, mode: "insensitive" } },
      ],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

export async function listApplications(filters: AffiliateApplicationListFilters) {
  const where = buildWhere(filters);
  const [total, applications] = await Promise.all([
    prisma.affiliateApplication.count({ where }),
    prisma.affiliateApplication.findMany({
      where,
      select: listSelect,
      orderBy: { updatedAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return {
    applications: applications.map((row) => ({
      id: row.id,
      status: row.status,
      applicantType: row.applicantType,
      fullName: `${row.firstName || ""} ${row.surname || ""}`.trim() || null,
      email: row.contactEmail,
      mobile: row.mobileNumber,
      city: row.city,
      province: row.province,
      submittedAt: row.submittedAt,
      updatedAt: row.updatedAt,
    })),
    total,
    page: filters.page,
    limit: filters.limit,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
  };
}

export async function getApplicationStatusCounts(): Promise<Record<AffiliateApplicationStatus, number>> {
  const rows = await prisma.affiliateApplication.groupBy({ by: ["status"], _count: { _all: true } });
  const counts: Record<AffiliateApplicationStatus, number> = { DRAFT: 0, SUBMITTED: 0, UNDER_REVIEW: 0, ACTION_REQUIRED: 0, APPROVED: 0, REJECTED: 0 };
  for (const row of rows) counts[row.status] = row._count._all;
  return counts;
}

// ---------------------------------------------------------------------------
// Detail — masked identity number by default (brief section 26/34).
// ---------------------------------------------------------------------------

async function requireApplication(id: string) {
  const application = await prisma.affiliateApplication.findUnique({
    where: { id },
    include: { documents: { orderBy: { createdAt: "desc" } } },
  });
  if (!application) throw new AdminAffiliateApplicationError(`Application not found: ${id}`, 404);
  return application;
}

export async function getApplicationDetail(id: string) {
  const application = await requireApplication(id);
  const rawNumber = revealIdentityNumber(application);

  return {
    id: application.id,
    status: application.status,
    firstName: application.firstName,
    middleName: application.middleName,
    surname: application.surname,
    dateOfBirth: application.dateOfBirth,
    nationality: application.nationality,
    identityType: application.identityType,
    identityNumberMasked: maskIdentityNumber(rawNumber),
    contactEmail: application.contactEmail,
    mobileNumber: application.mobileNumber,
    whatsappNumber: application.whatsappNumber,
    preferredContactMethod: application.preferredContactMethod,
    addressLine1: application.addressLine1,
    addressLine2: application.addressLine2,
    suburb: application.suburb,
    city: application.city,
    province: application.province,
    postalCode: application.postalCode,
    country: application.country,
    applicantType: application.applicantType,
    businessName: application.businessName,
    businessRegistrationNumber: application.businessRegistrationNumber,
    businessWebsite: application.businessWebsite,
    promotionPlan: application.promotionPlan,
    websiteUrl: application.websiteUrl,
    facebookUrl: application.facebookUrl,
    instagramUrl: application.instagramUrl,
    tiktokUrl: application.tiktokUrl,
    youtubeUrl: application.youtubeUrl,
    otherPlatform: application.otherPlatform,
    audienceSize: application.audienceSize,
    motivation: application.motivation,
    infoAccurateConfirmed: application.infoAccurateConfirmedAt !== null,
    termsAccepted: application.termsAcceptedAt !== null,
    termsVersion: application.termsVersion,
    actionRequiredReason: application.actionRequiredReason,
    actionRequiredArea: application.actionRequiredArea,
    submittedAt: application.submittedAt,
    reviewedAt: application.reviewedAt,
    approvedAt: application.approvedAt,
    rejectedAt: application.rejectedAt,
    affiliateId: application.affiliateId,
    documents: application.documents.map((doc) => ({
      id: doc.id,
      slot: doc.slot,
      identityDocumentType: doc.identityDocumentType,
      proofOfResidenceType: doc.proofOfResidenceType,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileSizeBytes: doc.fileSizeBytes,
      isCurrent: doc.isCurrent,
      classification: doc.classification,
      classificationReason: doc.classificationReason,
      nameMatchResult: doc.nameMatchResult,
      addressMatchResult: doc.addressMatchResult,
      idNumberMatchResult: doc.idNumberMatchResult,
      uploadedAt: doc.uploadedAt,
    })),
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
}

// Dedicated "reveal" action (brief section 26: "full value should only
// be available when genuinely necessary for authorised review") —
// audit-logged so there's a record of who looked, distinct from the
// ordinary (masked) detail view above.
export async function revealApplicationIdentityNumber(id: string, adminUserId: string): Promise<string | null> {
  const application = await requireApplication(id);
  const raw = revealIdentityNumber(application);
  await prisma.affiliateApplicationEvent.create({
    data: { applicationId: id, eventType: "FIELDS_UPDATED", actorType: "ADMIN", actorAdminUserId: adminUserId, summary: "Admin viewed the full (unmasked) identity number." },
  });
  return raw;
}

const SIGNED_URL_EXPIRY_SECONDS = 300;

export async function getSignedUrlForAdminDocument(applicationId: string, documentId: string, adminUserId: string): Promise<string> {
  const document = await prisma.affiliateApplicationDocument.findFirst({ where: { id: documentId, applicationId } });
  if (!document) throw new AdminAffiliateApplicationError("Document not found.", 404);

  await prisma.affiliateApplicationEvent.create({
    data: { applicationId, eventType: "FIELDS_UPDATED", actorType: "ADMIN", actorAdminUserId: adminUserId, summary: `Admin viewed the ${documentSlotLabel(document.slot)} document.` },
  });

  return affiliateDocumentStorage.createSignedAffiliateDocumentUrl(document.storagePath, SIGNED_URL_EXPIRY_SECONDS);
}

// ---------------------------------------------------------------------------
// Decisions (brief section 36).
// ---------------------------------------------------------------------------

function assertUnderReview(status: AffiliateApplicationStatus, action: string): void {
  if (status !== AffiliateApplicationStatus.UNDER_REVIEW) {
    throw new AdminAffiliateApplicationError(`Cannot ${action} an application with status ${status}. It must be Under Review.`, 409);
  }
}

// IDENTITY_DOCUMENT/PROOF_OF_RESIDENCE stay valid (never removed) so an
// admin can still request a correction against a historical
// application's existing documents; BANKING_CONFIRMATION_LETTER is the
// Milestone 178 area for the document new applications actually submit.
const CORRECTION_AREAS = ["PERSONAL_DETAILS", "IDENTITY_DOCUMENT", "PROOF_OF_RESIDENCE", "BANKING_CONFIRMATION_LETTER", "OTHER"] as const;

export async function requestCorrection(id: string, rawReason: unknown, rawArea: unknown, adminUserId: string) {
  const application = await requireApplication(id);
  assertUnderReview(application.status, "request a correction on");

  if (typeof rawReason !== "string" || rawReason.trim().length === 0) {
    throw new AdminAffiliateApplicationError("A reason is required when requesting a correction.");
  }
  const reason = stripHtml(rawReason);
  if (reason.length === 0) throw new AdminAffiliateApplicationError("A reason is required when requesting a correction.");
  if (reason.length > 1000) throw new AdminAffiliateApplicationError("Reason must be 1000 characters or fewer.");

  const area = typeof rawArea === "string" && (CORRECTION_AREAS as readonly string[]).includes(rawArea) ? rawArea : "OTHER";

  const updated = await prisma.affiliateApplication.update({
    where: { id },
    data: { status: AffiliateApplicationStatus.ACTION_REQUIRED, actionRequiredReason: reason, actionRequiredArea: area, reviewedAt: new Date() },
  });

  await prisma.affiliateApplicationEvent.create({
    data: { applicationId: id, eventType: AffiliateApplicationEventType.ACTION_REQUIRED, actorType: "ADMIN", actorAdminUserId: adminUserId, summary: `Correction requested (${area}): ${reason}` },
  });

  void notificationEngine
    .enqueueAndSendNow({
      eventType: "AFFILIATE_APPLICATION_ACTION_REQUIRED",
      templateName: "affiliate-application-action-required",
      recipientEmail: updated.contactEmail ?? undefined,
      recipientCustomerId: updated.customerId,
      affiliateId: updated.affiliateId ?? undefined,
      dedupeKey: `AFFILIATE_APPLICATION_ACTION_REQUIRED:${id}:${updated.updatedAt.toISOString()}`,
      rendered: renderAffiliateApplicationActionRequiredEmail({
        applicantFirstName: updated.firstName || "there",
        reason,
        applicationUrl: `${preferredFrontendBaseUrl()}/account/affiliate-application`,
      }),
    })
    .catch(() => {});

  return updated;
}

// Milestone 178, brief section 29: a defensive guard at the point of
// approval, distinct from (and in addition to) requireCurrentDocuments()
// in affiliateApplication.service.ts, which only runs at submission
// time. Belt and braces — a document uploaded before submission could
// in principle be superseded, or classified MISMATCH, without blocking
// submission itself (submission only requires a document to exist in
// the slot, not that it passed classification), so approval re-checks
// the CURRENT banking confirmation letter is present and not a
// confident MISMATCH before the applicant can become an active
// affiliate.
async function assertBankingConfirmationLetterReadyForApproval(applicationId: string): Promise<void> {
  const letter = await prisma.affiliateApplicationDocument.findFirst({
    where: { applicationId, slot: "BANKING_CONFIRMATION_LETTER", isCurrent: true },
  });
  if (!letter) {
    throw new AdminAffiliateApplicationError("This application has no current Banking Confirmation Letter. It cannot be approved.", 409);
  }
  if (letter.classification === "MISMATCH") {
    throw new AdminAffiliateApplicationError("The current Banking Confirmation Letter was classified as a mismatch and has not been replaced. It cannot be approved.", 409);
  }
}

export async function approveApplication(id: string, adminUserId: string) {
  const application = await requireApplication(id);
  assertUnderReview(application.status, "approve");
  if (!application.affiliateId) {
    throw new AdminAffiliateApplicationError("This application has no linked affiliate record. It cannot be approved.", 409);
  }
  await assertBankingConfirmationLetterReadyForApproval(id);

  // Reused, unchanged — this is the ONLY place Affiliate.status ever
  // transitions PENDING -> ACTIVE, exactly as before this milestone.
  await approveAffiliate(application.affiliateId);

  const updated = await prisma.affiliateApplication.update({
    where: { id },
    data: { status: AffiliateApplicationStatus.APPROVED, approvedAt: new Date(), reviewedAt: new Date() },
  });

  await prisma.affiliateApplicationEvent.create({
    data: { applicationId: id, eventType: AffiliateApplicationEventType.APPROVED, actorType: "ADMIN", actorAdminUserId: adminUserId, summary: "Application approved." },
  });

  return updated;
}

export async function rejectApplication(id: string, rawReason: unknown, adminUserId: string) {
  const application = await requireApplication(id);
  assertUnderReview(application.status, "reject");
  if (!application.affiliateId) {
    throw new AdminAffiliateApplicationError("This application has no linked affiliate record. It cannot be rejected.", 409);
  }

  const reason = typeof rawReason === "string" && rawReason.trim().length > 0 ? stripHtml(rawReason).slice(0, 1000) : null;

  // Reused, unchanged — this is the ONLY place Affiliate.status ever
  // transitions PENDING -> REJECTED, exactly as before this milestone.
  await rejectAffiliate(application.affiliateId);

  const updated = await prisma.affiliateApplication.update({
    where: { id },
    data: { status: AffiliateApplicationStatus.REJECTED, rejectedAt: new Date(), reviewedAt: new Date() },
  });

  await prisma.affiliateApplicationEvent.create({
    data: { applicationId: id, eventType: AffiliateApplicationEventType.REJECTED, actorType: "ADMIN", actorAdminUserId: adminUserId, summary: reason ? `Application rejected: ${reason}` : "Application rejected." },
  });

  return updated;
}

export async function getApplicationEvents(id: string) {
  await requireApplication(id);
  return prisma.affiliateApplicationEvent.findMany({ where: { applicationId: id }, orderBy: { createdAt: "desc" } });
}
