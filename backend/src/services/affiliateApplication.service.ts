// Version 7, Milestone 176: the affiliate application/verification
// state machine — customer-facing half. Reuses referralAffiliate.service.ts's
// EXISTING createAffiliate()/approveAffiliate()/rejectAffiliate()
// completely unchanged (see this file's own comments at each call site)
// — nothing here ever touches Affiliate.status directly, and nothing
// here ever creates a second Affiliate row for the same customer.
//
// Lifecycle: DRAFT -> SUBMITTED -> UNDER_REVIEW -> (ACTION_REQUIRED ->
// resubmit -> UNDER_REVIEW)* -> APPROVED | REJECTED. A DRAFT never
// creates an Affiliate row — only genuine submission does (via
// submitMyApplication() below), matching brief section 30 ("do not
// allow SUBMITTED status until required fields/documents are present").
// Document classification (affiliateDocumentClassification.service.ts)
// runs synchronously at upload time (affiliateDocument.service.ts), so
// by the time submitMyApplication() is called every document is already
// classified — status moves straight to UNDER_REVIEW in the same call,
// with a SUBMITTED audit event recorded a moment earlier for a complete
// history.
//
// Legacy PENDING affiliates (brief section 51): a real Affiliate row
// created by the OLD, pre-176 simple "Apply" button has no
// AffiliateApplication at all. getOrCreateMyApplication() below detects
// this (an Affiliate row with no `application` back-relation) and links
// a fresh DRAFT application to that EXISTING affiliate id — it never
// calls createAffiliate() again (which would 409: "already linked to
// another affiliate"), and it never invents personal/document data on
// the applicant's behalf. An existing ACTIVE/SUSPENDED/REJECTED
// affiliate with no application is left completely alone — brief
// section 50: "do not force existing affiliates to upload documents
// automatically."

import { AffiliateApplicationEventType, AffiliateApplicationStatus, AffiliateApplicantType, AffiliateIdentityDocumentType, Prisma } from "@prisma/client";
import sanitizeHtml from "sanitize-html";
import { prisma } from "../config/prisma.js";
import { isValidEmail, isValidPostalCode, isValidSAPhone, SA_PROVINCES } from "../validators/shared.js";
import { isValidSAIdNumberFormat, isPlausiblePassportNumber, maskIdentityNumber } from "./affiliateIdentityValidation.util.js";
import { createAffiliate } from "./referralAffiliate.service.js";
import { preferredFrontendBaseUrl } from "../utils/frontendUrl.js";
import { renderAffiliateApplicationSubmittedEmail } from "./email/emailTemplates.js";
import * as notificationEngine from "./notificationEngine.service.js";

export class AffiliateApplicationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AffiliateApplicationError";
    this.statusCode = statusCode;
  }
}

const TERMS_VERSION = "2026-08-27"; // affiliateTerms.js's own "Last updated" date — see requireDeclarations() below.

function stripHtml(raw: string): string {
  return sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} }).trim();
}

// ---------------------------------------------------------------------------
// Field validation (brief section 30: "backend validation must be
// authoritative"). Every setter below accepts `unknown` and either
// returns a clean value or throws — never silently coerces bad input.
// ---------------------------------------------------------------------------

const MAX_SHORT_TEXT = 150;
const MAX_MEDIUM_TEXT = 300;
const MAX_LONG_TEXT = 2000;
const MAX_URL_LENGTH = 300;

function optionalText(raw: unknown, fieldName: string, maxLength: number): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") throw new AffiliateApplicationError(`${fieldName} must be a string.`);
  const cleaned = stripHtml(raw);
  if (cleaned.length > maxLength) throw new AffiliateApplicationError(`${fieldName} must be ${maxLength} characters or fewer.`);
  return cleaned.length > 0 ? cleaned : null;
}

function requiredTextForSubmit(value: string | null, fieldName: string): string {
  if (!value || value.trim().length === 0) throw new AffiliateApplicationError(`${fieldName} is required before submitting.`);
  return value;
}

