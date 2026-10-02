// Milestone 198: B2B outreach contact management — schools, ECD centres,
// churches, bookstores, NGOs and similar organisations the owner has
// legitimately collected contact details for. Completely separate from
// Customer/NewsletterSubscriber; nothing here is ever a real Seasonedz
// customer account.

import { OutreachContactStatus, OutreachLeadStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { getSastTodayBoundsUtc } from "../../utils/southAfricaTime.js";

export class OutreachContactError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "OutreachContactError";
    this.statusCode = statusCode;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Always the canonical form a contact's email is stored/looked-up under
// — the same "one canonical form, never two rows for two casings"
// discipline Coupon.code/NewsletterSubscriber.email already document
// elsewhere in this schema.
export function normalizeOutreachEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidOutreachEmail(raw: string): boolean {
  return EMAIL_PATTERN.test(raw.trim());
}

// Milestone 198, Part 3: suggested, non-exhaustive — the field itself is
// plain text (see schema.prisma's own comment on OutreachContact.
// organisationType), so this list is only ever used to populate the
// admin form's dropdown, never enforced as a closed set server-side.
// Milestone 199: expanded to the owner's real-world B2B segment list —
// existing contact rows keep whatever organisationType they already
// had (this is purely the suggested-options list, never a migration).
export const SUGGESTED_ORGANISATION_TYPES = [
  "Bookshop",
  "Stationery Store",
  "Educational Supplier",
  "Toy / Children's Store",
  "Gift Shop",
  "Christian Bookshop / Retailer",
  "School / Preschool / ECD",
  "Church / Ministry",
  "NGO / Community Organisation",
  "Corporate / Organisation",
  "Hotel / Resort",
  "Healthcare",
  "Adult Care / Support",
  "Other",
];

export const OUTREACH_LEAD_STATUSES: OutreachLeadStatus[] = [
  OutreachLeadStatus.PROSPECT,
  OutreachLeadStatus.CONTACTED,
  OutreachLeadStatus.INTERESTED,
  OutreachLeadStatus.CATALOGUE_SENT,
  OutreachLeadStatus.QUOTE_REQUESTED,
  OutreachLeadStatus.NEGOTIATING,
  OutreachLeadStatus.CUSTOMER,
  OutreachLeadStatus.REPEAT_CUSTOMER,
];

export interface OutreachContactInput {
  organisationName?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  organisationType?: unknown;
  province?: unknown;
  city?: unknown;
  website?: unknown;
  source?: unknown;
  sourceUrl?: unknown;
  notes?: unknown;
  tags?: unknown;
  // Milestone 199, CRM fields. leadStatus/contactRole/buyerEmail/
  // lastContactedAt/nextFollowUpAt are deliberately editable through
  // this exact same partial-update path as every other field — no
  // separate "CRM-only" endpoint, so there is only ever one place a
  // contact row can be written from. None of these five ever touch
  // `status` (email eligibility) — see parseOutreachContactInput below.
  leadStatus?: unknown;
  contactRole?: unknown;
  buyerEmail?: unknown;
  lastContactedAt?: unknown;
  nextFollowUpAt?: unknown;
}

interface ParsedOutreachContactInput {
  organisationName: string | null;
  contactName: string | null;
  email: string;
  phone: string | null;
  organisationType: string | null;
  province: string | null;
  city: string | null;
  website: string | null;
  source: string | null;
  sourceUrl: string | null;
  notes: string | null;
  tags: string[];
  leadStatus: OutreachLeadStatus;
  contactRole: string | null;
  buyerEmail: string | null;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
}

function optionalTrimmedString(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

function parseTags(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new OutreachContactError("Tags must be a list.");
  const tags = raw.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim());
  // De-duplicated, case-insensitively, so "Bulk Books"/"bulk books" can
  // never silently become two different filterable tags.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(tag);
  }
  return deduped;
}

