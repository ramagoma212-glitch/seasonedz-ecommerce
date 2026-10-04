// Milestone 201: B2B quotation module. Creates, edits, duplicates and moves
// quotations through their statuses, and sends them by email on an explicit
// admin action. Prices for existing products are read from the product
// table on every write; the admin's quote price is the only price a quote
// stores, and it is snapshotted with the line.

import type { QuotationStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { deliverRenderedEmail } from "../email/email.service.js";
import { centsToDecimalString, formatRand, parseMoneyToCents } from "../../utils/quotationMoney.js";
import { OutreachContactError, normalizeOutreachEmail } from "./outreachContact.service.js";
import {
  assertQuotationEditable,
  assertQuotationTransition,
  buildQuotationEmail,
  computeQuotationTotals,
  formatQuotationNumber,
  MAX_QUOTATION_LINES,
  parseQuantity,
  QuotationRuleError,
} from "./b2bQuotation.rules.js";
import type { AdminActor } from "./crmActivity.service.js";

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TEXT_LENGTH = 2000;

// Decimal(10,2) column value -> exact integer cents, never via Number().
function decimalToCents(value: Prisma.Decimal | string): number {
  return parseMoneyToCents(value.toString(), "Amount");
}

function sastYear(now: Date): number {
  return new Date(now.getTime() + SAST_OFFSET_MS).getUTCFullYear();
}

function cleanOptionalText(raw: unknown, fieldLabel: string): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw new QuotationRuleError(`${fieldLabel} must be text.`);
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.length > MAX_TEXT_LENGTH) throw new QuotationRuleError(`${fieldLabel} must be ${MAX_TEXT_LENGTH} characters or fewer.`);
  return trimmed;
}

function parseDate(raw: unknown, fieldLabel: string, fallback: Date | null): Date {
  if (raw === undefined || raw === null || raw === "") {
    if (fallback) return fallback;
    throw new QuotationRuleError(`${fieldLabel} is required.`);
  }
  if (raw instanceof Date) return raw;
  if (typeof raw !== "string") throw new QuotationRuleError(`${fieldLabel} is not a valid date.`);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new QuotationRuleError(`${fieldLabel} is not a valid date.`);
  return date;
}