function optionalUrl(raw: unknown, fieldName: string): string | null | undefined {
  const value = optionalText(raw, fieldName, MAX_URL_LENGTH);
  if (!value) return value;
  if (!/^https?:\/\/.+/i.test(value)) throw new AffiliateApplicationError(`${fieldName} must be a valid http(s) URL.`);
  return value;
}

// Allowlist of every field a customer may PATCH on their own DRAFT/
// ACTION_REQUIRED application — same "unrecognised key rejected
// outright" discipline as referralAffiliate.service.ts's updateAffiliate().
const EDITABLE_FIELDS = [
  "firstName",
  "middleName",
  "surname",
  "dateOfBirth",
  "nationality",
  "identityType",
  "idNumber",
  "passportNumber",
  "contactEmail",
  "mobileNumber",
  "whatsappNumber",
  "preferredContactMethod",
  "addressLine1",
  "addressLine2",
  "suburb",
  "city",
  "province",
  "postalCode",
  "country",
  "applicantType",
  "businessName",
  "businessRegistrationNumber",
  "businessWebsite",
  "promotionPlan",
  "websiteUrl",
  "facebookUrl",
  "instagramUrl",
  "tiktokUrl",
  "youtubeUrl",
  "otherPlatform",
  "audienceSize",
  "motivation",
  "infoAccurateConfirmed",
  "termsAccepted",
] as const;

function assertApplicationEditable(status: AffiliateApplicationStatus): void {
  if (status !== AffiliateApplicationStatus.DRAFT && status !== AffiliateApplicationStatus.ACTION_REQUIRED) {
    throw new AffiliateApplicationError(`This application cannot be edited while its status is ${status}.`, 409);
  }
}

