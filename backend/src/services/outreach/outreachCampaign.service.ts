// Milestone 198: B2B outreach campaign lifecycle — draft a campaign,
// snapshot its recipient list from a real audience filter, send it in
// small, resumable, admin-triggered batches (no queue/background worker
// exists in this codebase — see this milestone's own infrastructure
// audit), and track every recipient's own send status.

import { OutreachCampaignStatus, OutreachContactStatus, OutreachLeadStatus, OutreachRecipientStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { sendOutreachCampaignEmail, sendOutreachTestEmail } from "./outreachSending.service.js";

export class OutreachCampaignError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "OutreachCampaignError";
    this.statusCode = statusCode;
  }
}

export interface OutreachCampaignInput {
  name?: unknown;
  subject?: unknown;
  body?: unknown;
}

interface ParsedOutreachCampaignInput {
  name: string;
  subject: string;
  body: string;
}

function parseOutreachCampaignInput(rawInput: OutreachCampaignInput, existing: ParsedOutreachCampaignInput | null): ParsedOutreachCampaignInput {
  const has = (key: keyof OutreachCampaignInput) => Object.prototype.hasOwnProperty.call(rawInput, key);

  let name = existing?.name ?? "";
  if (has("name")) {
    if (typeof rawInput.name !== "string" || rawInput.name.trim().length === 0) throw new OutreachCampaignError("Campaign name is required.");
    name = rawInput.name.trim();
  } else if (!existing) {
    throw new OutreachCampaignError("Campaign name is required.");
  }

  let subject = existing?.subject ?? "";
  if (has("subject")) {
    if (typeof rawInput.subject !== "string" || rawInput.subject.trim().length === 0) throw new OutreachCampaignError("Email subject is required.");
    subject = rawInput.subject.trim();
  } else if (!existing) {
    throw new OutreachCampaignError("Email subject is required.");
  }

  let body = existing?.body ?? "";
  if (has("body")) {
    if (typeof rawInput.body !== "string" || rawInput.body.trim().length === 0) throw new OutreachCampaignError("Email body is required.");
    body = rawInput.body;
  } else if (!existing) {
    throw new OutreachCampaignError("Email body is required.");
  }

  return { name, subject, body };
}

export async function createCampaign(rawInput: OutreachCampaignInput, createdByAdminId: string | null) {
  const parsed = parseOutreachCampaignInput(rawInput, null);
  return prisma.outreachCampaign.create({ data: { ...parsed, createdByAdminId } });
}

// Editing is only ever safe while nothing has been sent yet — a
// READY campaign (recipients already snapshotted) can still have its
// subject/body edited, but never once sendStartedAt is set (Part 8:
// "Do not send while the campaign is merely being edited" — the
// inverse also matters: never let subject/body silently change out
// from under a send that's already partway through).
export async function updateCampaign(id: string, rawInput: OutreachCampaignInput) {
  const existingRow = await prisma.outreachCampaign.findUnique({ where: { id } });
  if (!existingRow) throw new OutreachCampaignError(`Campaign not found: ${id}`, 404);
  if (existingRow.sendStartedAt) {
    throw new OutreachCampaignError("This campaign has already started sending and can no longer be edited.", 409);
  }

  const parsed = parseOutreachCampaignInput(rawInput, existingRow);
  return prisma.outreachCampaign.update({ where: { id }, data: parsed });
}

export async function getCampaign(id: string) {
  return prisma.outreachCampaign.findUnique({ where: { id } });
}

