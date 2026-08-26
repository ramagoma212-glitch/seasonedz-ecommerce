// Version 7, Milestone 172B.3: Seasonedz's own affiliate/referral
// programme — management of the Affiliate model. Deliberately named
// "referral*", not "affiliate*", throughout this feature's files
// (services/referralAffiliate.service.ts, referralProgrammeSettings,
// referralCommission, controllers/adminReferral*, routes/
// adminReferrals.routes.ts) so nothing here can ever be confused with
// 172B's dormant, external-merchant AffiliateProduct/AffiliateClick/
// AffiliateCommission files — see the 172B.2 architecture audit.
//
// No route in this milestone wires a referral into checkout, applies a
// discount, or creates an OrderAffiliateCommission — that's 172B.4/
// 172B.5. This file only manages Affiliate rows for admin approval.

import { Prisma, AffiliateStatus } from "@prisma/client";
import sanitizeHtml from "sanitize-html";
import { prisma } from "../config/prisma.js";
import { isValidEmail, isValidSAPhone } from "../validators/shared.js";

export class ReferralAffiliateError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ReferralAffiliateError";
    this.statusCode = statusCode;
  }
}

const MAX_NAME_LENGTH = 150;
const MAX_NOTES_LENGTH = 2000;
const MIN_REFERRAL_CODE_LENGTH = 3;
const MAX_REFERRAL_CODE_LENGTH = 30;
// Letters, digits, and a single hyphen as the only approved separator
// — the same slug-safety shape already used for AffiliateProduct.slug/
// trackingSlug (172B) and Product.slug, so this project has exactly
// one "URL-safe short code" format, not several slightly different
// ones. No leading/trailing/doubled hyphen (would be a confusing,
// easy-to-mistype public code).
const REFERRAL_CODE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Free text fields (name, notes) are stripped of every HTML tag
// entirely — same "plain text only, stricter than the rich-text
// allowlist" discipline already used for AffiliateProduct's own
// free-text fields (172B) — closes stored XSS at the data layer, not
// only by hoping a future frontend remembers to escape on render.
function stripHtml(raw: string): string {
  return sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} }).trim();
}

function requireTrimmedString(raw: unknown, fieldName: string, maxLength: number): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new ReferralAffiliateError(`${fieldName} is required.`);
  }
  const cleaned = stripHtml(raw);
  if (cleaned.length === 0) {
    throw new ReferralAffiliateError(`${fieldName} is required.`);
  }
  if (cleaned.length > maxLength) {
    throw new ReferralAffiliateError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return cleaned;
}

function optionalTrimmedString(raw: unknown, fieldName: string, maxLength: number): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    throw new ReferralAffiliateError(`${fieldName} must be a string.`);
  }
  const cleaned = stripHtml(raw);
  if (cleaned.length > maxLength) {
    throw new ReferralAffiliateError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return cleaned.length > 0 ? cleaned : null;
}

// Case-insensitively normalised before every write/lookup — same
// inline `.trim().toLowerCase()` discipline already used at every real
// email call site in this backend (customerAuth.service.ts,
// newsletter.validator.ts), so "Person@Example.com" and
// "person@example.com" can never become two different affiliates.
function normaliseEmail(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new ReferralAffiliateError("email is required.");
  }
  const email = raw.trim().toLowerCase();
  if (!isValidEmail(email)) {
    throw new ReferralAffiliateError("email must be a valid email address.");
  }
  return email;
}

function optionalPhone(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const trimmed = raw.trim();
  if (!isValidSAPhone(trimmed)) {
    throw new ReferralAffiliateError("phone must be a valid South African number.");
  }
  return trimmed;
}

