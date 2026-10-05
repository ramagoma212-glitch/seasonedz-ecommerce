// Milestone 202: individual, human-approved follow-up emails to one CRM contact.
// Nothing here runs on a schedule or in bulk. Every send is one admin's explicit
// request for one contact, with a server-side recipient check, the existing
// signed unsubscribe footer, and a three-part safety design:
//   1. an idempotency key per composer session, so a retry or double-click
//      cannot produce a second email;
//   2. a per-contact lock set atomically before the provider is called, so a
//      second send cannot start while one is in flight or unresolved;
//   3. a settled outcome only: an accepted send is recorded, a definite refusal
//      releases the lock, and an unknown outcome keeps the lock until an ADMIN
//      reconciles it.
// Marketing eligibility (OutreachContact.status) is read and never written here.

import { randomUUID } from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { deliverRenderedEmail } from "../email/email.service.js";
import { OutreachContactError, normalizeOutreachEmail } from "./outreachContact.service.js";
import { appendUnsubscribeFooter } from "./outreachSending.service.js";
import { buildB2bSignature } from "./b2bSignature.js";
import { classifySendFailure } from "./b2bQuotation.rules.js";
import {
  FOLLOW_UP_LEAD_STATUSES,
  assessFollowUp,
  latestReplyAt,
  type FollowUpAssessment,
} from "./followUpRules.js";
import {
  FOLLOW_UP_TEMPLATE_GROUPS,
  findUnsupportedFollowUpText,
  isFollowUpTemplateKey,
  renderFollowUp,
  templateKeyForOrganisationType,
  type FollowUpTemplateKey,
} from "./followUpTemplates.js";
import type { AdminActor } from "./crmActivity.service.js";
import { Prisma } from "@prisma/client";

const KEY_PATTERN = /^[A-Za-z0-9-]{16,100}$/;
const MAX_SUBJECT = 150;
const MAX_BODY = 4000;

export interface FollowUpSendDependencies {
  isDeliveryEnabled: () => boolean;
  deliver: typeof deliverRenderedEmail;
}

export const defaultFollowUpSendDependencies: FollowUpSendDependencies = {
  // Only a real provider counts as delivery. "console" and "disabled" return normally without sending.
  isDeliveryEnabled: () => env.emailEnabled && env.emailProvider === "brevo",
  deliver: deliverRenderedEmail,
};

// The body an admin writes or edits is only the message itself. The signature
// and the signed unsubscribe footer are always added here, never typed by hand.
export function composeFinalBody(bodyText: string, contactId: string): string {
  return appendUnsubscribeFooter(`${bodyText.trim()}\n\n${buildB2bSignature()}`, contactId);
}

function later(a: Date | null, b: Date): Date {
  return !a || b.getTime() > a.getTime() ? b : a;
}

function cleanText(raw: unknown, max: number, label: string): string {
  if (typeof raw !== "string" || raw.trim() === "") throw new OutreachContactError(`${label} is required.`);
  const trimmed = raw.trim();
  if (trimmed.length > max) throw new OutreachContactError(`${label} must be ${max} characters or fewer.`);
  return trimmed;
}

export function validateFollowUpContent(subjectRaw: unknown, bodyRaw: unknown): { subject: string; bodyText: string } {
  const subject = cleanText(subjectRaw, MAX_SUBJECT, "Subject");
  const bodyText = cleanText(bodyRaw, MAX_BODY, "Message");
  const violations = findUnsupportedFollowUpText(subject, bodyText);
  if (violations.length > 0) {
    throw new OutreachContactError(`Please revise the message: ${violations.join("; ")}.`, 400);
  }
  return { subject, bodyText };
}

async function loadContact(contactId: string) {
  const contact = await prisma.outreachContact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      email: true,
      organisationName: true,
      organisationType: true,
      contactName: true,
      contactRole: true,
      status: true,
      leadStatus: true,
      lastContactedAt: true,
      nextFollowUpAt: true,
      nextAction: true,
      emailSendLockAttemptId: true,
    },
  });
  if (!contact) throw new OutreachContactError("Contact not found.", 404);
  return contact;
}