export async function updateMyApplicationFields(customerId: string, rawInput: unknown): Promise<AffiliateApplicationOutput> {
  const application = await requireOwnedApplication(customerId);
  assertApplicationEditable(application.status);

  if (typeof rawInput !== "object" || rawInput === null) {
    throw new AffiliateApplicationError("Request body must be an object.");
  }
  const input = rawInput as Record<string, unknown>;

  const disallowedKeys = Object.keys(input).filter((key) => !(EDITABLE_FIELDS as readonly string[]).includes(key));
  if (disallowedKeys.length > 0) {
    throw new AffiliateApplicationError(`These fields cannot be edited here: ${disallowedKeys.join(", ")}.`);
  }

  const data: Prisma.AffiliateApplicationUpdateInput = {};

  if ("firstName" in input) data.firstName = requiredIfPresent(optionalText(input.firstName, "firstName", MAX_SHORT_TEXT));
  if ("middleName" in input) data.middleName = optionalText(input.middleName, "middleName", MAX_SHORT_TEXT);
  if ("surname" in input) data.surname = requiredIfPresent(optionalText(input.surname, "surname", MAX_SHORT_TEXT));
  if ("nationality" in input) data.nationality = optionalText(input.nationality, "nationality", MAX_SHORT_TEXT);

  if ("dateOfBirth" in input) {
    if (input.dateOfBirth === null || input.dateOfBirth === "") {
      data.dateOfBirth = null;
    } else if (typeof input.dateOfBirth === "string") {
      const parsed = new Date(input.dateOfBirth);
      if (Number.isNaN(parsed.getTime())) throw new AffiliateApplicationError("dateOfBirth must be a valid date.");
      if (parsed.getTime() > Date.now()) throw new AffiliateApplicationError("dateOfBirth cannot be in the future.");
      data.dateOfBirth = parsed;
    } else {
      throw new AffiliateApplicationError("dateOfBirth must be a date string.");
    }
  }

  if ("identityType" in input) {
    if (input.identityType === null) {
      data.identityType = null;
    } else if (input.identityType === "SA_ID" || input.identityType === "PASSPORT") {
      data.identityType = input.identityType as AffiliateIdentityDocumentType;
    } else {
      throw new AffiliateApplicationError("identityType must be SA_ID or PASSPORT.");
    }
  }

  if ("idNumber" in input) {
    const value = optionalText(input.idNumber, "idNumber", 20);
    if (value && !isValidSAIdNumberFormat(value)) {
      throw new AffiliateApplicationError("idNumber does not look like a valid South African ID number. Please check the digits and try again.");
    }
    data.idNumber = value;
  }

  if ("passportNumber" in input) {
    const value = optionalText(input.passportNumber, "passportNumber", 20);
    if (value && !isPlausiblePassportNumber(value)) {
      throw new AffiliateApplicationError("passportNumber does not look like a valid passport number.");
    }
    data.passportNumber = value;
  }

  if ("contactEmail" in input) {
    const value = optionalText(input.contactEmail, "contactEmail", MAX_SHORT_TEXT);
    if (value && !isValidEmail(value)) throw new AffiliateApplicationError("contactEmail must be a valid email address.");
    data.contactEmail = value ? value.toLowerCase() : value;
  }

  if ("mobileNumber" in input) {
    const value = optionalText(input.mobileNumber, "mobileNumber", 30);
    if (value && !isValidSAPhone(value)) throw new AffiliateApplicationError("mobileNumber must be a valid South African number.");
    data.mobileNumber = value;
  }

  if ("whatsappNumber" in input) {
    const value = optionalText(input.whatsappNumber, "whatsappNumber", 30);
    if (value && !isValidSAPhone(value)) throw new AffiliateApplicationError("whatsappNumber must be a valid South African number.");
    data.whatsappNumber = value;
  }

  if ("preferredContactMethod" in input) data.preferredContactMethod = optionalText(input.preferredContactMethod, "preferredContactMethod", 30);

  if ("addressLine1" in input) data.addressLine1 = optionalText(input.addressLine1, "addressLine1", MAX_MEDIUM_TEXT);
  if ("addressLine2" in input) data.addressLine2 = optionalText(input.addressLine2, "addressLine2", MAX_MEDIUM_TEXT);
  if ("suburb" in input) data.suburb = optionalText(input.suburb, "suburb", MAX_SHORT_TEXT);
  if ("city" in input) data.city = optionalText(input.city, "city", MAX_SHORT_TEXT);
  if ("country" in input) data.country = optionalText(input.country, "country", MAX_SHORT_TEXT);

  if ("province" in input) {
    const value = optionalText(input.province, "province", MAX_SHORT_TEXT);
    if (value && !(SA_PROVINCES as readonly string[]).includes(value)) {
      throw new AffiliateApplicationError(`province must be one of: ${SA_PROVINCES.join(", ")}.`);
    }
    data.province = value;
  }

  if ("postalCode" in input) {
    const value = optionalText(input.postalCode, "postalCode", 10);
    if (value && !isValidPostalCode(value)) throw new AffiliateApplicationError("postalCode must be a valid 4-digit South African postal code.");
    data.postalCode = value;
  }

  if ("applicantType" in input) {
    if (input.applicantType === "INDIVIDUAL" || input.applicantType === "BUSINESS") {
      data.applicantType = input.applicantType as AffiliateApplicantType;
    } else {
      throw new AffiliateApplicationError("applicantType must be INDIVIDUAL or BUSINESS.");
    }
  }

  if ("businessName" in input) data.businessName = optionalText(input.businessName, "businessName", MAX_SHORT_TEXT);
  if ("businessRegistrationNumber" in input) data.businessRegistrationNumber = optionalText(input.businessRegistrationNumber, "businessRegistrationNumber", 50);
  if ("businessWebsite" in input) data.businessWebsite = optionalUrl(input.businessWebsite, "businessWebsite");

  if ("promotionPlan" in input) data.promotionPlan = optionalText(input.promotionPlan, "promotionPlan", MAX_LONG_TEXT);
  if ("websiteUrl" in input) data.websiteUrl = optionalUrl(input.websiteUrl, "websiteUrl");
  if ("facebookUrl" in input) data.facebookUrl = optionalUrl(input.facebookUrl, "facebookUrl");
  if ("instagramUrl" in input) data.instagramUrl = optionalUrl(input.instagramUrl, "instagramUrl");
  if ("tiktokUrl" in input) data.tiktokUrl = optionalUrl(input.tiktokUrl, "tiktokUrl");
  if ("youtubeUrl" in input) data.youtubeUrl = optionalUrl(input.youtubeUrl, "youtubeUrl");
  if ("otherPlatform" in input) data.otherPlatform = optionalText(input.otherPlatform, "otherPlatform", MAX_SHORT_TEXT);
  if ("audienceSize" in input) data.audienceSize = optionalText(input.audienceSize, "audienceSize", MAX_SHORT_TEXT);
  if ("motivation" in input) data.motivation = optionalText(input.motivation, "motivation", MAX_LONG_TEXT);

  // Declarations (brief section 31) — never pre-ticked; a `false`/absent
  // value clears the timestamp (so un-confirming is always possible
  // before submission), only an explicit `true` sets it "now".
  if ("infoAccurateConfirmed" in input) {
    data.infoAccurateConfirmedAt = input.infoAccurateConfirmed === true ? new Date() : null;
  }
  if ("termsAccepted" in input) {
    data.termsAcceptedAt = input.termsAccepted === true ? new Date() : null;
    data.termsVersion = input.termsAccepted === true ? TERMS_VERSION : null;
  }

  if (Object.keys(data).length === 0) {
    throw new AffiliateApplicationError("No editable fields were provided.");
  }

  const updated = await prisma.affiliateApplication.update({ where: { id: application.id }, data });
  await recordEvent(application.id, AffiliateApplicationEventType.FIELDS_UPDATED, "CUSTOMER", null, "Application details updated.");

  return toOutput(updated, await getMyCurrentDocuments(updated.id));
}