// Milestone 198.1, Part 10: the list view needs each campaign's own
// recipient counts (sent/pending/failed) to be genuinely useful for
// picking a bulk selection — one groupBy across every listed campaign's
// id at once, never a separate query per row.
export async function listCampaigns(filters: { status?: OutreachCampaignStatus; page?: number; limit?: number } = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(filters.limit ?? 20, 100);
  const where: Prisma.OutreachCampaignWhereInput = filters.status ? { status: filters.status } : {};

  const [campaigns, total] = await Promise.all([
    prisma.outreachCampaign.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.outreachCampaign.count({ where }),
  ]);

  const campaignIds = campaigns.map((c) => c.id);
  const grouped = campaignIds.length
    ? await prisma.outreachCampaignRecipient.groupBy({ by: ["campaignId", "status"], where: { campaignId: { in: campaignIds } }, _count: { _all: true } })
    : [];
  const countsByCampaign = new Map<string, OutreachRecipientCounts>();
  for (const id of campaignIds) countsByCampaign.set(id, { total: 0, pending: 0, sent: 0, failed: 0, suppressed: 0, invalid: 0 });
  for (const row of grouped) {
    const counts = countsByCampaign.get(row.campaignId);
    if (!counts) continue;
    const count = row._count._all;
    counts.total += count;
    if (row.status === OutreachRecipientStatus.PENDING) counts.pending = count;
    if (row.status === OutreachRecipientStatus.SENT) counts.sent = count;
    if (row.status === OutreachRecipientStatus.FAILED) counts.failed = count;
    if (row.status === OutreachRecipientStatus.SUPPRESSED) counts.suppressed = count;
    if (row.status === OutreachRecipientStatus.INVALID) counts.invalid = count;
  }

  const campaignsWithCounts = campaigns.map((campaign) => ({ ...campaign, recipientCounts: countsByCampaign.get(campaign.id)! }));
  return { campaigns: campaignsWithCounts, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export interface OutreachAudienceFilter {
  contactIds?: string[];
  organisationTypes?: string[];
  provinces?: string[];
  cities?: string[];
  sources?: string[];
  tags?: string[];
  // Milestone 199, Part 7: a CRM/sales-pipeline filter, deliberately
  // additive to (never a replacement for) the ACTIVE-only base clause
  // below — a leadStatus can narrow the audience further but can never
  // widen it back to include an UNSUBSCRIBED/BOUNCED/INVALID/SUPPRESSED
  // contact. See buildAudienceWhere()'s own comment.
  leadStatuses?: string[];
}

// Always ACTIVE-only, non-negotiably — Part 12's own "before EVERY send,
// server-side logic must check suppression status" starts here: a
// suppressed/unsubscribed/bounced/invalid contact can never even enter a
// campaign's recipient snapshot in the first place, regardless of which
// filter or explicit selection the admin used to build it. Milestone
// 199: leadStatuses is applied as an ADDITIONAL AND-ed clause on top of
// this same base — it narrows which ACTIVE contacts qualify, it can
// never itself grant eligibility to a non-ACTIVE contact.
export function buildAudienceWhere(filter: OutreachAudienceFilter): Prisma.OutreachContactWhereInput {
  const where: Prisma.OutreachContactWhereInput = { status: OutreachContactStatus.ACTIVE };

  if (filter.contactIds && filter.contactIds.length > 0) {
    where.id = { in: filter.contactIds };
    return where; // an explicit selection is exclusive of the filter criteria below
  }

  if (filter.organisationTypes?.length) where.organisationType = { in: filter.organisationTypes };
  if (filter.provinces?.length) where.province = { in: filter.provinces };
  if (filter.cities?.length) where.city = { in: filter.cities };
  if (filter.sources?.length) where.source = { in: filter.sources };
  if (filter.tags?.length) where.tags = { hasSome: filter.tags };
  if (filter.leadStatuses?.length) where.leadStatus = { in: filter.leadStatuses as OutreachLeadStatus[] };
  return where;
}

export async function previewAudience(filter: OutreachAudienceFilter): Promise<number> {
  return prisma.outreachContact.count({ where: buildAudienceWhere(filter) });
}

// Part 8/15: snapshots the CURRENT matching ACTIVE contacts into
// OutreachCampaignRecipient rows (skipDuplicates — the table's own
// @@unique([campaignId, contactId]) is the real duplicate-protection
// mechanism, Part 13 of the brief) and moves the campaign to READY.
// Recipients are never re-derived from the filter again after this —
// see OutreachCampaign.audienceFilter's own schema comment.
export async function buildCampaignRecipients(campaignId: string, filter: OutreachAudienceFilter) {
  const campaign = await prisma.outreachCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new OutreachCampaignError(`Campaign not found: ${campaignId}`, 404);
  if (campaign.sendStartedAt) {
    throw new OutreachCampaignError("This campaign has already started sending — its recipient list can no longer be rebuilt.", 409);
  }

  const contacts = await prisma.outreachContact.findMany({ where: buildAudienceWhere(filter), select: { id: true, organisationName: true, email: true } });
  if (contacts.length === 0) {
    throw new OutreachCampaignError("No active contacts match this audience selection.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.outreachCampaignRecipient.createMany({
      data: contacts.map((contact) => ({ campaignId, contactId: contact.id, organisationNameSnapshot: contact.organisationName, emailSnapshot: contact.email })),
      skipDuplicates: true,
    });
    await tx.outreachCampaign.update({
      where: { id: campaignId },
      data: { status: OutreachCampaignStatus.READY, audienceFilter: filter as Prisma.InputJsonValue, recipientsBuiltAt: new Date() },
    });
  });

  return getCampaignRecipientCounts(campaignId);
}