export interface QuotationLineRequest {
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface QuotationDraftInput {
  contactId: string;
  quotationDate: Date;
  validUntil: Date;
  discountCents: number;
  deliveryCents: number;
  billingAddress: string | null;
  notes: string | null;
  lines: QuotationLineRequest[];
}

export function parseQuotationDraftInput(raw: Record<string, unknown>, now: Date = new Date()): QuotationDraftInput {
  if (typeof raw.contactId !== "string" || raw.contactId.trim() === "") throw new QuotationRuleError("Choose a contact for this quotation.");

  const quotationDate = parseDate(raw.quotationDate, "Quotation date", now);
  const validUntil = parseDate(raw.validUntil, "Valid-until date", null);
  if (validUntil.getTime() < quotationDate.getTime()) throw new QuotationRuleError("The valid-until date cannot be before the quotation date.");

  if (!Array.isArray(raw.lines) || raw.lines.length === 0) throw new QuotationRuleError("Add at least one product to the quotation.");
  if (raw.lines.length > MAX_QUOTATION_LINES) throw new QuotationRuleError(`A quotation can have at most ${MAX_QUOTATION_LINES} line items.`);

  const seen = new Set<string>();
  const lines: QuotationLineRequest[] = raw.lines.map((item, index) => {
    const line = (item ?? {}) as Record<string, unknown>;
    if (typeof line.productId !== "string" || line.productId.trim() === "") {
      throw new QuotationRuleError(`Line ${index + 1}: choose a product.`);
    }
    if (seen.has(line.productId)) throw new QuotationRuleError(`Line ${index + 1}: this product is already on the quotation.`);
    seen.add(line.productId);
    try {
      return {
        productId: line.productId,
        quantity: parseQuantity(line.quantity),
        unitPriceCents: parseMoneyToCents(line.unitPrice, `Line ${index + 1} unit price`),
      };
    } catch (error) {
      if (error instanceof QuotationRuleError) throw error;
      throw new QuotationRuleError(error instanceof Error ? error.message : "Invalid line.");
    }
  });

  let discountCents = 0;
  let deliveryCents = 0;
  try {
    discountCents = parseMoneyToCents(raw.discount ?? "0", "Discount");
    deliveryCents = parseMoneyToCents(raw.delivery ?? "0", "Delivery");
  } catch (error) {
    throw new QuotationRuleError(error instanceof Error ? error.message : "Invalid amount.");
  }

  return {
    contactId: raw.contactId.trim(),
    quotationDate,
    validUntil,
    discountCents,
    deliveryCents,
    billingAddress: cleanOptionalText(raw.billingAddress, "Billing address"),
    notes: cleanOptionalText(raw.notes, "Notes"),
    lines,
  };
}

async function loadPricedLines(tx: Prisma.TransactionClient, requests: QuotationLineRequest[]) {
  const products = await tx.product.findMany({
    where: { id: { in: requests.map((line) => line.productId) } },
    select: { id: true, name: true, sku: true, status: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  return requests.map((request, index) => {
    const product = byId.get(request.productId);
    if (!product) throw new QuotationRuleError(`Line ${index + 1}: that product no longer exists.`, 404);
    if (product.status !== "ACTIVE") throw new QuotationRuleError(`Line ${index + 1}: ${product.name} is not available to quote.`);
    return {
      productId: product.id,
      descriptionSnapshot: product.name,
      skuSnapshot: product.sku ?? null,
      quantity: request.quantity,
      unitPriceCents: request.unitPriceCents,
    };
  });
}

async function loadContactSnapshot(tx: Prisma.TransactionClient, contactId: string) {
  const contact = await tx.outreachContact.findUnique({
    where: { id: contactId },
    select: { id: true, email: true, organisationName: true, contactName: true, phone: true },
  });
  if (!contact) throw new QuotationRuleError("Contact not found.", 404);
  return {
    contact,
    snapshot: {
      organisationNameSnapshot: contact.organisationName ?? contact.email,
      contactNameSnapshot: contact.contactName,
      emailSnapshot: contact.email,
      phoneSnapshot: contact.phone,
    },
  };
}

// Serialised by a single UPSERT-increment inside the create transaction, so
// two concurrent creates can never be handed the same number.
async function nextQuotationNumber(tx: Prisma.TransactionClient, now: Date): Promise<string> {
  const year = sastYear(now);
  const counter = await tx.quotationNumberCounter.upsert({
    where: { year },
    create: { year, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });
  return formatQuotationNumber(year, counter.lastValue);
}

async function insertDraft(
  tx: Prisma.TransactionClient,
  input: QuotationDraftInput,
  actor: AdminActor,
  now: Date
) {
  const { contact, snapshot } = await loadContactSnapshot(tx, input.contactId);
  const lines = await loadPricedLines(tx, input.lines);
  const totals = computeQuotationTotals(
    lines.map((line) => ({ unitPriceCents: line.unitPriceCents, quantity: line.quantity })),
    input.discountCents,
    input.deliveryCents
  );
  const quotationNumber = await nextQuotationNumber(tx, now);

  const quotation = await tx.b2bQuotation.create({
    data: {
      quotationNumber,
      contactId: contact.id,
      status: "DRAFT",
      quotationDate: input.quotationDate,
      validUntil: input.validUntil,
      ...snapshot,
      billingAddress: input.billingAddress,
      notes: input.notes,
      subtotal: centsToDecimalString(totals.subtotalCents),
      discountAmount: centsToDecimalString(totals.discountCents),
      deliveryAmount: centsToDecimalString(totals.deliveryCents),
      total: centsToDecimalString(totals.totalCents),
      createdByAdminUserId: actor.id,
      createdByAdminNameSnapshot: actor.name,
      createdByAdminEmailSnapshot: actor.email,
      lines: {
        create: lines.map((line, index) => ({
          position: index + 1,
          productId: line.productId,
          descriptionSnapshot: line.descriptionSnapshot,
          skuSnapshot: line.skuSnapshot,
          quantity: line.quantity,
          unitPrice: centsToDecimalString(line.unitPriceCents),
          lineTotal: centsToDecimalString(totals.lineTotalsCents[index]!),
        })),
      },
    },
  });

  await tx.outreachActivity.create({
    data: {
      contactId: contact.id,
      type: "QUOTE_CREATED",
      occurredAt: now,
      title: `Quotation ${quotationNumber} created`,
      quotationId: quotation.id,
      createdByAdminUserId: actor.id,
      createdByAdminNameSnapshot: actor.name,
      createdByAdminEmailSnapshot: actor.email,
    },
  });

  return quotation;
}

export async function createQuotationDraft(raw: Record<string, unknown>, actor: AdminActor, now: Date = new Date()) {
  const input = parseQuotationDraftInput(raw, now);
  return prisma.$transaction((tx) => insertDraft(tx, input, actor, now));
}

export async function updateQuotationDraft(id: string, raw: Record<string, unknown>, now: Date = new Date()) {
  const existing = await prisma.b2bQuotation.findUnique({ where: { id }, select: { id: true, status: true, quotationDate: true, contactId: true } });
  if (!existing) throw new QuotationRuleError("Quotation not found.", 404);
  assertQuotationEditable(existing.status);

  const input = parseQuotationDraftInput(
    { ...raw, contactId: existing.contactId, quotationDate: raw.quotationDate ?? existing.quotationDate },
    now
  );

  return prisma.$transaction(async (tx) => {
    const lines = await loadPricedLines(tx, input.lines);
    const totals = computeQuotationTotals(
      lines.map((line) => ({ unitPriceCents: line.unitPriceCents, quantity: line.quantity })),
      input.discountCents,
      input.deliveryCents
    );

    await tx.b2bQuotationLine.deleteMany({ where: { quotationId: id } });
    return tx.b2bQuotation.update({
      where: { id },
      data: {
        quotationDate: input.quotationDate,
        validUntil: input.validUntil,
        billingAddress: input.billingAddress,
        notes: input.notes,
        subtotal: centsToDecimalString(totals.subtotalCents),
        discountAmount: centsToDecimalString(totals.discountCents),
        deliveryAmount: centsToDecimalString(totals.deliveryCents),
        total: centsToDecimalString(totals.totalCents),
        lines: {
          create: lines.map((line, index) => ({
            position: index + 1,
            productId: line.productId,
            descriptionSnapshot: line.descriptionSnapshot,
            skuSnapshot: line.skuSnapshot,
            quantity: line.quantity,
            unitPrice: centsToDecimalString(line.unitPriceCents),
            lineTotal: centsToDecimalString(totals.lineTotalsCents[index]!),
          })),
        },
      },
    });
  });
}

// A duplicate is always a new DRAFT with a new number and the contact's
// current details. The source quotation is never altered.
export async function duplicateQuotation(id: string, actor: AdminActor, now: Date = new Date()) {
  const source = await prisma.b2bQuotation.findUnique({
    where: { id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!source) throw new QuotationRuleError("Quotation not found.", 404);

  const durationMs = source.validUntil.getTime() - source.quotationDate.getTime();
  const input: QuotationDraftInput = {
    contactId: source.contactId,
    quotationDate: now,
    validUntil: new Date(now.getTime() + Math.max(durationMs, DAY_MS)),
    discountCents: decimalToCents(source.discountAmount),
    deliveryCents: decimalToCents(source.deliveryAmount),
    billingAddress: source.billingAddress,
    notes: source.notes,
    lines: source.lines.map((line) => {
      if (!line.productId) throw new QuotationRuleError("This quotation includes a product that has since been removed, so it cannot be duplicated. Create a new quotation instead.", 409);
      return {
        productId: line.productId,
        quantity: line.quantity,
        unitPriceCents: decimalToCents(line.unitPrice),
      };
    }),
  };

  return prisma.$transaction(async (tx) => {
    const draft = await insertDraft(tx, input, actor, now);
    await tx.outreachActivity.create({
      data: {
        contactId: source.contactId,
        type: "NOTE",
        occurredAt: now,
        title: `Quotation ${draft.quotationNumber} created from ${source.quotationNumber}`,
        quotationId: draft.id,
        createdByAdminUserId: actor.id,
        createdByAdminNameSnapshot: actor.name,
        createdByAdminEmailSnapshot: actor.email,
      },
    });
    return draft;
  });
}

type TerminalTransition = Extract<QuotationStatus, "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED">;

const TRANSITION_TIMESTAMP: Record<TerminalTransition, "acceptedAt" | "declinedAt" | "cancelledAt" | null> = {
  ACCEPTED: "acceptedAt",
  DECLINED: "declinedAt",
  EXPIRED: null,
  CANCELLED: "cancelledAt",
};

export async function transitionQuotation(id: string, to: TerminalTransition, actor: AdminActor, now: Date = new Date()) {
  const quotation = await prisma.b2bQuotation.findUnique({ where: { id }, select: { id: true, status: true, contactId: true, quotationNumber: true } });
  if (!quotation) throw new QuotationRuleError("Quotation not found.", 404);
  assertQuotationTransition(quotation.status, to);

  const timestampField = TRANSITION_TIMESTAMP[to];
  const activity = {
    ACCEPTED: { type: "QUOTE_ACCEPTED" as const, title: `Quotation ${quotation.quotationNumber} accepted` },
    DECLINED: { type: "QUOTE_DECLINED" as const, title: `Quotation ${quotation.quotationNumber} declined` },
    EXPIRED: { type: "NOTE" as const, title: `Quotation ${quotation.quotationNumber} marked expired` },
    CANCELLED: { type: "NOTE" as const, title: `Quotation ${quotation.quotationNumber} cancelled` },
  }[to];

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.b2bQuotation.updateMany({
      where: { id, status: quotation.status },
      data: { status: to, ...(timestampField ? { [timestampField]: now } : {}) },
    });
    if (claimed.count !== 1) throw new QuotationRuleError("This quotation changed while you were working on it. Refresh and try again.", 409);

    await tx.outreachActivity.create({
      data: {
        contactId: quotation.contactId,
        type: activity.type,
        occurredAt: now,
        title: activity.title,
        quotationId: id,
        createdByAdminUserId: actor.id,
        createdByAdminNameSnapshot: actor.name,
        createdByAdminEmailSnapshot: actor.email,
      },
    });
    return tx.b2bQuotation.findUnique({ where: { id } });
  });
}

export interface QuotationSendDependencies {
  isDeliveryEnabled: () => boolean;
  deliver: typeof deliverRenderedEmail;
}

export const defaultQuotationSendDependencies: QuotationSendDependencies = {
  // "console" and "disabled" both return normally from deliverRenderedEmail
  // without sending anything, so only a real provider counts as delivery.
  isDeliveryEnabled: () => env.emailEnabled && env.emailProvider === "brevo",
  deliver: deliverRenderedEmail,
};

export async function sendQuotation(
  id: string,
  raw: Record<string, unknown>,
  actor: AdminActor,
  deps: QuotationSendDependencies = defaultQuotationSendDependencies,
  now: Date = new Date()
) {
  const quotation = await prisma.b2bQuotation.findUnique({
    where: { id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!quotation) throw new QuotationRuleError("Quotation not found.", 404);
  if (quotation.status !== "DRAFT") {
    throw new QuotationRuleError("Only a draft quotation can be sent. Duplicate it to send a revised version.", 409);
  }

  const contact = await prisma.outreachContact.findUnique({
    where: { id: quotation.contactId },
    select: { id: true, email: true, status: true, organisationName: true, contactName: true },
  });
  if (!contact) throw new QuotationRuleError("Contact not found.", 404);

  // Marketing suppression stays authoritative. A quotation is only sent to
  // a contact who is currently eligible for email; anyone else is refused
  // and nothing about their status changes.
  if (contact.status !== "ACTIVE") {
    throw new QuotationRuleError(
      `This contact's email status is ${contact.status}, so the quotation was not sent. Their email eligibility has not been changed.`,
      409
    );
  }

  if (typeof raw.confirmRecipientEmail !== "string" || raw.confirmRecipientEmail.trim() === "") {
    throw new QuotationRuleError("Type the recipient email address to confirm before sending.");
  }
  let confirmed: string;
  try {
    confirmed = normalizeOutreachEmail(raw.confirmRecipientEmail);
  } catch (error) {
    throw new QuotationRuleError(error instanceof OutreachContactError ? error.message : "Type the recipient email address to confirm before sending.");
  }
  if (confirmed !== normalizeOutreachEmail(contact.email)) {
    throw new QuotationRuleError("The recipient address does not match this contact, so nothing was sent.", 409);
  }

  if (!deps.isDeliveryEnabled()) {
    throw new QuotationRuleError("Email delivery is switched off in this environment, so nothing was sent. The quotation is still a draft.", 503);
  }

  const email = buildQuotationEmail({
    quotationNumber: quotation.quotationNumber,
    organisationName: quotation.organisationNameSnapshot,
    contactName: quotation.contactNameSnapshot,
    validUntilLabel: new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "long" }).format(quotation.validUntil),
    lines: quotation.lines.map((line) => ({
      description: line.descriptionSnapshot,
      quantity: line.quantity,
      unitPriceCents: decimalToCents(line.unitPrice),
      lineTotalCents: decimalToCents(line.lineTotal),
    })),
    subtotalCents: decimalToCents(quotation.subtotal),
    discountCents: decimalToCents(quotation.discountAmount),
    deliveryCents: decimalToCents(quotation.deliveryAmount),
    totalCents: decimalToCents(quotation.total),
    notes: quotation.notes,
  });

  try {
    await deps.deliver({
      templateName: "b2b-quotation",
      recipientRole: "contact",
      recipientEmail: contact.email,
      recipientName: contact.contactName ?? contact.organisationName ?? undefined,
      reference: `quotation:${quotation.quotationNumber}`,
      rendered: email,
    });
  } catch (error) {
    // The provider failure is logged by email.service.ts without the
    // address or body. Nothing has been recorded as sent.
    console.warn(`[b2bQuotation] send failed for ${quotation.quotationNumber}; quotation left as DRAFT and no activity recorded.`);
    throw new QuotationRuleError("The email could not be sent, so the quotation was not marked as sent. Try again.", 502);
  }

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.b2bQuotation.updateMany({
      where: { id, status: "DRAFT" },
      data: { status: "SENT", sentAt: now },
    });
    if (claimed.count !== 1) {
      console.warn(`[b2bQuotation] ${quotation.quotationNumber} was emailed but its status changed concurrently; check the timeline before resending.`);
      throw new QuotationRuleError("The quotation changed while it was being sent. Check its status before doing anything else.", 409);
    }

    await tx.outreachActivity.create({
      data: {
        contactId: quotation.contactId,
        type: "QUOTE_SENT",
        channel: "EMAIL",
        occurredAt: now,
        title: `Quotation ${quotation.quotationNumber} sent by email`,
        details: `Total ${formatRand(decimalToCents(quotation.total))}, sent to the contact's email address.`,
        quotationId: id,
        createdByAdminUserId: actor.id,
        createdByAdminNameSnapshot: actor.name,
        createdByAdminEmailSnapshot: actor.email,
      },
    });

    const contactRow = await tx.outreachContact.findUnique({ where: { id: quotation.contactId }, select: { lastContactedAt: true } });
    if (!contactRow?.lastContactedAt || contactRow.lastContactedAt.getTime() < now.getTime()) {
      await tx.outreachContact.update({ where: { id: quotation.contactId }, data: { lastContactedAt: now } });
    }

    return tx.b2bQuotation.findUnique({ where: { id } });
  });
}

export async function getQuotation(id: string) {
  const quotation = await prisma.b2bQuotation.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { position: "asc" } },
      contact: { select: { id: true, organisationName: true, email: true, status: true, leadStatus: true } },
    },
  });
  if (!quotation) throw new QuotationRuleError("Quotation not found.", 404);
  return quotation;
}