function requiredIfPresent(value: string | null | undefined): string | null | undefined {
  return value;
}

// ---------------------------------------------------------------------------
// Read / start.
// ---------------------------------------------------------------------------

export interface AffiliateApplicationOutput {
  id: string;
  status: AffiliateApplicationStatus;
  firstName: string | null;
  middleName: string | null;
  surname: string | null;
  dateOfBirth: Date | null;
  nationality: string | null;
  identityType: AffiliateIdentityDocumentType | null;
  idNumberMasked: string | null;
  passportNumberMasked: string | null;
  contactEmail: string | null;
  mobileNumber: string | null;
  whatsappNumber: string | null;
  preferredContactMethod: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  applicantType: AffiliateApplicantType;
  businessName: string | null;
  businessRegistrationNumber: string | null;
  businessWebsite: string | null;
  promotionPlan: string | null;
  websiteUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  otherPlatform: string | null;
  audienceSize: string | null;
  motivation: string | null;
  infoAccurateConfirmed: boolean;
  termsAccepted: boolean;
  actionRequiredReason: string | null;
  actionRequiredArea: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  documents: AffiliateApplicationDocumentOutput[];
}

export interface AffiliateApplicationDocumentOutput {
  id: string;
  slot: "IDENTITY" | "PROOF_OF_RESIDENCE" | "BANKING_CONFIRMATION_LETTER";
  identityDocumentType: AffiliateIdentityDocumentType | null;
  proofOfResidenceType: string | null;
  fileName: string;
  classification: string | null;
  classificationReason: string | null;
  nameMatchResult: string | null;
  addressMatchResult: string | null;
  idNumberMatchResult: string | null;
  uploadedAt: Date;
}

type ApplicationRow = Prisma.AffiliateApplicationGetPayload<Record<string, never>>;