async function latestCampaignFor(contactId: string) {
  const row = await prisma.outreachCampaignRecipient.findFirst({
    where: { contactId, status: "SENT" },
    orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
    select: { sentAt: true, campaign: { select: { name: true, subject: true } } },
  });
  if (!row) return null;
  return { name: row.campaign.name, subject: row.campaign.subject, sentAt: row.sentAt };
}

async function repliesFor(contactId: string): Promise<Date[]> {
  const rows = await prisma.outreachActivity.findMany({ where: { contactId, type: "REPLY_RECEIVED" }, select: { occurredAt: true } });
  return rows.map((row) => row.occurredAt);
}

function blockedReasons(contact: { status: string }): string[] {
  if (contact.status === "ACTIVE") return [];
  return [`This contact's email status is ${contact.status}. Follow-up emails are only sent to ACTIVE contacts. Their status is unchanged.`];
}

// Read-only. Shows exactly what would be sent, including the signature and the
// unsubscribe footer. Writes nothing.
export async function previewFollowUp(contactId: string, raw: Record<string, unknown>, now: Date = new Date()) {
  const contact = await loadContact(contactId);
  const templateKey: FollowUpTemplateKey = isFollowUpTemplateKey(raw.templateKey) ? raw.templateKey : templateKeyForOrganisationType(contact.organisationType);
  const latestCampaign = await latestCampaignFor(contactId);
  const suggested = renderFollowUp(templateKey, { organisationName: contact.organisationName, contactName: contact.contactName, latestCampaign });

  const subject = typeof raw.subject === "string" && raw.subject.trim() ? raw.subject.trim() : suggested.subject;
  const bodyText = typeof raw.body === "string" && raw.body.trim() ? raw.body.trim() : suggested.body;
  const violations = findUnsupportedFollowUpText(subject, bodyText);

  return {
    recipientEmail: contact.email,
    templateKey,
    templates: FOLLOW_UP_TEMPLATE_GROUPS,
    subject,
    bodyText,
    signature: buildB2bSignature(),
    fullBody: composeFinalBody(bodyText, contactId),
    violations,
    blockedReasons: blockedReasons(contact),
    canSend: blockedReasons(contact).length === 0 && violations.length === 0 && !contact.emailSendLockAttemptId,
    lockedByAttempt: Boolean(contact.emailSendLockAttemptId),
    generatedAt: now.toISOString(),
  };
}

export async function getFollowUpComposerContext(contactId: string, now: Date = new Date()) {
  const contact = await loadContact(contactId);
  const [latestCampaign, replies, attempts] = await Promise.all([
    latestCampaignFor(contactId),
    repliesFor(contactId),
    prisma.outreachEmailAttempt.findMany({
      where: { contactId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, status: true, subject: true, body: true, createdAt: true, settledAt: true, failureReason: true, reconciliationNote: true },
    }),
  ]);
  const assessment: FollowUpAssessment = assessFollowUp(contact, latestReplyAt(replies), now);
  return {
    contact,
    latestCampaign,
    suggestedTemplateKey: templateKeyForOrganisationType(contact.organisationType),
    assessment,
    attempts,
    unresolvedAttemptId: contact.emailSendLockAttemptId,
  };
}

