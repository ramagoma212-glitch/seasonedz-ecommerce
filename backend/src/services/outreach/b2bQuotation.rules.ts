// Milestone 201: pure quotation rules — totals, numbering, status
// transitions, and the plain-text email body. No database access here, so
// every rule is unit-tested directly.

import type { QuotationStatus } from "@prisma/client";
import { assertCentsIsSafeInteger, formatRand, MoneyError } from "../../utils/quotationMoney.js";
import { buildB2bSignature } from "./b2bSignature.js";

export class QuotationRuleError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "QuotationRuleError";
    this.statusCode = statusCode;
  }
}

export const MAX_QUOTATION_LINES = 15;
export const MAX_QUOTATION_QUANTITY = 100_000;

export interface QuotationLineCalcInput {
  unitPriceCents: number;
  quantity: number;
}

export interface QuotationTotals {
  lineTotalsCents: number[];
  subtotalCents: number;
  discountCents: number;
  deliveryCents: number;
  totalCents: number;
}

export function parseQuantity(raw: unknown): number {
  const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_QUOTATION_QUANTITY) {
    throw new QuotationRuleError(`Quantity must be a whole number from 1 to ${MAX_QUOTATION_QUANTITY}.`);
  }
  return value;
}

function safeCents(value: number, fieldLabel: string): number {
  try {
    assertCentsIsSafeInteger(value, fieldLabel);
  } catch (error) {
    throw new QuotationRuleError(error instanceof MoneyError ? error.message : "Invalid amount.");
  }
  return value;
}

export function computeQuotationTotals(
  lines: QuotationLineCalcInput[],
  discountCents: number,
  deliveryCents: number
): QuotationTotals {
  if (lines.length === 0) throw new QuotationRuleError("A quotation needs at least one line item.");
  if (lines.length > MAX_QUOTATION_LINES) throw new QuotationRuleError(`A quotation can have at most ${MAX_QUOTATION_LINES} line items.`);

  safeCents(discountCents, "Discount");
  safeCents(deliveryCents, "Delivery");

  const lineTotalsCents = lines.map((line) => {
    const lineTotal = line.unitPriceCents * line.quantity;
    safeCents(line.unitPriceCents, "Unit price");
    safeCents(lineTotal, "Line total");
    return lineTotal;
  });

  const subtotalCents = safeCents(lineTotalsCents.reduce((sum, value) => sum + value, 0), "Subtotal");

  if (discountCents > subtotalCents) {
    throw new QuotationRuleError("The discount cannot be more than the subtotal.");
  }

  const totalCents = subtotalCents - discountCents + deliveryCents;
  return { lineTotalsCents, subtotalCents, discountCents, deliveryCents, totalCents };
}

// SG-Q-2026-0001. The number is only ever produced server-side from the
// yearly counter, never accepted from a client.
export function formatQuotationNumber(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new QuotationRuleError("Invalid quotation year.");
  if (!Number.isInteger(sequence) || sequence < 1) throw new QuotationRuleError("Invalid quotation sequence.");
  return `SG-Q-${year}-${String(sequence).padStart(4, "0")}`;
}

// DRAFT -> SENDING is the only way into a send. SENDING and SEND_UNCERTAIN
// can only leave by an admin's reconciliation (or the send's own outcome),
// never by a generic status change and never by a blind resend.
const QUOTATION_STATUS_TRANSITIONS: Record<QuotationStatus, readonly QuotationStatus[]> = {
  DRAFT: ["SENDING", "CANCELLED"],
  SENDING: ["SENT", "DRAFT", "SEND_UNCERTAIN"],
  SEND_UNCERTAIN: ["SENT", "DRAFT"],
  SENT: ["ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"],
  ACCEPTED: [],
  DECLINED: [],
  EXPIRED: [],
  CANCELLED: [],
};

// Statuses in which a send is in progress or its outcome is not confirmed.
export const UNRESOLVED_SEND_STATUSES: readonly QuotationStatus[] = ["SENDING", "SEND_UNCERTAIN"];

// A failure the provider reported explicitly means the email was not accepted,
// so the quotation may return to draft. Anything else (timeout, network, or an
// unexpected error) may still have been delivered, so it stays unresolved.
export function classifySendFailure(error: unknown): "DEFINITE" | "AMBIGUOUS" {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "NOT_CONFIGURED" || code === "REJECTED" ? "DEFINITE" : "AMBIGUOUS";
}

export function canTransitionQuotation(from: QuotationStatus, to: QuotationStatus): boolean {
  return QUOTATION_STATUS_TRANSITIONS[from].includes(to);
}

export function assertQuotationTransition(from: QuotationStatus, to: QuotationStatus): void {
  if (!canTransitionQuotation(from, to)) {
    throw new QuotationRuleError(`A ${from.toLowerCase()} quotation cannot be marked ${to.toLowerCase()}.`, 409);
  }
}

// Only drafts are ever edited in place. Once a quotation has been sent,
// its figures are a record of what the customer was told.
export function assertQuotationEditable(status: QuotationStatus): void {
  if (status !== "DRAFT") {
    throw new QuotationRuleError("Only draft quotations can be edited. Duplicate this quotation to make a new version.", 409);
  }
}

export interface QuotationEmailInput {
  quotationNumber: string;
  organisationName: string;
  contactName: string | null;
  validUntilLabel: string;
  lines: { description: string; quantity: number; unitPriceCents: number; lineTotalCents: number }[];
  subtotalCents: number;
  discountCents: number;
  deliveryCents: number;
  totalCents: number;
  notes: string | null;
}

export function buildQuotationEmail(input: QuotationEmailInput): { subject: string; body: string } {
  const subject = `Quotation ${input.quotationNumber} from Seasonedz Group`;
  const greeting = input.contactName ? `Dear ${input.contactName}` : `Dear ${input.organisationName}`;
  const lineText = input.lines.map(
    (line) => `- ${line.description}: ${line.quantity} x ${formatRand(line.unitPriceCents)} = ${formatRand(line.lineTotalCents)}`
  );

  const body = [
    greeting,
    "",
    `Thank you for your interest in Seasonedz Group. Please find our quotation ${input.quotationNumber} below.`,
    "",
    ...lineText,
    "",
    `Subtotal: ${formatRand(input.subtotalCents)}`,
    ...(input.discountCents > 0 ? [`Discount: -${formatRand(input.discountCents)}`] : []),
    ...(input.deliveryCents > 0 ? [`Delivery: ${formatRand(input.deliveryCents)}`] : []),
    `Total: ${formatRand(input.totalCents)}`,
    "",
    `This quotation is valid until ${input.validUntilLabel}.`,
    ...(input.notes ? ["", input.notes] : []),
    "",
    "Reply to this email with any questions, or to confirm your order.",
    "",
    buildB2bSignature(),
  ];

  return { subject, body: body.join("\n") };
}