function parseLeadStatus(raw: unknown): OutreachLeadStatus {
  if (typeof raw !== "string" || !OUTREACH_LEAD_STATUSES.includes(raw as OutreachLeadStatus)) {
    throw new OutreachContactError(`Lead status must be one of: ${OUTREACH_LEAD_STATUSES.join(", ")}.`);
  }
  return raw as OutreachLeadStatus;
}

// Part 6 of the Milestone 199 brief: optional, validated if supplied,
// and NEVER written into the primary `email` field above — buyerEmail
// only ever describes the procurement contact's own address, it is
// never what a campaign actually sends to.
function parseOptionalEmail(raw: unknown, fieldLabel: string): string | null {
  const trimmed = optionalTrimmedString(raw);
  if (trimmed === null) return null;
  if (!isValidOutreachEmail(trimmed)) {
    throw new OutreachContactError(`${fieldLabel} must be a valid email address.`);
  }
  return normalizeOutreachEmail(trimmed);
}

function parseOptionalDate(raw: unknown, fieldLabel: string): Date | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" && !(raw instanceof Date)) {
    throw new OutreachContactError(`${fieldLabel} is not a valid date.`);
  }
  const date = new Date(raw as string | Date);
  if (Number.isNaN(date.getTime())) {
    throw new OutreachContactError(`${fieldLabel} is not a valid date.`);
  }
  return date;
}

// Shared by createContact()/updateContact() — mirrors coupon.service.ts's
// own parseCouponInput() "effective merged value with existing row"
// discipline for a partial update.
export function parseOutreachContactInput(rawInput: OutreachContactInput, existing: ParsedOutreachContactInput | null): ParsedOutreachContactInput {
  const has = (key: keyof OutreachContactInput) => Object.prototype.hasOwnProperty.call(rawInput, key);

  // Optional (see schema.prisma's own comment on OutreachContact.
  // organisationName) — a manually-entered contact is still strongly
  // encouraged to have one via the frontend form's own required
  // attribute, but the backend itself only ever rejects a missing
  // email, never a missing organisation name, so a bulk-imported
  // "just an email address" contact is always valid.
  const organisationName = has("organisationName") ? optionalTrimmedString(rawInput.organisationName) : (existing?.organisationName ?? null);

  let email = existing?.email ?? "";
  if (has("email")) {
    if (typeof rawInput.email !== "string" || rawInput.email.trim().length === 0) {
      throw new OutreachContactError("Email address is required.");
    }
    const normalized = normalizeOutreachEmail(rawInput.email);
    if (!isValidOutreachEmail(normalized)) {
      throw new OutreachContactError("Enter a valid email address.");
    }
    email = normalized;
  } else if (!existing) {
    throw new OutreachContactError("Email address is required.");
  }

  return {
    organisationName,
    email,
    contactName: has("contactName") ? optionalTrimmedString(rawInput.contactName) : (existing?.contactName ?? null),
    phone: has("phone") ? optionalTrimmedString(rawInput.phone) : (existing?.phone ?? null),
    organisationType: has("organisationType") ? optionalTrimmedString(rawInput.organisationType) : (existing?.organisationType ?? null),
    province: has("province") ? optionalTrimmedString(rawInput.province) : (existing?.province ?? null),
    city: has("city") ? optionalTrimmedString(rawInput.city) : (existing?.city ?? null),
    website: has("website") ? optionalTrimmedString(rawInput.website) : (existing?.website ?? null),
    source: has("source") ? optionalTrimmedString(rawInput.source) : (existing?.source ?? null),
    sourceUrl: has("sourceUrl") ? optionalTrimmedString(rawInput.sourceUrl) : (existing?.sourceUrl ?? null),
    notes: has("notes") ? optionalTrimmedString(rawInput.notes) : (existing?.notes ?? null),
    tags: has("tags") ? parseTags(rawInput.tags) : (existing?.tags ?? []),
    leadStatus: has("leadStatus") ? parseLeadStatus(rawInput.leadStatus) : (existing?.leadStatus ?? OutreachLeadStatus.PROSPECT),
    contactRole: has("contactRole") ? optionalTrimmedString(rawInput.contactRole) : (existing?.contactRole ?? null),
    buyerEmail: has("buyerEmail") ? parseOptionalEmail(rawInput.buyerEmail, "Buyer email") : (existing?.buyerEmail ?? null),
    lastContactedAt: has("lastContactedAt") ? parseOptionalDate(rawInput.lastContactedAt, "Last contacted date") : (existing?.lastContactedAt ?? null),
    nextFollowUpAt: has("nextFollowUpAt") ? parseOptionalDate(rawInput.nextFollowUpAt, "Next follow-up date") : (existing?.nextFollowUpAt ?? null),
  };
}