// The applicant's own CURRENT documents only — a superseded/replaced
// document (isCurrent: false) is history the applicant never needs to
// see again on their own application page, same "current state only"
// discipline as the admin detail view's own document list, which does
// show history since that's genuinely useful for a reviewer.
async function getMyCurrentDocuments(applicationId: string): Promise<AffiliateApplicationDocumentOutput[]> {
  const rows = await prisma.affiliateApplicationDocument.findMany({
    where: { applicationId, isCurrent: true },
    orderBy: { uploadedAt: "desc" },
  });
  return rows.map((doc) => ({
    id: doc.id,
    slot: doc.slot,
    identityDocumentType: doc.identityDocumentType,
    proofOfResidenceType: doc.proofOfResidenceType,
    fileName: doc.fileName,
    classification: doc.classification,
    classificationReason: doc.classificationReason,
    nameMatchResult: doc.nameMatchResult,
    addressMatchResult: doc.addressMatchResult,
    idNumberMatchResult: doc.idNumberMatchResult,
    uploadedAt: doc.uploadedAt,
  }));
}

// The applicant's own view of their own data is never masked — they
// typed every one of these values themselves; masking is specifically
// an admin list/detail-view protection (brief section 26/33), not
// something that applies to a customer viewing their own draft. Only
// the field name differs (`idNumberMasked`) to make it structurally
// obvious this is not the shape returned to admin callers.
function toOutput(row: ApplicationRow, documents: AffiliateApplicationDocumentOutput[] = []): AffiliateApplicationOutput {
  return {
    id: row.id,
    status: row.status,
    firstName: row.firstName,
    middleName: row.middleName,
    surname: row.surname,
    dateOfBirth: row.dateOfBirth,
    nationality: row.nationality,
    identityType: row.identityType,
    idNumberMasked: row.idNumber,
    passportNumberMasked: row.passportNumber,
    contactEmail: row.contactEmail,
    mobileNumber: row.mobileNumber,
    whatsappNumber: row.whatsappNumber,
    preferredContactMethod: row.preferredContactMethod,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    suburb: row.suburb,
    city: row.city,
    province: row.province,
    postalCode: row.postalCode,
    country: row.country,
    applicantType: row.applicantType,
    businessName: row.businessName,
    businessRegistrationNumber: row.businessRegistrationNumber,
    businessWebsite: row.businessWebsite,
    promotionPlan: row.promotionPlan,
    websiteUrl: row.websiteUrl,
    facebookUrl: row.facebookUrl,
    instagramUrl: row.instagramUrl,
    tiktokUrl: row.tiktokUrl,
    youtubeUrl: row.youtubeUrl,
    otherPlatform: row.otherPlatform,
    audienceSize: row.audienceSize,
    motivation: row.motivation,
    infoAccurateConfirmed: row.infoAccurateConfirmedAt !== null,
    termsAccepted: row.termsAcceptedAt !== null,
    actionRequiredReason: row.actionRequiredReason,
    actionRequiredArea: row.actionRequiredArea,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    documents,
  };
}

async function recordEvent(
  applicationId: string,
  eventType: AffiliateApplicationEventType,
  actorType: "CUSTOMER" | "ADMIN" | "SYSTEM",
  actorAdminUserId: string | null,
  summary: string
): Promise<void> {
  await prisma.affiliateApplicationEvent.create({
    data: { applicationId, eventType, actorType, actorAdminUserId, summary },
  });
}

async function requireOwnedApplication(customerId: string): Promise<ApplicationRow> {
  const application = await prisma.affiliateApplication.findUnique({ where: { customerId } });
  if (!application) {
    throw new AffiliateApplicationError("No affiliate application found for this account.", 404);
  }
  return application;
}

