// Milestone 201: CRM activity timeline, reply recording, next action and
// follow-up workflow, catalogue tracking, and explicit order/customer
// linking. Every function here is a deliberate admin action: nothing in
// this file sends email, and nothing changes OutreachContact.status (email
// eligibility). Lead status changes only where a function says so.

import { OutreachContactError } from "./outreachContact.service.js";
import { prisma } from "../../config/prisma.js";
import {
  assertCanMarkCustomer,
  assertCanMarkRepeatCustomer,
  canRecordCustomerOrderLink,
  OUTBOUND_ACTIVITY_TYPES,
  parseCatalogueSentInput,
  parseFollowUpInput,
  parseManualActivityInput,
  sortTimelineNewestFirst,
} from "./crmActivity.rules.js";
import { getContactCampaignHistory } from "./outreachContact.service.js";
import type { Prisma } from "@prisma/client";

export interface AdminActor {
  id: string;
  name: string;
  email: string;
}

function actorFields(actor: AdminActor) {
  return {
    createdByAdminUserId: actor.id,
    createdByAdminNameSnapshot: actor.name,
    createdByAdminEmailSnapshot: actor.email,
  };
}

function later(a: Date | null, b: Date): Date {
  return !a || b.getTime() > a.getTime() ? b : a;
}

async function requireContact(contactId: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const contact = await tx.outreachContact.findUnique({
    where: { id: contactId },
    select: { id: true, email: true, buyerEmail: true, status: true, leadStatus: true, lastContactedAt: true, lastCatalogueSentAt: true },
  });
  if (!contact) throw new OutreachContactError("Contact not found.", 404);
  return contact;
}

export async function recordManualActivity(contactId: string, raw: Record<string, unknown>, actor: AdminActor, now: Date = new Date()) {
  const input = parseManualActivityInput(raw, now);

  return prisma.$transaction(async (tx) => {
    const contact = await requireContact(contactId, tx);
    const activity = await tx.outreachActivity.create({
      data: {
        contactId,
        type: input.type,
        channel: input.channel,
        occurredAt: input.occurredAt,
        title: input.title,
        details: input.details,
        ...actorFields(actor),
      },
    });

    if (OUTBOUND_ACTIVITY_TYPES.has(input.type) && (!contact.lastContactedAt || input.occurredAt > contact.lastContactedAt)) {
      await tx.outreachContact.update({
        where: { id: contact.id },
        data: { lastContactedAt: input.occurredAt },
      });
    }
    return activity;
  });
}

export async function setFollowUp(contactId: string, raw: Record<string, unknown>) {
  const input = parseFollowUpInput(raw);
  await requireContact(contactId);

  // Clearing the date also clears the action it belonged to, unless the
  // admin supplied a new action in the same request.
  const nextAction = input.nextFollowUpAt === null && input.nextAction === undefined ? null : input.nextAction;

  return prisma.outreachContact.update({
    where: { id: contactId },
    data: {
      ...(input.nextFollowUpAt !== undefined ? { nextFollowUpAt: input.nextFollowUpAt } : {}),
      ...(nextAction !== undefined ? { nextAction } : {}),
    },
  });
}

export async function completeFollowUp(contactId: string, raw: Record<string, unknown>, actor: AdminActor, now: Date = new Date()) {
  const activityInput = parseManualActivityInput({ ...raw, type: "NOTE", title: "Follow-up completed" }, now);
  const next = parseFollowUpInput(raw);

  return prisma.$transaction(async (tx) => {
    const contact = await requireContact(contactId, tx);
    const activity = await tx.outreachActivity.create({
      data: {
        contactId,
        type: "FOLLOW_UP",
        channel: null,
        occurredAt: activityInput.occurredAt,
        title: "Follow-up completed",
        details: activityInput.details,
        ...actorFields(actor),
      },
    });

    // A completed follow-up is the admin's own outbound contact attempt.
    await tx.outreachContact.update({
      where: { id: contact.id },
      data: {
        lastContactedAt: later(contact.lastContactedAt, activityInput.occurredAt),
        nextFollowUpAt: next.nextFollowUpAt ?? null,
        nextAction: next.nextAction ?? null,
      },
    });
    return activity;
  });
}

export async function recordCatalogueSent(contactId: string, raw: Record<string, unknown>, actor: AdminActor, now: Date = new Date()) {
  const input = parseCatalogueSentInput(raw, now);

  return prisma.$transaction(async (tx) => {
    const contact = await requireContact(contactId, tx);
    const activity = await tx.outreachActivity.create({
      data: {
        contactId,
        type: "CATALOGUE_SENT",
        channel: input.channel,
        occurredAt: input.occurredAt,
        title: "Catalogue sent",
        details: input.details,
        ...actorFields(actor),
      },
    });

    await tx.outreachContact.update({
      where: { id: contact.id },
      data: {
        lastCatalogueSentAt: later(contact.lastCatalogueSentAt, input.occurredAt),
        lastContactedAt: later(contact.lastContactedAt, input.occurredAt),
      },
    });
    return activity;
  });
}