export async function createContact(rawInput: OutreachContactInput) {
  const parsed = parseOutreachContactInput(rawInput, null);

  // Explicit, friendly duplicate check ahead of the DB's own unique
  // constraint (Part 5: "duplicate detection") — the constraint alone
  // would still be safe, but a P2002 error is a worse message than a
  // clear "this contact already exists" the admin can act on.
  const existing = await prisma.outreachContact.findUnique({ where: { email: parsed.email } });
  if (existing) {
    throw new OutreachContactError(`A contact with this email already exists: ${existing.organisationName}.`, 409);
  }

  return prisma.outreachContact.create({ data: parsed });
}

function toParsedFromRow(row: {
  organisationName: string | null;
  contactName: string | null;
  email: string;
  phone: string | null;
  organisationType: string | null;
  province: string | null;
  city: string | null;
  website: string | null;
  source: string | null;
  sourceUrl: string | null;
  notes: string | null;
  tags: string[];
  leadStatus: OutreachLeadStatus;
  contactRole: string | null;
  buyerEmail: string | null;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
}): ParsedOutreachContactInput {
  return { ...row };
}

export async function updateContact(id: string, rawInput: OutreachContactInput) {
  const existingRow = await prisma.outreachContact.findUnique({ where: { id } });
  if (!existingRow) throw new OutreachContactError(`Contact not found: ${id}`, 404);

  const parsed = parseOutreachContactInput(rawInput, toParsedFromRow(existingRow));

  if (parsed.email !== existingRow.email) {
    const emailTaken = await prisma.outreachContact.findUnique({ where: { email: parsed.email } });
    if (emailTaken) throw new OutreachContactError(`Another contact already uses this email: ${emailTaken.organisationName}.`, 409);
  }

  return prisma.outreachContact.update({ where: { id }, data: parsed });
}

export async function getContact(id: string) {
  const contact = await prisma.outreachContact.findUnique({ where: { id } });
  if (!contact) return null;
  return { ...contact, followUpState: getFollowUpState(contact.nextFollowUpAt) };
}

// Milestone 199: the four follow-up buckets the Admin Contacts page
// filters/summarises by — judged against the SAST calendar day (see
// getSastTodayBoundsUtc()), never the server's own local time.
export type OutreachFollowUpState = "NONE" | "OVERDUE" | "DUE_TODAY" | "UPCOMING";
export const OUTREACH_FOLLOW_UP_STATES: OutreachFollowUpState[] = ["NONE", "OVERDUE", "DUE_TODAY", "UPCOMING"];

export function getFollowUpState(nextFollowUpAt: Date | null, now: Date = new Date()): OutreachFollowUpState {
  if (!nextFollowUpAt) return "NONE";
  const { startOfTodayUtc, startOfTomorrowUtc } = getSastTodayBoundsUtc(now);
  if (nextFollowUpAt < startOfTodayUtc) return "OVERDUE";
  if (nextFollowUpAt < startOfTomorrowUtc) return "DUE_TODAY";
  return "UPCOMING";
}

function followUpStateWhere(state: OutreachFollowUpState, now: Date = new Date()): Prisma.OutreachContactWhereInput {
  const { startOfTodayUtc, startOfTomorrowUtc } = getSastTodayBoundsUtc(now);
  switch (state) {
    case "NONE":
      return { nextFollowUpAt: null };
    case "OVERDUE":
      return { nextFollowUpAt: { lt: startOfTodayUtc } };
    case "DUE_TODAY":
      return { nextFollowUpAt: { gte: startOfTodayUtc, lt: startOfTomorrowUtc } };
    case "UPCOMING":
      return { nextFollowUpAt: { gte: startOfTomorrowUtc } };
  }
}