// "No affiliate application needed" is a real, valid outcome (an
// already-ACTIVE/SUSPENDED/REJECTED legacy affiliate — brief section
// 50) — represented as `null`, exactly like the pre-176
// getMyAffiliatePortal()'s own `hasAffiliate: false` convention, never
// an error.
export async function getOrCreateMyApplication(customerId: string): Promise<AffiliateApplicationOutput | null> {
  const existing = await prisma.affiliateApplication.findUnique({ where: { customerId } });
  if (existing) return toOutput(existing, await getMyCurrentDocuments(existing.id));

  const legacyAffiliate = await prisma.affiliate.findUnique({ where: { customerId }, select: { id: true, status: true } });
  if (legacyAffiliate) {
    if (legacyAffiliate.status !== "PENDING") {
      // ACTIVE/SUSPENDED/REJECTED from before this milestone — never
      // force a new application onto a real, already-decided affiliate.
      return null;
    }
    const created = await prisma.affiliateApplication.create({
      data: { customerId, affiliateId: legacyAffiliate.id, status: AffiliateApplicationStatus.DRAFT },
    });
    await recordEvent(created.id, AffiliateApplicationEventType.CREATED, "SYSTEM", null, "Application created to complete an existing pending affiliate signup.");
    return toOutput(created);
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { firstName: true, lastName: true, email: true, phone: true } });
  if (!customer) throw new AffiliateApplicationError("Customer account not found.", 404);

  const created = await prisma.affiliateApplication.create({
    data: {
      customerId,
      status: AffiliateApplicationStatus.DRAFT,
      // Pre-filled where safe (brief section 7) — never written back to
      // Customer, and always still editable/explicitly confirmed by the
      // applicant before submission.
      firstName: customer.firstName,
      surname: customer.lastName,
      contactEmail: customer.email,
      mobileNumber: customer.phone && isValidSAPhone(customer.phone) ? customer.phone : null,
    },
  });
  await recordEvent(created.id, AffiliateApplicationEventType.CREATED, "CUSTOMER", null, "Application created.");
  return toOutput(created);
}

// ---------------------------------------------------------------------------
// Submission (brief section 30) — authoritative, backend-only validation.
// ---------------------------------------------------------------------------

function requireDeclarations(app: ApplicationRow): void {
  if (!app.infoAccurateConfirmedAt) {
    throw new AffiliateApplicationError("Please confirm that the information and documents you've provided are accurate before submitting.");
  }
  if (!app.termsAcceptedAt) {
    throw new AffiliateApplicationError("Please confirm you've read and agree to the Seasonedz Affiliate Programme Terms before submitting.");
  }
}

function requiredFieldsForSubmit(app: ApplicationRow): void {
  requiredTextForSubmit(app.firstName, "First name");
  requiredTextForSubmit(app.surname, "Surname");
  if (!app.dateOfBirth) throw new AffiliateApplicationError("Date of birth is required before submitting.");
  requiredTextForSubmit(app.nationality, "Nationality");

  if (!app.identityType) throw new AffiliateApplicationError("Please select an identity document type (South African ID or Passport).");
  if (app.identityType === "SA_ID") requiredTextForSubmit(app.idNumber, "ID number");
  if (app.identityType === "PASSPORT") requiredTextForSubmit(app.passportNumber, "Passport number");

  requiredTextForSubmit(app.contactEmail, "Contact email");
  requiredTextForSubmit(app.mobileNumber, "Mobile number");

  requiredTextForSubmit(app.addressLine1, "Address line 1");
  requiredTextForSubmit(app.suburb, "Suburb");
  requiredTextForSubmit(app.city, "City/Town");
  requiredTextForSubmit(app.province, "Province");
  requiredTextForSubmit(app.postalCode, "Postal code");
  requiredTextForSubmit(app.country, "Country");

  if (app.applicantType === "BUSINESS") {
    requiredTextForSubmit(app.businessName, "Business name");
  }

  requiredTextForSubmit(app.promotionPlan, "How you plan to promote Seasonedz");
  requiredTextForSubmit(app.motivation, "Why you want to join the Affiliate Programme");

  requireDeclarations(app);
}