export interface QuotationListFilters {
  status?: QuotationStatus;
  contactId?: string;
  search?: string;
  page: number;
  limit: number;
}

export async function listQuotations(filters: QuotationListFilters) {
  const where: Prisma.B2bQuotationWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.contactId ? { contactId: filters.contactId } : {}),
    ...(filters.search
      ? {
          OR: [
            { quotationNumber: { contains: filters.search, mode: "insensitive" } },
            { organisationNameSnapshot: { contains: filters.search, mode: "insensitive" } },
            { emailSnapshot: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.b2bQuotation.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
      select: {
        id: true,
        quotationNumber: true,
        status: true,
        contactId: true,
        organisationNameSnapshot: true,
        contactNameSnapshot: true,
        emailSnapshot: true,
        quotationDate: true,
        validUntil: true,
        total: true,
        sentAt: true,
        createdAt: true,
      },
    }),
    prisma.b2bQuotation.count({ where }),
  ]);
  return { items, total, page: filters.page, limit: filters.limit };
}

export async function countQuotationsByStatus(): Promise<Record<QuotationStatus, number>> {
  const rows = await prisma.b2bQuotation.groupBy({ by: ["status"], _count: true });
  const counts: Record<QuotationStatus, number> = { DRAFT: 0, SENT: 0, ACCEPTED: 0, DECLINED: 0, EXPIRED: 0, CANCELLED: 0 };
  for (const row of rows) counts[row.status] = row._count;
  return counts;
}