export interface OutreachContactListFilters {
  search?: string;
  organisationType?: string;
  province?: string;
  city?: string;
  source?: string;
  tag?: string;
  status?: OutreachContactStatus;
  leadStatus?: OutreachLeadStatus;
  followUpState?: OutreachFollowUpState;
  page?: number;
  limit?: number;
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

export function buildOutreachContactWhere(filters: Omit<OutreachContactListFilters, "page" | "limit">): Prisma.OutreachContactWhereInput {
  const where: Prisma.OutreachContactWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.organisationType) where.organisationType = filters.organisationType;
  if (filters.province) where.province = filters.province;
  if (filters.city) where.city = filters.city;
  if (filters.source) where.source = filters.source;
  if (filters.tag) where.tags = { has: filters.tag };
  if (filters.leadStatus) where.leadStatus = filters.leadStatus;
  if (filters.search) {
    const search = filters.search.trim();
    if (search) {
      where.OR = [
        { organisationName: { contains: search, mode: "insensitive" } },
        { contactName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
  }
  if (filters.followUpState) {
    Object.assign(where, followUpStateWhere(filters.followUpState));
  }
  return where;
}

export async function listContacts(filters: OutreachContactListFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(filters.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const where = buildOutreachContactWhere(filters);
  const now = new Date();

  const [contacts, total] = await Promise.all([
    prisma.outreachContact.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.outreachContact.count({ where }),
  ]);

  // Milestone 199: `followUpState` is computed here, server-side,
  // against the real SAST calendar day, and attached to each row —
  // never duplicated as a second timezone calculation in the frontend.
  const contactsWithFollowUpState = contacts.map((contact) => ({ ...contact, followUpState: getFollowUpState(contact.nextFollowUpAt, now) }));

  return { contacts: contactsWithFollowUpState, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

// Every distinct, non-null value currently in use for a given column —
// powers the admin filter dropdowns with real data instead of a
// hardcoded list that could drift from what's actually been entered.
export async function listDistinctContactValues() {
  const [organisationTypes, provinces, cities, sources] = await Promise.all([
    prisma.outreachContact.findMany({ where: { organisationType: { not: null } }, select: { organisationType: true }, distinct: ["organisationType"] }),
    prisma.outreachContact.findMany({ where: { province: { not: null } }, select: { province: true }, distinct: ["province"] }),
    prisma.outreachContact.findMany({ where: { city: { not: null } }, select: { city: true }, distinct: ["city"] }),
    prisma.outreachContact.findMany({ where: { source: { not: null } }, select: { source: true }, distinct: ["source"] }),
  ]);
  const allTagRows = await prisma.outreachContact.findMany({ select: { tags: true } });
  const tagSet = new Set<string>();
  allTagRows.forEach((row) => row.tags.forEach((tag) => tagSet.add(tag)));

  return {
    organisationTypes: organisationTypes.map((row) => row.organisationType).filter((v): v is string => Boolean(v)),
    provinces: provinces.map((row) => row.province).filter((v): v is string => Boolean(v)),
    cities: cities.map((row) => row.city).filter((v): v is string => Boolean(v)),
    sources: sources.map((row) => row.source).filter((v): v is string => Boolean(v)),
    tags: Array.from(tagSet).sort(),
  };
}

// Milestone 198, Part 12: the one function that ever moves a contact
// away from ACTIVE for a suppression-shaped reason (unsubscribe, bounce,
// manual suppress, invalid) — suppressedAt is set only the first time,
// never overwritten by a later status change, so "when did this contact
// first stop being contactable" always stays answerable.
export async function setContactStatus(id: string, status: OutreachContactStatus, reason?: string) {
  const existing = await prisma.outreachContact.findUnique({ where: { id }, select: { id: true, suppressedAt: true } });
  if (!existing) throw new OutreachContactError(`Contact not found: ${id}`, 404);

  return prisma.outreachContact.update({
    where: { id },
    data: {
      status,
      suppressedReason: reason ?? null,
      ...(status !== OutreachContactStatus.ACTIVE && !existing.suppressedAt ? { suppressedAt: new Date() } : {}),
    },
  });
}

// Milestone 198, Part 12: the ONLY code path that ever unsubscribes a
// contact via their own action (the emailed unsubscribe link) — never
// resets an already-more-severe status (e.g. a contact an admin marked
// SUPPRESSED for a real complaint stays SUPPRESSED even if they somehow
// still click an old unsubscribe link) back to something less final.
export async function unsubscribeContactByToken(contactId: string) {
  const existing = await prisma.outreachContact.findUnique({ where: { id: contactId } });
  if (!existing) return null;
  if (existing.status !== OutreachContactStatus.ACTIVE) return existing; // already suppressed some other way — leave it exactly as is

  return prisma.outreachContact.update({
    where: { id: contactId },
    data: { status: OutreachContactStatus.UNSUBSCRIBED, suppressedAt: existing.suppressedAt ?? new Date(), suppressedReason: "Unsubscribed via email link" },
  });
}

// Milestone 199, Part H: factual counts only — every number here is a
// real `groupBy`/`count` query against the current table, never an
// invented conversion rate. If a conversion percentage is ever wanted
// later, it must be computed from these same real counts with an
// explicit, stated definition — not added here speculatively.
export interface OutreachCrmSummary {
  byLeadStatus: Record<OutreachLeadStatus, number>;
  dueToday: number;
  overdue: number;
}

export async function getCrmSummary(now: Date = new Date()): Promise<OutreachCrmSummary> {
  const [leadStatusCounts, dueToday, overdue] = await Promise.all([
    prisma.outreachContact.groupBy({ by: ["leadStatus"], _count: true }),
    prisma.outreachContact.count({ where: followUpStateWhere("DUE_TODAY", now) }),
    prisma.outreachContact.count({ where: followUpStateWhere("OVERDUE", now) }),
  ]);

  const byLeadStatus = OUTREACH_LEAD_STATUSES.reduce(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<OutreachLeadStatus, number>
  );
  for (const row of leadStatusCounts) {
    byLeadStatus[row.leadStatus] = row._count;
  }

  return { byLeadStatus, dueToday, overdue };
}

export interface OutreachContactCampaignHistoryEntry {
  campaignId: string;
  campaignName: string;
  campaignSubject: string;
  status: string;
  sentAt: Date | null;
  failureReason: string | null;
}

// Milestone 199, Part E of the investigation: contact history is read
// straight from the existing OutreachCampaignRecipient relation —
// never a second, duplicated history table. "SENT" is reported exactly
// as that word; it is never relabelled "Delivered" (the brief's own
// Part 3 instruction) since this system has no delivery-confirmation
// signal, only "accepted by our sending system."
export async function getContactCampaignHistory(contactId: string): Promise<OutreachContactCampaignHistoryEntry[]> {
  const recipients = await prisma.outreachCampaignRecipient.findMany({
    where: { contactId },
    include: { campaign: { select: { id: true, name: true, subject: true } } },
    orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
  });

  return recipients.map((r) => ({
    campaignId: r.campaign.id,
    campaignName: r.campaign.name,
    campaignSubject: r.campaign.subject,
    status: r.status,
    sentAt: r.sentAt,
    failureReason: r.failureReason,
  }));
}

export async function deleteContact(id: string) {
  const recipientCount = await prisma.outreachCampaignRecipient.count({ where: { contactId: id } });
  if (recipientCount > 0) {
    throw new OutreachContactError("This contact has campaign history and cannot be deleted. Suppress it instead.", 409);
  }
  const existing = await prisma.outreachContact.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new OutreachContactError(`Contact not found: ${id}`, 404);
  await prisma.outreachContact.delete({ where: { id } });
}