// Milestone 178: the only document a new (or resubmitting) affiliate
// application must have on file is a current Banking Confirmation
// Letter (brief section 12) — IDENTITY/PROOF_OF_RESIDENCE are no
// longer required here, though historical documents in those slots are
// left completely alone (never deleted, never re-required). This
// applies uniformly to every DRAFT/ACTION_REQUIRED application,
// including ones that predate this milestone (brief section 31): an
// applicant who already has old IDENTITY/PROOF_OF_RESIDENCE documents
// but no Banking Confirmation Letter yet is prompted for the new
// document before they can (re)submit.
async function requireCurrentDocuments(applicationId: string): Promise<void> {
  const bankingConfirmationLetter = await prisma.affiliateApplicationDocument.findFirst({
    where: { applicationId, slot: "BANKING_CONFIRMATION_LETTER", isCurrent: true },
  });
  if (!bankingConfirmationLetter) {
    throw new AffiliateApplicationError("Please upload a Banking Confirmation Letter before submitting.");
  }
}

export async function submitMyApplication(customerId: string): Promise<AffiliateApplicationOutput> {
  const application = await requireOwnedApplication(customerId);

  if (application.status !== AffiliateApplicationStatus.DRAFT && application.status !== AffiliateApplicationStatus.ACTION_REQUIRED) {
    throw new AffiliateApplicationError(`This application cannot be submitted while its status is ${application.status}.`, 409);
  }

  requiredFieldsForSubmit(application);
  await requireCurrentDocuments(application.id);

  const isResubmission = application.status === AffiliateApplicationStatus.ACTION_REQUIRED;

  // Reuses the EXISTING createAffiliate() completely unchanged — never
  // called again on resubmission (affiliateId is already set from the
  // first submission), so this can never create a second Affiliate row
  // or hit its own "already linked" 409 for a genuine resubmit.
  let affiliateId = application.affiliateId;
  if (!affiliateId) {
    const affiliate = await createAffiliate({
      customerId,
      name: `${application.firstName} ${application.surname}`.trim(),
      email: application.contactEmail,
      phone: application.mobileNumber,
    });
    affiliateId = affiliate.id;
  }

  const now = new Date();
  const updated = await prisma.affiliateApplication.update({
    where: { id: application.id },
    data: {
      affiliateId,
      status: AffiliateApplicationStatus.UNDER_REVIEW,
      submittedAt: now,
      reviewedAt: null,
      actionRequiredReason: null,
      actionRequiredArea: null,
    },
  });

  await recordEvent(application.id, AffiliateApplicationEventType.SUBMITTED, "CUSTOMER", null, isResubmission ? "Application resubmitted after corrections." : "Application submitted.");
  if (isResubmission) {
    await recordEvent(application.id, AffiliateApplicationEventType.RESUBMITTED, "CUSTOMER", null, "Resubmitted for review.");
  }
  await recordEvent(application.id, AffiliateApplicationEventType.CLASSIFICATION_COMPLETED, "SYSTEM", null, "All required documents were already classified at upload time. Ready for admin review.");

  void notificationEngine
    .enqueueAndSendNow({
      eventType: "AFFILIATE_APPLICATION_SUBMITTED",
      templateName: "affiliate-application-submitted",
      recipientEmail: updated.contactEmail ?? undefined,
      recipientCustomerId: customerId,
      affiliateId,
      dedupeKey: `AFFILIATE_APPLICATION_SUBMITTED:${application.id}:${now.toISOString()}`,
      rendered: renderAffiliateApplicationSubmittedEmail({ applicantFirstName: updated.firstName || "there" }),
    })
    .catch(() => {});

  return toOutput(updated, await getMyCurrentDocuments(updated.id));
}

export function revealIdentityNumber(app: Pick<ApplicationRow, "identityType" | "idNumber" | "passportNumber">): string | null {
  if (app.identityType === "SA_ID") return app.idNumber;
  if (app.identityType === "PASSPORT") return app.passportNumber;
  return null;
}

export { maskIdentityNumber, TERMS_VERSION };