export interface OutreachRecipientCounts {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  suppressed: number;
  invalid: number;
}

export async function getCampaignRecipientCounts(campaignId: string): Promise<OutreachRecipientCounts> {
  const grouped = await prisma.outreachCampaignRecipient.groupBy({ by: ["status"], where: { campaignId }, _count: { _all: true } });
  const counts: OutreachRecipientCounts = { total: 0, pending: 0, sent: 0, failed: 0, suppressed: 0, invalid: 0 };
  grouped.forEach((row) => {
    const count = row._count._all;
    counts.total += count;
    if (row.status === OutreachRecipientStatus.PENDING) counts.pending = count;
    if (row.status === OutreachRecipientStatus.SENT) counts.sent = count;
    if (row.status === OutreachRecipientStatus.FAILED) counts.failed = count;
    if (row.status === OutreachRecipientStatus.SUPPRESSED) counts.suppressed = count;
    if (row.status === OutreachRecipientStatus.INVALID) counts.invalid = count;
  });
  return counts;
}

export async function listCampaignRecipients(campaignId: string, filters: { status?: OutreachRecipientStatus; page?: number; limit?: number } = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(filters.limit ?? 50, 200);
  const where: Prisma.OutreachCampaignRecipientWhereInput = { campaignId, ...(filters.status ? { status: filters.status } : {}) };

  const [recipients, total] = await Promise.all([
    prisma.outreachCampaignRecipient.findMany({ where, orderBy: { createdAt: "asc" }, skip: (page - 1) * limit, take: limit }),
    prisma.outreachCampaignRecipient.count({ where }),
  ]);
  return { recipients, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

// Part 14: never touches OutreachCampaignRecipient at all — a test send
// is not, and must never become, a real recipient.
export async function sendTestEmail(campaignId: string, testEmailAddress: string) {
  const campaign = await prisma.outreachCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new OutreachCampaignError(`Campaign not found: ${campaignId}`, 404);

  const result = await sendOutreachTestEmail({ testEmailAddress, subject: campaign.subject, bodyTemplate: campaign.body });
  if (!result.success) throw new OutreachCampaignError(result.errorMessage || "Test send failed.", 502);
  return result;
}

// Milestone 198, Part 16: no queue/background worker exists in this
// codebase (see this milestone's own infrastructure audit) — a real
// send is deliberately processed in small, bounded, admin-triggered
// batches instead of one giant request or a fake "fire and forget"
// promise. This in-memory set is this single Render web process's own
// re-entrancy guard, the same "single instance, no shared store needed
// yet" assumption rateLimit.middleware.ts's own comment already
// documents elsewhere in this codebase — a second concurrent click on
// "Continue Sending" for the SAME campaign is rejected rather than
// racing the first request over the same PENDING rows.
const campaignsCurrentlySending = new Set<string>();

const DEFAULT_BATCH_SIZE = 20;
const DELAY_BETWEEN_SENDS_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SendBatchResult {
  processed: number;
  sent: number;
  failed: number;
  suppressed: number;
  skippedCrossCampaignDuplicate: number;
  sentContactIds: string[];
  campaignStatus: OutreachCampaignStatus;
  recipientCounts: OutreachRecipientCounts;
}

// Processes up to `batchSize` PENDING recipients, sequentially, with a
// small delay between each real Brevo call — a deliberately conservative
// default given this milestone's own "do not guess limits" instruction:
// safe at any real Brevo plan tier, tunable later once the owner
// confirms their actual plan's rate/volume limits (see this milestone's
// own report). Part 12: re-checks each contact's CURRENT status right
// before sending — a contact snapshotted as ACTIVE when the recipient
// list was built, but unsubscribed/suppressed since, is marked
// SUPPRESSED here and skipped, never sent to.
//
// Milestone 198.1: `excludeContactIds` is purely additive — every
// existing single-campaign caller (the campaign detail page's own
// "Continue Sending" button) omits it and behaves exactly as before.
// It exists only for bulkStartCampaigns() below: when starting several
// campaigns together, a contact already sent to by an EARLIER campaign
// in that same bulk run is left PENDING here (never marked anything),
// so the admin can see and consciously decide on it afterward, instead
// of a second automatic send to the same person within one bulk action.
export async function sendCampaignBatch(campaignId: string, batchSize: number = DEFAULT_BATCH_SIZE, excludeContactIds: Set<string> = new Set()): Promise<SendBatchResult> {
  // The check-then-add must happen with no `await` in between — two
  // concurrent calls could otherwise both pass the `has()` check before
  // either reaches `add()` (exactly the race an earlier version of this
  // function had, caught by this milestone's own test suite: the guard
  // was previously placed before an awaited findUnique() call, which is
  // enough of a gap for both calls to interleave straight past it).
  if (campaignsCurrentlySending.has(campaignId)) {
    throw new OutreachCampaignError("This campaign is already being sent — please wait for the current batch to finish.", 409);
  }
  campaignsCurrentlySending.add(campaignId);

  try {
    const campaign = await prisma.outreachCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new OutreachCampaignError(`Campaign not found: ${campaignId}`, 404);
    if (campaign.status === OutreachCampaignStatus.CANCELLED) throw new OutreachCampaignError("This campaign was cancelled and cannot be sent.", 409);
    if (campaign.status === OutreachCampaignStatus.DRAFT) throw new OutreachCampaignError("Build the recipient list before sending.", 409);
    if (campaign.status === OutreachCampaignStatus.COMPLETED) throw new OutreachCampaignError("This campaign has already been fully sent.", 409);

    if (!campaign.sendStartedAt) {
      await prisma.outreachCampaign.update({ where: { id: campaignId }, data: { status: OutreachCampaignStatus.SENDING, sendStartedAt: new Date() } });
    }

    const batch = await prisma.outreachCampaignRecipient.findMany({
      where: { campaignId, status: OutreachRecipientStatus.PENDING },
      orderBy: { createdAt: "asc" },
      take: Math.min(batchSize, 100),
    });

    let sent = 0;
    let failed = 0;
    let suppressed = 0;
    let skippedCrossCampaignDuplicate = 0;
    const sentContactIds: string[] = [];

    for (const recipient of batch) {
      if (excludeContactIds.has(recipient.contactId)) {
        // Left exactly as PENDING — not sent, not suppressed, not
        // failed. A real, deliberate state an admin can act on
        // afterward, never a silent double-send within this bulk run.
        skippedCrossCampaignDuplicate++;
        continue;
      }

      const contact = await prisma.outreachContact.findUnique({ where: { id: recipient.contactId } });

      if (!contact || contact.status !== OutreachContactStatus.ACTIVE) {
        await prisma.outreachCampaignRecipient.update({
          where: { id: recipient.id },
          data: { status: OutreachRecipientStatus.SUPPRESSED, failureReason: contact ? `Contact status is ${contact.status}, not ACTIVE.` : "Contact no longer exists." },
        });
        suppressed++;
        continue;
      }

      const result = await sendOutreachCampaignEmail({
        contactId: contact.id,
        contactEmail: contact.email,
        contactName: contact.contactName,
        organisationName: contact.organisationName,
        subject: campaign.subject,
        bodyTemplate: campaign.body,
        reference: recipient.id,
      });

      if (result.success) {
        await prisma.outreachCampaignRecipient.update({ where: { id: recipient.id }, data: { status: OutreachRecipientStatus.SENT, sentAt: new Date(), failureReason: null } });
        sent++;
        sentContactIds.push(contact.id);
      } else {
        await prisma.outreachCampaignRecipient.update({ where: { id: recipient.id }, data: { status: OutreachRecipientStatus.FAILED, failureReason: result.errorMessage ?? "Unknown error" } });
        failed++;
      }

      await delay(DELAY_BETWEEN_SENDS_MS);
    }

    const recipientCounts = await getCampaignRecipientCounts(campaignId);
    let campaignStatus: OutreachCampaignStatus = campaign.status;
    if (recipientCounts.pending === 0) {
      campaignStatus = recipientCounts.failed > 0 ? OutreachCampaignStatus.PARTIALLY_FAILED : OutreachCampaignStatus.COMPLETED;
      await prisma.outreachCampaign.update({ where: { id: campaignId }, data: { status: campaignStatus, sendCompletedAt: new Date() } });
    } else if (campaignStatus !== OutreachCampaignStatus.SENDING) {
      campaignStatus = OutreachCampaignStatus.SENDING;
    }

    return { processed: batch.length, sent, failed, suppressed, skippedCrossCampaignDuplicate, sentContactIds, campaignStatus, recipientCounts };
  } finally {
    campaignsCurrentlySending.delete(campaignId);
  }
}

// ---------------------------------------------------------------------------
// Milestone 198.1: multi-select bulk sending — a convenience layer over
// the exact same per-campaign sendCampaignBatch() above, never a
// replacement for it. Selecting several campaigns never combines them:
// each keeps its own subject/body/recipient rows untouched; this only
// automates clicking "Continue Sending" on each one in turn, with the
// same bounded-batch, resumable, never-trust-the-browser discipline.
// ---------------------------------------------------------------------------

// Milestone 198.1, final eligibility correction: READY only. A SENDING
// campaign (already partway through, or genuinely being processed right
// now) is deliberately excluded from bulk selection entirely — its own
// dedicated "Continue Sending" action on the campaign detail page
// remains the one way to resume it. This is never enforced only here:
// both previewBulkSend() and bulkStartCampaigns() below re-check this
// same rule against a FRESH read of the campaign's current status, so
// a campaign that was READY at selection time but has since moved to
// SENDING (e.g. a single-campaign send started elsewhere in the
// meantime) is excluded at execution regardless of what the browser's
// own preview showed.
function isEligibleForBulkSend(status: OutreachCampaignStatus, pending: number): boolean {
  return status === OutreachCampaignStatus.READY && pending > 0;
}

export interface BulkSendCampaignPreview {
  id: string;
  name: string;
  subject: string;
  status: OutreachCampaignStatus;
  eligible: boolean;
  ineligibleReason: string | null;
  recipientCounts: OutreachRecipientCounts;
}

export interface CrossCampaignDuplicate {
  contactId: string;
  email: string;
  organisationName: string | null;
  campaignIds: string[];
  campaignNames: string[];
}

export interface BulkSendPreview {
  campaigns: BulkSendCampaignPreview[];
  totalCampaigns: number;
  eligibleCampaigns: number;
  totalPendingRecipients: number;
  uniqueEligibleRecipients: number;
  crossCampaignDuplicates: CrossCampaignDuplicate[];
}

// Never trusts the browser's own idea of which campaigns are still
// eligible or how many recipients they have — always re-derived fresh
// from the database, the same "never trust the client for money/state"
// discipline this codebase already applies to checkout/coupons. Part
// 13's own "server-side revalidation" requirement is satisfied by this
// being the SAME function both the preview screen and (indirectly,
// via bulkStartCampaigns() below re-deriving its own fresh state)
// the real execution path are built on.
export async function previewBulkSend(campaignIds: string[]): Promise<BulkSendPreview> {
  const uniqueIds = Array.from(new Set(campaignIds));
  const campaigns = await prisma.outreachCampaign.findMany({ where: { id: { in: uniqueIds } } });

  const campaignPreviews: BulkSendCampaignPreview[] = [];
  const eligibleCampaignIds: string[] = [];

  for (const id of uniqueIds) {
    const campaign = campaigns.find((c) => c.id === id);
    if (!campaign) {
      // CANCELLED is a placeholder here, not a real status — this
      // branch only fires for a stale/deleted campaign id (e.g. it was
      // removed between page load and clicking Preview); `eligible:
      // false` is the field that actually matters, and it's correctly
      // set.
      campaignPreviews.push({ id, name: "(not found)", subject: "", status: OutreachCampaignStatus.CANCELLED, eligible: false, ineligibleReason: "Campaign not found.", recipientCounts: { total: 0, pending: 0, sent: 0, failed: 0, suppressed: 0, invalid: 0 } });
      continue;
    }
    const recipientCounts = await getCampaignRecipientCounts(id);
    const eligible = isEligibleForBulkSend(campaign.status, recipientCounts.pending);
    let ineligibleReason: string | null = null;
    if (!eligible) {
      if (campaign.status === OutreachCampaignStatus.DRAFT) ineligibleReason = "Recipient list not built yet.";
      else if (campaign.status === OutreachCampaignStatus.COMPLETED) ineligibleReason = "Already fully sent.";
      else if (campaign.status === OutreachCampaignStatus.CANCELLED) ineligibleReason = "Cancelled.";
      else if (campaign.status === OutreachCampaignStatus.SENDING) ineligibleReason = "Already sending — use Continue Sending on the campaign's own page.";
      else if (recipientCounts.pending === 0) ineligibleReason = "No pending recipients left.";
      else ineligibleReason = "Not eligible.";
    }
    if (eligible) eligibleCampaignIds.push(id);
    campaignPreviews.push({ id: campaign.id, name: campaign.name, subject: campaign.subject, status: campaign.status, eligible, ineligibleReason, recipientCounts });
  }

  const pendingRecipients = eligibleCampaignIds.length
    ? await prisma.outreachCampaignRecipient.findMany({
        where: { campaignId: { in: eligibleCampaignIds }, status: OutreachRecipientStatus.PENDING },
        select: { contactId: true, campaignId: true, emailSnapshot: true, organisationNameSnapshot: true },
      })
    : [];

  const byContact = new Map<string, { campaignIds: Set<string>; email: string; organisationName: string | null }>();
  for (const row of pendingRecipients) {
    const entry = byContact.get(row.contactId) ?? { campaignIds: new Set<string>(), email: row.emailSnapshot, organisationName: row.organisationNameSnapshot };
    entry.campaignIds.add(row.campaignId);
    byContact.set(row.contactId, entry);
  }

  const campaignNameById = new Map(campaigns.map((c) => [c.id, c.name]));
  const crossCampaignDuplicates: CrossCampaignDuplicate[] = [];
  for (const [contactId, entry] of byContact) {
    if (entry.campaignIds.size > 1) {
      const ids = Array.from(entry.campaignIds);
      crossCampaignDuplicates.push({ contactId, email: entry.email, organisationName: entry.organisationName, campaignIds: ids, campaignNames: ids.map((id) => campaignNameById.get(id) ?? id) });
    }
  }

  return {
    campaigns: campaignPreviews,
    totalCampaigns: uniqueIds.length,
    eligibleCampaigns: eligibleCampaignIds.length,
    totalPendingRecipients: pendingRecipients.length,
    uniqueEligibleRecipients: byContact.size,
    crossCampaignDuplicates,
  };
}

export interface BulkSendCampaignResult extends SendBatchResult {
  campaignId: string;
  campaignName: string;
}

export interface BulkSendResult {
  campaignsProcessed: BulkSendCampaignResult[];
  campaignsSkippedIneligible: { id: string; name: string; reason: string }[];
  // Part 9: a campaign whose own sendCampaignBatch() call threw (e.g.
  // its re-entrancy guard rejected a genuinely concurrent single-
  // campaign send happening at the same moment) lands here, never
  // aborts the loop — every other selected campaign is still attempted.
  campaignsErrored: { id: string; name: string; error: string }[];
  totalSent: number;
  totalFailed: number;
  totalSuppressed: number;
  totalSkippedCrossCampaignDuplicate: number;
  stoppedEarly: boolean;
}

const DEFAULT_MAX_RECIPIENTS_PER_BULK_CALL = 50;

// Milestone 198.1, Part 7: sequential, never parallel — one campaign's
// batch fully completes (through the exact same sendCampaignBatch()
// every single-campaign send already uses) before the next campaign's
// batch even starts, so this is never "50 simultaneous Brevo requests,"
// just the existing one-at-a-time sender called several times in a row
// with no admin click needed between campaigns.
//
// Bounded by `maxRecipientsPerCall`, the bulk-level equivalent of a
// single campaign's own batchSize: once that many recipients have been
// processed across ALL selected campaigns combined, this stops and
// returns — a campaign not yet reached is simply absent from
// `campaignsProcessed`, still READY, and picked up by calling this
// again with the same campaignIds. Milestone 198.1's final eligibility
// correction: isEligibleForBulkSend() only accepts READY, never
// SENDING — so if this call's own cap is hit PARTWAY through a
// campaign (leaving it SENDING with some recipients still PENDING),
// that one campaign is deliberately NOT picked up by a later bulk-
// start call either; finishing it is the campaign detail page's own
// "Continue Sending" button's job from then on, exactly the "bulk
// selection is never a second way to resume a SENDING campaign"
// boundary the owner asked for.
//
// Part 5/9: `sentInThisRun` accumulates every contact id actually sent
// to as this loop proceeds through the selected campaigns in order —
// passed to each subsequent sendCampaignBatch() call as
// `excludeContactIds`, so a contact appearing (however unexpectedly)
// in two selected campaigns can only ever receive this bulk action's
// email once, never twice.
export async function bulkStartCampaigns(campaignIds: string[], maxRecipientsPerCall: number = DEFAULT_MAX_RECIPIENTS_PER_BULK_CALL): Promise<BulkSendResult> {
  const uniqueIds = Array.from(new Set(campaignIds));
  const campaignsProcessed: BulkSendCampaignResult[] = [];
  const campaignsSkippedIneligible: { id: string; name: string; reason: string }[] = [];
  const campaignsErrored: { id: string; name: string; error: string }[] = [];
  const sentInThisRun = new Set<string>();
  let totalProcessedThisCall = 0;
  let stoppedEarly = false;

  for (const campaignId of uniqueIds) {
    if (totalProcessedThisCall >= maxRecipientsPerCall) {
      stoppedEarly = true;
      break;
    }

    // Re-fetched fresh for THIS campaign, right before acting on it —
    // never trusts a status computed earlier in this same loop or, even
    // more importantly, anything the browser sent (Part 13: "campaign
    // still READY/eligible... do not trust the browser's selection").
    const campaign = await prisma.outreachCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      campaignsSkippedIneligible.push({ id: campaignId, name: "(not found)", reason: "Campaign not found." });
      continue;
    }
    const recipientCountsBefore = await getCampaignRecipientCounts(campaignId);
    if (!isEligibleForBulkSend(campaign.status, recipientCountsBefore.pending)) {
      campaignsSkippedIneligible.push({
        id: campaignId,
        name: campaign.name,
        reason:
          campaign.status === OutreachCampaignStatus.COMPLETED
            ? "Already fully sent."
            : campaign.status === OutreachCampaignStatus.CANCELLED
              ? "Cancelled."
              : campaign.status === OutreachCampaignStatus.DRAFT
                ? "Recipient list not built yet."
                : campaign.status === OutreachCampaignStatus.SENDING
                  ? "Already sending — use Continue Sending on the campaign's own page."
                  : "No pending recipients left.",
      });
      continue;
    }

    // Part 9: isolated per campaign — a thrown error here (e.g. this
    // exact campaign is ALSO, at this same moment, being sent via the
    // single-campaign "Continue Sending" button elsewhere, so its own
    // re-entrancy guard rejects this call) is recorded and the loop
    // moves on to the next selected campaign, never aborting the whole
    // bulk run over one campaign's problem.
    try {
      const remainingBudget = maxRecipientsPerCall - totalProcessedThisCall;
      const result = await sendCampaignBatch(campaignId, Math.min(recipientCountsBefore.pending, remainingBudget), sentInThisRun);
      campaignsProcessed.push({ ...result, campaignId, campaignName: campaign.name });
      totalProcessedThisCall += result.processed;
      result.sentContactIds.forEach((id) => sentInThisRun.add(id));
    } catch (error) {
      campaignsErrored.push({ id: campaignId, name: campaign.name, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return {
    campaignsProcessed,
    campaignsSkippedIneligible,
    campaignsErrored,
    totalSent: campaignsProcessed.reduce((sum, r) => sum + r.sent, 0),
    totalFailed: campaignsProcessed.reduce((sum, r) => sum + r.failed, 0),
    totalSuppressed: campaignsProcessed.reduce((sum, r) => sum + r.suppressed, 0),
    totalSkippedCrossCampaignDuplicate: campaignsProcessed.reduce((sum, r) => sum + r.skippedCrossCampaignDuplicate, 0),
    stoppedEarly,
  };
}

// Part 20: a deliberate, explicit action — re-queues FAILED rows back to
// PENDING so the next "Continue Sending" batch picks them up. Never
// touches SENT rows, so a retry can never resend a recipient who
// already received the campaign successfully.
export async function retryFailedRecipients(campaignId: string): Promise<{ requeued: number }> {
  const campaign = await prisma.outreachCampaign.findUnique({ where: { id: campaignId }, select: { id: true, status: true } });
  if (!campaign) throw new OutreachCampaignError(`Campaign not found: ${campaignId}`, 404);

  const result = await prisma.outreachCampaignRecipient.updateMany({
    where: { campaignId, status: OutreachRecipientStatus.FAILED },
    data: { status: OutreachRecipientStatus.PENDING, failureReason: null },
  });

  if (result.count > 0 && campaign.status !== OutreachCampaignStatus.SENDING) {
    await prisma.outreachCampaign.update({ where: { id: campaignId }, data: { status: OutreachCampaignStatus.SENDING } });
  }

  return { requeued: result.count };
}

export async function cancelCampaign(campaignId: string) {
  const campaign = await prisma.outreachCampaign.findUnique({ where: { id: campaignId }, select: { id: true, status: true } });
  if (!campaign) throw new OutreachCampaignError(`Campaign not found: ${campaignId}`, 404);
  if (campaign.status === OutreachCampaignStatus.COMPLETED) {
    throw new OutreachCampaignError("This campaign has already completed sending and cannot be cancelled.", 409);
  }

  return prisma.outreachCampaign.update({ where: { id: campaignId }, data: { status: OutreachCampaignStatus.CANCELLED } });
}

export async function deleteCampaign(campaignId: string) {
  const campaign = await prisma.outreachCampaign.findUnique({ where: { id: campaignId }, select: { id: true, sendStartedAt: true } });
  if (!campaign) throw new OutreachCampaignError(`Campaign not found: ${campaignId}`, 404);
  if (campaign.sendStartedAt) {
    throw new OutreachCampaignError("This campaign has already started sending and cannot be deleted. Cancel it instead.", 409);
  }
  await prisma.outreachCampaign.delete({ where: { id: campaignId } });
}
