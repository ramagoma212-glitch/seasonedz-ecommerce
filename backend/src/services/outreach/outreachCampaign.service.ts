// Milestone 198: B2B outreach campaign lifecycle — draft a campaign,
// snapshot its recipient list from a real audience filter, send it in
// small, resumable, admin-triggered batches (no queue/background worker
// exists in this codebase — see this milestone's own infrastructure
// audit), and track every recipient's own send status.

import { OutreachCampaignStatus, OutreachContactStatus, OutreachRecipientStatus, Prisma } from "@prisma/client";
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

export async function listCampaigns(filters: { status?: OutreachCampaignStatus; page?: number; limit?: number } = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(filters.limit ?? 20, 100);
  const where: Prisma.OutreachCampaignWhereInput = filters.status ? { status: filters.status } : {};

  const [campaigns, total] = await Promise.all([
    prisma.outreachCampaign.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.outreachCampaign.count({ where }),
  ]);
  return { campaigns, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export interface OutreachAudienceFilter {
  contactIds?: string[];
  organisationTypes?: string[];
  provinces?: string[];
  cities?: string[];
  sources?: string[];
  tags?: string[];
}

// Always ACTIVE-only, non-negotiably — Part 12's own "before EVERY send,
// server-side logic must check suppression status" starts here: a
// suppressed/unsubscribed/bounced/invalid contact can never even enter a
// campaign's recipient snapshot in the first place, regardless of which
// filter or explicit selection the admin used to build it.
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
export async function sendCampaignBatch(campaignId: string, batchSize: number = DEFAULT_BATCH_SIZE): Promise<SendBatchResult> {
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

    for (const recipient of batch) {
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

    return { processed: batch.length, sent, failed, suppressed, campaignStatus, recipientCounts };
  } finally {
    campaignsCurrentlySending.delete(campaignId);
  }
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