// Reservation, provider call and settlement, each in the order that makes a
// duplicate or silent loss impossible. See the file header.
export async function sendFollowUp(
  contactId: string,
  raw: Record<string, unknown>,
  actor: AdminActor,
  deps: FollowUpSendDependencies = defaultFollowUpSendDependencies,
  now: Date = new Date()
) {
  const key = typeof raw.idempotencyKey === "string" ? raw.idempotencyKey.trim() : "";
  if (!KEY_PATTERN.test(key)) throw new OutreachContactError("This send could not be identified. Reload the composer and try again.", 400);

  // A key that already succeeded is a replay: return the stored result, send nothing.
  const existing = await prisma.outreachEmailAttempt.findUnique({ where: { idempotencyKey: key } });
  if (existing) {
    if (existing.contactId !== contactId) throw new OutreachContactError("This send belongs to a different contact.", 409);
    if (existing.status === "ACCEPTED" || existing.status === "CONFIRMED_SENT") {
      return { replayed: true, attemptId: existing.id, status: existing.status };
    }
    throw new OutreachContactError("This message was already submitted. It is not sent again. Check the timeline, then open the composer again if you need to send a new message.", 409);
  }

  const contact = await loadContact(contactId);
  if (contact.status !== "ACTIVE") {
    throw new OutreachContactError(`This contact's email status is ${contact.status}, so no follow-up was sent. Their email eligibility has not been changed.`, 409);
  }
  if (contact.emailSendLockAttemptId) {
    throw new OutreachContactError("An email to this contact is already in progress or its outcome is unconfirmed. Do not resend. Reconcile it first.", 409);
  }

  let confirmed: string;
  try {
    confirmed = normalizeOutreachEmail(String(raw.confirmRecipientEmail ?? ""));
  } catch {
    throw new OutreachContactError("Type the recipient email address to confirm before sending.", 400);
  }
  if (confirmed !== normalizeOutreachEmail(contact.email)) {
    throw new OutreachContactError("The recipient address does not match this contact, so nothing was sent.", 409);
  }

  const { subject, bodyText } = validateFollowUpContent(raw.subject, raw.body);
  const templateKey = isFollowUpTemplateKey(raw.templateKey) ? raw.templateKey : null;
  const finalBody = composeFinalBody(bodyText, contactId);

  if (!deps.isDeliveryEnabled()) {
    throw new OutreachContactError("Email delivery is switched off in this environment, so nothing was sent.", 503);
  }

  const attemptId = randomUUID();
  const recipientName = contact.contactName ?? contact.organisationName ?? undefined;

  // Step 1: reserve. The lock and the attempt row commit together, so a crash
  // can never leave a lock without a record, or a record without a lock.
  try {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.outreachContact.updateMany({
        where: { id: contactId, status: "ACTIVE", emailSendLockAttemptId: null },
        data: { emailSendLockAttemptId: attemptId },
      });
      if (locked.count !== 1) {
        throw new OutreachContactError("An email to this contact is already in progress or its outcome is unconfirmed. Do not resend. Reconcile it first.", 409);
      }
      await tx.outreachEmailAttempt.create({
        data: {
          id: attemptId,
          idempotencyKey: key,
          contactId,
          kind: "FOLLOW_UP",
          templateKey,
          status: "RESERVED",
          recipientEmail: contact.email,
          subject,
          body: finalBody,
          createdByAdminUserId: actor.id,
          createdByAdminNameSnapshot: actor.name,
          createdByAdminEmailSnapshot: actor.email,
        },
      });
    });
  } catch (error) {
    if (error instanceof OutreachContactError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new OutreachContactError("This message was already submitted. It is not sent again.", 409);
    }
    throw new OutreachContactError("The send could not be prepared, so nothing was sent. Try again.", 503);
  }

  // Step 2: the external side effect.
  try {
    await deps.deliver({
      templateName: "outreach-follow-up",
      recipientRole: "contact",
      recipientEmail: contact.email,
      recipientName,
      reference: `follow-up:${attemptId}`,
      rendered: { subject, body: finalBody },
    });
  } catch (error) {
    const definite = classifySendFailure(error) === "DEFINITE";
    await settleUnsuccessful(attemptId, contactId, definite ? "FAILED" : "UNCERTAIN", error instanceof Error ? error.message : "Unknown error", now);
    if (definite) {
      throw new OutreachContactError("The email provider did not accept the message, so nothing was sent. You can compose it again.", 502);
    }
    throw new OutreachContactError("The email provider did not confirm the outcome, so the email may or may not have been delivered. Do not resend. Check the mailbox, then reconcile this send.", 502);
  }

  // Step 3: the provider accepted the message. Record it, or leave the lock held.
  try {
    await prisma.$transaction(async (tx) => {
      const accepted = await tx.outreachEmailAttempt.updateMany({ where: { id: attemptId, status: "RESERVED" }, data: { status: "ACCEPTED", settledAt: now } });
      if (accepted.count !== 1) throw new Error("Attempt left RESERVED during send.");
      const current = await tx.outreachContact.findUnique({ where: { id: contactId }, select: { lastContactedAt: true } });
      await tx.outreachContact.update({
        where: { id: contactId },
        data: { emailSendLockAttemptId: null, lastContactedAt: later(current?.lastContactedAt ?? null, now) },
      });
      await tx.outreachActivity.create({
        data: {
          contactId,
          type: "FOLLOW_UP_EMAIL_SENT",
          channel: "EMAIL",
          occurredAt: now,
          title: "Follow-up email sent",
          details: `Subject: ${subject}`,
          createdByAdminUserId: actor.id,
          createdByAdminNameSnapshot: actor.name,
          createdByAdminEmailSnapshot: actor.email,
        },
      });
    });
  } catch {
    console.error(`[followUp] attempt ${attemptId} was accepted by the provider but could not be recorded. The contact stays locked until reconciled.`);
    throw new OutreachContactError(
      "The email was accepted by the provider, but it could not be recorded. The contact is locked until an admin reconciles it. Do not resend.",
      500
    );
  }

  return { replayed: false, attemptId, status: "ACCEPTED" as const };
}