// Orders whose customerEmail matches this contact's email (or buyerEmail)
// exactly, ignoring letter case. Never matched by name or fuzzy similarity.
// Cancelled orders are not evidence of a customer relationship.
export async function findMatchingOrdersForContact(contact: { email: string; buyerEmail: string | null }) {
  const emails = [contact.email, contact.buyerEmail].filter((value): value is string => Boolean(value));
  const orders = await prisma.order.findMany({
    where: {
      OR: emails.map((email) => ({ customerEmail: { equals: email, mode: "insensitive" as const } })),
      status: { not: "CANCELLED" },
    },
    select: { id: true, orderNumber: true, createdAt: true, status: true, total: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return orders.map((order) => ({ ...order, total: order.total.toString() }));
}

export async function linkOrder(contactId: string, orderId: string, actor: AdminActor) {
  const contact = await requireContact(contactId);
  const matches = await findMatchingOrdersForContact(contact);
  if (!canRecordCustomerOrderLink(matches.map((order) => order.id), orderId)) {
    throw new OutreachContactError("That order does not have this contact's email address, so it cannot be linked.", 409);
  }
  const order = matches.find((item) => item.id === orderId)!;

  const alreadyLinked = await prisma.outreachActivity.findFirst({ where: { contactId, type: "ORDER_CREATED", orderId }, select: { id: true } });
  if (alreadyLinked) throw new OutreachContactError("This order is already linked to the contact.", 409);

  return prisma.outreachActivity.create({
    data: {
      contactId,
      type: "ORDER_CREATED",
      channel: null,
      occurredAt: order.createdAt,
      title: `Order ${order.orderNumber} linked`,
      details: null,
      orderId,
      ...actorFields(actor),
    },
  });
}

export async function markCustomer(contactId: string, orderId: string, actor: AdminActor, now: Date = new Date()) {
  const contact = await requireContact(contactId);
  const matches = await findMatchingOrdersForContact(contact);
  assertCanMarkCustomer(matches.length);
  if (!canRecordCustomerOrderLink(matches.map((order) => order.id), orderId)) {
    throw new OutreachContactError("That order does not have this contact's email address.", 409);
  }
  const order = matches.find((item) => item.id === orderId)!;

  return prisma.$transaction(async (tx) => {
    await tx.outreachContact.update({ where: { id: contactId }, data: { leadStatus: "CUSTOMER" } });
    return tx.outreachActivity.create({
      data: {
        contactId,
        type: "CUSTOMER_CONVERTED",
        channel: null,
        occurredAt: now,
        title: `Marked as customer from order ${order.orderNumber}`,
        details: null,
        orderId,
        ...actorFields(actor),
      },
    });
  });
}

export async function markRepeatCustomer(contactId: string, actor: AdminActor, now: Date = new Date()) {
  const contact = await prisma.outreachContact.findUnique({
    where: { id: contactId },
    select: { id: true, email: true, buyerEmail: true, leadStatus: true },
  });
  if (!contact) throw new OutreachContactError("Contact not found.", 404);

  const matches = await findMatchingOrdersForContact(contact);
  assertCanMarkRepeatCustomer(contact.leadStatus, matches.length);

  return prisma.$transaction(async (tx) => {
    await tx.outreachContact.update({ where: { id: contactId }, data: { leadStatus: "REPEAT_CUSTOMER" } });
    return tx.outreachActivity.create({
      data: {
        contactId,
        type: "CUSTOMER_CONVERTED",
        channel: null,
        occurredAt: now,
        title: "Marked as repeat customer",
        details: `${matches.length} orders with this email address.`,
        ...actorFields(actor),
      },
    });
  });
}

export async function getContactTimeline(contactId: string) {
  const [activities, campaigns] = await Promise.all([
    prisma.outreachActivity.findMany({
      where: { contactId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 200,
      select: {
        id: true,
        type: true,
        channel: true,
        occurredAt: true,
        title: true,
        details: true,
        orderId: true,
        quotationId: true,
        fromLeadStatus: true,
        toLeadStatus: true,
        createdByAdminNameSnapshot: true,
        createdAt: true,
      },
    }),
    getContactCampaignHistory(contactId),
  ]);

  const entries = [
    ...activities.map((activity) => ({ kind: "activity" as const, ...activity })),
    ...campaigns
      .filter((campaign) => campaign.sentAt !== null)
      .map((campaign) => ({
        kind: "campaign" as const,
        id: `campaign-${campaign.campaignId}-${campaign.sentAt!.getTime()}`,
        type: "CAMPAIGN_SENT" as const,
        occurredAt: campaign.sentAt!,
        title: `Campaign: ${campaign.campaignName}`,
        details: campaign.campaignSubject,
        status: campaign.status,
      })),
  ];

  return sortTimelineNewestFirst(entries);
}

// Read-only: enquiries are shown beside the contact only when their email
// matches exactly. Nothing is linked or merged automatically.
export async function getContactCrmDetail(contactId: string) {
  const contact = await prisma.outreachContact.findUnique({
    where: { id: contactId },
    select: { id: true, email: true, buyerEmail: true, status: true, leadStatus: true },
  });
  if (!contact) throw new OutreachContactError("Contact not found.", 404);

  const [timeline, linkedOrders, enquiries, quotations] = await Promise.all([
    getContactTimeline(contactId),
    findMatchingOrdersForContact(contact),
    prisma.enquiry.findMany({
      where: {
        OR: [contact.email, contact.buyerEmail]
          .filter((value): value is string => Boolean(value))
          .map((email) => ({ email: { equals: email, mode: "insensitive" as const } })),
      },
      select: { id: true, type: true, status: true, subject: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.b2bQuotation.findMany({
      where: { contactId },
      select: { id: true, quotationNumber: true, status: true, total: true, quotationDate: true, validUntil: true, sentAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return {
    timeline,
    linkedOrders,
    enquiries,
    quotations: quotations.map((quotation) => ({ ...quotation, total: quotation.total.toString() })),
  };
}