// Public and shareable — never a secret (see the schema's own
// comment). Normalised to lowercase, HTML/script/control-character-
// free by construction (the pattern below only ever matches
// [a-z0-9-]), 3-30 characters, no spaces.
function validateReferralCodeFormat(raw: string, fieldName = "referralCode"): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length < MIN_REFERRAL_CODE_LENGTH || trimmed.length > MAX_REFERRAL_CODE_LENGTH) {
    throw new ReferralAffiliateError(`${fieldName} must be between ${MIN_REFERRAL_CODE_LENGTH} and ${MAX_REFERRAL_CODE_LENGTH} characters.`);
  }
  if (!REFERRAL_CODE_PATTERN.test(trimmed)) {
    throw new ReferralAffiliateError(`${fieldName} may only contain lowercase letters, numbers and single hyphens (no spaces, HTML or symbols).`);
  }
  return trimmed;
}

function requireReferralCode(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new ReferralAffiliateError("referralCode is required.");
  }
  return validateReferralCodeFormat(raw);
}

function slugifyForCodeSuggestion(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const MAX_CODE_GENERATION_ATTEMPTS = 50;

async function generateUniqueReferralCode(base: string): Promise<string> {
  const baseCode = slugifyForCodeSuggestion(base).slice(0, MAX_REFERRAL_CODE_LENGTH);
  if (baseCode.length < MIN_REFERRAL_CODE_LENGTH) {
    throw new ReferralAffiliateError("Could not suggest a referral code from this name — please provide one manually.");
  }

  let candidate = baseCode;
  let suffix = 2;
  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
    const existing = await prisma.affiliate.findUnique({ where: { referralCode: candidate }, select: { id: true } });
    if (!existing) return candidate;
    const suffixText = `-${suffix}`;
    candidate = `${baseCode.slice(0, MAX_REFERRAL_CODE_LENGTH - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  throw new ReferralAffiliateError("Could not generate a unique referral code automatically — please provide one manually.");
}

// Rate validation. 0-50% is a defensible sanity ceiling: comfortably
// above any realistic Seasonedz commission or referral-discount
// policy (the V1 defaults are 7% and 5%), while still catching an
// obvious data-entry mistake like 500 instead of 5.
const MAX_RATE_PERCENT = 50;

function optionalRateOverride(raw: unknown, fieldName: string): number | null {
  if (raw === undefined || raw === null) return null;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value < 0 || value > MAX_RATE_PERCENT) {
    throw new ReferralAffiliateError(`${fieldName} must be a number between 0 and ${MAX_RATE_PERCENT}.`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Output shape — admin read only. There is no public affiliate/referral
// route anywhere yet (172B.4), so nothing here needs to hide any field
// from a non-admin caller today; the future public resolution endpoint
// must only ever expose isActive/name/referralCode, never id/email/
// overrides/notes — flagged here so that boundary isn't forgotten.
// ---------------------------------------------------------------------------

export interface AffiliateOutput {
  id: string;
  customerId: string | null;
  name: string;
  email: string;
  phone: string | null;
  referralCode: string;
  status: AffiliateStatus;
  commissionRateOverride: number | null;
  discountRateOverride: number | null;
  approvedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type AffiliateRow = Prisma.AffiliateGetPayload<Record<string, never>>;

function toOutput(row: AffiliateRow): AffiliateOutput {
  return {
    id: row.id,
    customerId: row.customerId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    referralCode: row.referralCode,
    status: row.status,
    commissionRateOverride: row.commissionRateOverride ? row.commissionRateOverride.toNumber() : null,
    discountRateOverride: row.discountRateOverride ? row.discountRateOverride.toNumber() : null,
    approvedAt: row.approvedAt,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// List / detail.
// ---------------------------------------------------------------------------

export interface AffiliateListFilters {
  page: number;
  limit: number;
  status?: AffiliateStatus;
  search?: string;
}

export interface AffiliateListResult {
  affiliates: AffiliateOutput[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function buildWhere(filters: AffiliateListFilters): Prisma.AffiliateWhereInput {
  const and: Prisma.AffiliateWhereInput[] = [];
  if (filters.status) and.push({ status: filters.status });
  if (filters.search) {
    and.push({
      OR: [
        { name: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
        { referralCode: { contains: filters.search, mode: "insensitive" } },
      ],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

export async function listAffiliates(filters: AffiliateListFilters): Promise<AffiliateListResult> {
  const where = buildWhere(filters);
  const [total, affiliates] = await Promise.all([
    prisma.affiliate.count({ where }),
    prisma.affiliate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return {
    affiliates: affiliates.map(toOutput),
    total,
    page: filters.page,
    limit: filters.limit,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
  };
}

export async function getAffiliate(id: string): Promise<AffiliateOutput | null> {
  const affiliate = await prisma.affiliate.findUnique({ where: { id } });
  return affiliate ? toOutput(affiliate) : null;
}

// Counts only — used by the admin Referrals overview (§16 of the
// brief). Never fabricates clicks/orders/commission figures for a
// programme with no real referred orders yet; those come from
// referralCommission.service.ts once real rows exist (172B.4+).
export async function getAffiliateStatusCounts(): Promise<Record<AffiliateStatus, number>> {
  const rows = await prisma.affiliate.groupBy({ by: ["status"], _count: { _all: true } });
  const counts: Record<AffiliateStatus, number> = { PENDING: 0, ACTIVE: 0, SUSPENDED: 0, REJECTED: 0 };
  for (const row of rows) counts[row.status] = row._count._all;
  return counts;
}

// ---------------------------------------------------------------------------
// Create (manual, admin-entered — Step 17: "create affiliate manually").
// Always starts PENDING regardless of what the request sends — approval
// is a separate, explicit action (§18: "no automatic affiliate
// approval").
// ---------------------------------------------------------------------------

export interface AffiliateCreateInput {
  customerId?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  referralCode?: unknown;
  commissionRateOverride?: unknown;
  discountRateOverride?: unknown;
  notes?: unknown;
}

async function assertCustomerExistsAndUnlinked(customerId: string, excludingAffiliateId?: string): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) {
    throw new ReferralAffiliateError("customerId does not match an existing customer.");
  }
  const existingLink = await prisma.affiliate.findUnique({ where: { customerId }, select: { id: true } });
  if (existingLink && existingLink.id !== excludingAffiliateId) {
    throw new ReferralAffiliateError("This customer is already linked to another affiliate.", 409);
  }
}

export async function createAffiliate(rawInput: unknown): Promise<AffiliateOutput> {
  if (typeof rawInput !== "object" || rawInput === null) {
    throw new ReferralAffiliateError("Request body must be an object.");
  }
  const input = rawInput as AffiliateCreateInput;

  const name = requireTrimmedString(input.name, "name", MAX_NAME_LENGTH);
  const email = normaliseEmail(input.email);
  const phone = optionalPhone(input.phone);
  const notes = optionalTrimmedString(input.notes, "notes", MAX_NOTES_LENGTH);
  const commissionRateOverride = optionalRateOverride(input.commissionRateOverride, "commissionRateOverride");
  const discountRateOverride = optionalRateOverride(input.discountRateOverride, "discountRateOverride");

  const existingEmail = await prisma.affiliate.findUnique({ where: { email }, select: { id: true } });
  if (existingEmail) {
    throw new ReferralAffiliateError(`An affiliate with this email already exists: ${email}`, 409);
  }

  let customerId: string | null = null;
  if (typeof input.customerId === "string" && input.customerId.trim().length > 0) {
    customerId = input.customerId.trim();
    await assertCustomerExistsAndUnlinked(customerId);
  }

  let referralCode: string;
  if (typeof input.referralCode === "string" && input.referralCode.trim().length > 0) {
    referralCode = requireReferralCode(input.referralCode);
    const existingCode = await prisma.affiliate.findUnique({ where: { referralCode }, select: { id: true } });
    if (existingCode) {
      throw new ReferralAffiliateError(`Referral code already in use: ${referralCode}`, 409);
    }
  } else {
    referralCode = await generateUniqueReferralCode(name);
  }

  const affiliate = await prisma.affiliate.create({
    data: {
      customerId,
      name,
      email,
      phone,
      referralCode,
      status: AffiliateStatus.PENDING,
      commissionRateOverride,
      discountRateOverride,
      notes,
    },
  });

  return toOutput(affiliate);
}

// ---------------------------------------------------------------------------
// Update — restricted-fields allowlist, same discipline as
// adminAffiliateProduct.service.ts's own updateAffiliateProduct(): a
// field absent from the request is never touched, and an unrecognised
// key is rejected outright rather than silently ignored.
// ---------------------------------------------------------------------------

const ALLOWED_UPDATE_FIELDS = ["name", "email", "phone", "referralCode", "commissionRateOverride", "discountRateOverride", "notes", "customerId"] as const;

export async function updateAffiliate(id: string, rawInput: unknown): Promise<AffiliateOutput> {
  const existing = await prisma.affiliate.findUnique({ where: { id } });
  if (!existing) {
    throw new ReferralAffiliateError(`Affiliate not found: ${id}`, 404);
  }

  if (typeof rawInput !== "object" || rawInput === null) {
    throw new ReferralAffiliateError("Request body must be an object.");
  }
  const input = rawInput as Record<string, unknown>;

  const disallowedKeys = Object.keys(input).filter((key) => !(ALLOWED_UPDATE_FIELDS as readonly string[]).includes(key));
  if (disallowedKeys.length > 0) {
    throw new ReferralAffiliateError(`These fields cannot be edited here: ${disallowedKeys.join(", ")}.`);
  }

  const data: Prisma.AffiliateUpdateInput = {};

  if ("name" in input) data.name = requireTrimmedString(input.name, "name", MAX_NAME_LENGTH);
  if ("phone" in input) data.phone = optionalPhone(input.phone);
  if ("notes" in input) data.notes = optionalTrimmedString(input.notes, "notes", MAX_NOTES_LENGTH);
  if ("commissionRateOverride" in input) data.commissionRateOverride = optionalRateOverride(input.commissionRateOverride, "commissionRateOverride");
  if ("discountRateOverride" in input) data.discountRateOverride = optionalRateOverride(input.discountRateOverride, "discountRateOverride");

  if ("email" in input) {
    const email = normaliseEmail(input.email);
    if (email !== existing.email) {
      const owner = await prisma.affiliate.findUnique({ where: { email }, select: { id: true } });
      if (owner && owner.id !== id) {
        throw new ReferralAffiliateError(`An affiliate with this email already exists: ${email}`, 409);
      }
    }
    data.email = email;
  }

  // Changing the referral code is allowed (§7: "Admin may edit
  // referralCode"), but it never rewrites a historical commission —
  // OrderAffiliateCommission stores its own affiliateReferralCodeSnapshot,
  // entirely independent of this row's current value.
  if ("referralCode" in input) {
    const referralCode = requireReferralCode(input.referralCode);
    if (referralCode !== existing.referralCode) {
      const owner = await prisma.affiliate.findUnique({ where: { referralCode }, select: { id: true } });
      if (owner && owner.id !== id) {
        throw new ReferralAffiliateError(`Referral code already in use: ${referralCode}`, 409);
      }
    }
    data.referralCode = referralCode;
  }

  if ("customerId" in input) {
    if (input.customerId === null || input.customerId === "") {
      data.customer = { disconnect: true };
    } else if (typeof input.customerId === "string") {
      const customerId = input.customerId.trim();
      await assertCustomerExistsAndUnlinked(customerId, id);
      data.customer = { connect: { id: customerId } };
    } else {
      throw new ReferralAffiliateError("customerId must be a string or null.");
    }
  }

  if (Object.keys(data).length === 0) {
    throw new ReferralAffiliateError("No editable fields were provided.");
  }

  const updated = await prisma.affiliate.update({ where: { id }, data });
  return toOutput(updated);
}

// ---------------------------------------------------------------------------
// Status lifecycle (§18). No hard delete anywhere in this file — a
// rejected or suspended affiliate row is never removed, only its
// status changes, so any historical OrderAffiliateCommission stays
// fully intact and readable regardless of the affiliate's current
// status.
// ---------------------------------------------------------------------------

function assertTransition(current: AffiliateStatus, allowed: AffiliateStatus[], action: string): void {
  if (!allowed.includes(current)) {
    throw new ReferralAffiliateError(`Cannot ${action} an affiliate with status ${current}.`, 409);
  }
}

export async function approveAffiliate(id: string): Promise<AffiliateOutput> {
  const existing = await prisma.affiliate.findUnique({ where: { id }, select: { status: true } });
  if (!existing) throw new ReferralAffiliateError(`Affiliate not found: ${id}`, 404);
  assertTransition(existing.status, [AffiliateStatus.PENDING, AffiliateStatus.SUSPENDED], "approve");

  const updated = await prisma.affiliate.update({
    where: { id },
    data: { status: AffiliateStatus.ACTIVE, approvedAt: new Date() },
  });
  return toOutput(updated);
}

export async function rejectAffiliate(id: string): Promise<AffiliateOutput> {
  const existing = await prisma.affiliate.findUnique({ where: { id }, select: { status: true } });
  if (!existing) throw new ReferralAffiliateError(`Affiliate not found: ${id}`, 404);
  assertTransition(existing.status, [AffiliateStatus.PENDING], "reject");

  const updated = await prisma.affiliate.update({ where: { id }, data: { status: AffiliateStatus.REJECTED } });
  return toOutput(updated);
}

// SUSPENDED: not eligible for new referral attribution; historical
// commission remains visible and untouched (§18) — this function only
// ever changes `status`, nothing else on the row or on any related
// OrderAffiliateCommission.
export async function suspendAffiliate(id: string): Promise<AffiliateOutput> {
  const existing = await prisma.affiliate.findUnique({ where: { id }, select: { status: true } });
  if (!existing) throw new ReferralAffiliateError(`Affiliate not found: ${id}`, 404);
  assertTransition(existing.status, [AffiliateStatus.ACTIVE], "suspend");

  const updated = await prisma.affiliate.update({ where: { id }, data: { status: AffiliateStatus.SUSPENDED } });
  return toOutput(updated);
}

export async function reactivateAffiliate(id: string): Promise<AffiliateOutput> {
  const existing = await prisma.affiliate.findUnique({ where: { id }, select: { status: true } });
  if (!existing) throw new ReferralAffiliateError(`Affiliate not found: ${id}`, 404);
  assertTransition(existing.status, [AffiliateStatus.SUSPENDED], "reactivate");

  const updated = await prisma.affiliate.update({ where: { id }, data: { status: AffiliateStatus.ACTIVE } });
  return toOutput(updated);
}

// ---------------------------------------------------------------------------
// Self-referral detection (§20 of the brief). A pure, side-effect-free
// helper — nothing calls this from any live route yet. 172B.4 will use
// it at the moment a referred checkout is attributed, to apply the
// approved V1 rule: the affiliate keeps the customer discount on their
// own purchase, but zero commission is ever created for it.
// ---------------------------------------------------------------------------

export interface CheckoutIdentity {
  customerId?: string | null;
  email?: string | null;
}

// True when the checkout identity is genuinely the referring affiliate
// themselves — matched on their linked Customer id first (the
// strongest signal, sidesteps any email-casing mismatch entirely), and
// falling back to a normalised email match when no customerId is
// available (e.g. a guest checkout using the affiliate's own email).
export function isSelfReferral(affiliate: Pick<AffiliateOutput, "customerId" | "email">, checkoutIdentity: CheckoutIdentity): boolean {
  if (affiliate.customerId && checkoutIdentity.customerId && affiliate.customerId === checkoutIdentity.customerId) {
    return true;
  }
  if (checkoutIdentity.email) {
    return affiliate.email === checkoutIdentity.email.trim().toLowerCase();
  }
  return false;
}