// Settles a send that did not succeed. A definite refusal releases the lock. An
// unknown outcome keeps it. If this write fails, the lock stays, which is the safe default.
async function settleUnsuccessful(attemptId: string, contactId: string, status: "FAILED" | "UNCERTAIN", reason: string, now: Date) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.outreachEmailAttempt.updateMany({
        where: { id: attemptId, status: "RESERVED" },
        data: { status, failureReason: reason, settledAt: status === "FAILED" ? now : null },
      });
      if (status === "FAILED") {
        await tx.outreachContact.updateMany({ where: { id: contactId, emailSendLockAttemptId: attemptId }, data: { emailSendLockAttemptId: null } });
      }
    });
  } catch {
    console.error(`[followUp] could not settle attempt ${attemptId} as ${status}; the contact stays locked.`);
  }
}

// An admin's decision on a send whose outcome is unresolved. "Delivered" records
// the send as an activity and updates lastContactedAt. "Not delivered" releases
// the lock so a new composer session can send. Both need a written note.
export async function reconcileFollowUpAttempt(contactId: string, attemptId: string, raw: Record<string, unknown>, actor: AdminActor, now: Date = new Date()) {
  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  if (note.length < 5 || note.length > 1000) throw new OutreachContactError("Write a short note explaining how you checked, between 5 and 1000 characters.", 400);
  if (raw.outcome !== "SENT" && raw.outcome !== "NOT_SENT") throw new OutreachContactError("Choose whether the email was delivered or not.", 400);

  const attempt = await prisma.outreachEmailAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.contactId !== contactId) throw new OutreachContactError("Send record not found for this contact.", 404);
  if (attempt.status !== "RESERVED" && attempt.status !== "UNCERTAIN") {
    throw new OutreachContactError("Only a send whose outcome is unresolved can be reconciled.", 409);
  }

  const delivered = raw.outcome === "SENT";
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.outreachEmailAttempt.updateMany({
      where: { id: attemptId, status: attempt.status },
      data: { status: delivered ? "CONFIRMED_SENT" : "CONFIRMED_NOT_SENT", reconciliationNote: note, settledAt: now },
    });
    if (claimed.count !== 1) throw new OutreachContactError("This send changed while you were reconciling it. Refresh and check its status.", 409);

    const current = await tx.outreachContact.findUnique({ where: { id: contactId }, select: { lastContactedAt: true } });
    await tx.outreachContact.updateMany({
      where: { id: contactId, emailSendLockAttemptId: attemptId },
      data: {
        emailSendLockAttemptId: null,
        ...(delivered ? { lastContactedAt: later(current?.lastContactedAt ?? null, now) } : {}),
      },
    });
    if (delivered) {
      await tx.outreachActivity.create({
        data: {
          contactId,
          type: "FOLLOW_UP_EMAIL_SENT",
          channel: "EMAIL",
          occurredAt: now,
          title: "Follow-up email sent (confirmed by admin)",
          details: `Subject: ${attempt.subject}. Checked: ${note}`,
          createdByAdminUserId: actor.id,
          createdByAdminNameSnapshot: actor.name,
          createdByAdminEmailSnapshot: actor.email,
        },
      });
    }
    return { attemptId, status: delivered ? "CONFIRMED_SENT" : "CONFIRMED_NOT_SENT" };
  });
}

// The Needs Follow-up queue. The rule lives in followUpRules.ts. Only contacts
// it marks as needing a follow-up are returned, ordered by how overdue they are.
export async function listFollowUpQueue(now: Date = new Date(), limit = 200) {
  const candidates = await prisma.outreachContact.findMany({
    where: { status: "ACTIVE", leadStatus: { in: [...FOLLOW_UP_LEAD_STATUSES] }, lastContactedAt: { not: null } },
    select: {
      id: true,
      email: true,
      organisationName: true,
      organisationType: true,
      contactName: true,
      contactRole: true,
      status: true,
      leadStatus: true,
      lastContactedAt: true,
      nextFollowUpAt: true,
      nextAction: true,
      emailSendLockAttemptId: true,
      activities: { where: { type: "REPLY_RECEIVED" }, select: { occurredAt: true } },
    },
    take: 1000,
  });

  const ids = candidates.map((candidate) => candidate.id);
  const sentRecipients = ids.length
    ? await prisma.outreachCampaignRecipient.findMany({
        where: { contactId: { in: ids }, status: "SENT" },
        orderBy: [{ sentAt: "desc" }],
        select: { contactId: true, sentAt: true, campaign: { select: { name: true, subject: true } } },
      })
    : [];
  const latestByContact = new Map<string, { name: string; subject: string; sentAt: Date | null }>();
  for (const row of sentRecipients) {
    if (!latestByContact.has(row.contactId)) latestByContact.set(row.contactId, { name: row.campaign.name, subject: row.campaign.subject, sentAt: row.sentAt });
  }

  const assessed = candidates.map((candidate) => {
    const assessment = assessFollowUp(candidate, latestReplyAt(candidate.activities.map((activity) => activity.occurredAt)), now);
    return { candidate, assessment };
  });

  const due = assessed
    .filter(({ assessment }) => assessment.needsFollowUp)
    .sort((a, b) => {
      const aDue = (a.candidate.nextFollowUpAt ?? a.candidate.lastContactedAt)!.getTime();
      const bDue = (b.candidate.nextFollowUpAt ?? b.candidate.lastContactedAt)!.getTime();
      return aDue - bDue;
    })
    .slice(0, limit)
    .map(({ candidate, assessment }) => ({
      id: candidate.id,
      organisationName: candidate.organisationName,
      organisationType: candidate.organisationType,
      contactName: candidate.contactName,
      email: candidate.email,
      leadStatus: candidate.leadStatus,
      lastContactedAt: candidate.lastContactedAt,
      nextFollowUpAt: candidate.nextFollowUpAt,
      nextAction: candidate.nextAction,
      latestCampaign: latestByContact.get(candidate.id) ?? null,
      reason: assessment.reason,
    }));

  return {
    items: due,
    counts: {
      needsFollowUp: due.length,
      replied: assessed.filter(({ assessment }) => assessment.replied).length,
      scheduled: assessed.filter(({ assessment }) => assessment.reason.startsWith("Scheduled")).length,
      candidates: candidates.length,
    },
  };
}
