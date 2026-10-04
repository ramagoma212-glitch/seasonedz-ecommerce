// Milestone 201: pure CRM activity rules. Which activity types an admin
// may record by hand, how manual input is validated, when a lead may be
// promoted to customer, and how the timeline is ordered. No database
// access here; the service layer owns persistence.

import type { OutreachActivityChannel, OutreachActivityType, OutreachLeadStatus } from "@prisma/client";
import { OutreachContactError } from "./outreachContact.service.js";

export const MANUAL_ACTIVITY_TYPES = ["NOTE", "REPLY_RECEIVED", "PHONE_CALL", "WHATSAPP", "EMAIL"] as const;
export type ManualActivityType = (typeof MANUAL_ACTIVITY_TYPES)[number];

export const REPLY_CHANNELS: OutreachActivityChannel[] = ["EMAIL", "PHONE", "WHATSAPP", "OTHER"];
export const CATALOGUE_CHANNELS: OutreachActivityChannel[] = ["EMAIL", "WHATSAPP", "OTHER"];

// Activities whose occurredAt moves lastContactedAt forward. A reply is
// deliberately excluded: it is the contact talking to us, not us reaching
// out, so it must not reset "days since we last made contact".
export const OUTBOUND_ACTIVITY_TYPES: ReadonlySet<OutreachActivityType> = new Set<OutreachActivityType>([
  "PHONE_CALL",
  "WHATSAPP",
  "EMAIL",
  "CATALOGUE_SENT",
  "QUOTE_SENT",
  "FOLLOW_UP",
]);

const MAX_TITLE_LENGTH = 150;
const MAX_DETAILS_LENGTH = 5000;
const MAX_NEXT_ACTION_LENGTH = 200;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const DEFAULT_TITLES: Record<ManualActivityType, string> = {
  NOTE: "Note",
  REPLY_RECEIVED: "",
  PHONE_CALL: "Phone call",
  WHATSAPP: "WhatsApp message",
  EMAIL: "Email",
};

const FIXED_CHANNEL: Partial<Record<ManualActivityType, OutreachActivityChannel>> = {
  PHONE_CALL: "PHONE",
  WHATSAPP: "WHATSAPP",
  EMAIL: "EMAIL",
};

export interface ManualActivityInput {
  type: ManualActivityType;
  channel: OutreachActivityChannel | null;
  occurredAt: Date;
  title: string;
  details: string | null;
}

function cleanText(raw: unknown, maxLength: number, fieldLabel: string, required: boolean): string | null {
  if (raw === undefined || raw === null) {
    if (required) throw new OutreachContactError(`${fieldLabel} is required.`);
    return null;
  }
  if (typeof raw !== "string") throw new OutreachContactError(`${fieldLabel} must be text.`);
  const trimmed = raw.trim();
  if (trimmed === "") {
    if (required) throw new OutreachContactError(`${fieldLabel} is required.`);
    return null;
  }
  if (trimmed.length > maxLength) throw new OutreachContactError(`${fieldLabel} must be ${maxLength} characters or fewer.`);
  return trimmed;
}

export function parseOccurredAt(raw: unknown, now: Date): Date {
  if (raw === undefined || raw === null || raw === "") return now;
  if (typeof raw !== "string" && !(raw instanceof Date)) throw new OutreachContactError("Date and time is not valid.");
  const date = new Date(raw as string | Date);
  if (Number.isNaN(date.getTime())) throw new OutreachContactError("Date and time is not valid.");
  if (date.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    throw new OutreachContactError("You cannot record something that has not happened yet.");
  }
  return date;
}

export function parseManualActivityInput(raw: Record<string, unknown>, now: Date = new Date()): ManualActivityInput {
  const type = raw.type;
  if (typeof type !== "string" || !(MANUAL_ACTIVITY_TYPES as readonly string[]).includes(type)) {
    throw new OutreachContactError("That activity type cannot be recorded by hand.");
  }
  const manualType = type as ManualActivityType;

  let channel: OutreachActivityChannel | null = FIXED_CHANNEL[manualType] ?? null;
  if (manualType === "REPLY_RECEIVED") {
    if (typeof raw.channel !== "string" || !REPLY_CHANNELS.includes(raw.channel as OutreachActivityChannel)) {
      throw new OutreachContactError("Choose how the reply arrived: email, phone, WhatsApp or other.");
    }
    channel = raw.channel as OutreachActivityChannel;
  }

  const title = cleanText(raw.title, MAX_TITLE_LENGTH, "Title", false) ?? DEFAULT_TITLES[manualType];
  if (title === "") throw new OutreachContactError("A reply needs a short summary.");

  return {
    type: manualType,
    channel,
    occurredAt: parseOccurredAt(raw.occurredAt, now),
    title,
    details: cleanText(raw.details ?? raw.notes, MAX_DETAILS_LENGTH, "Details", false),
  };
}

export interface CatalogueSentInput {
  channel: OutreachActivityChannel;
  occurredAt: Date;
  details: string | null;
}

export function parseCatalogueSentInput(raw: Record<string, unknown>, now: Date = new Date()): CatalogueSentInput {
  if (typeof raw.channel !== "string" || !CATALOGUE_CHANNELS.includes(raw.channel as OutreachActivityChannel)) {
    throw new OutreachContactError("Choose how the catalogue was sent: email, WhatsApp or other.");
  }
  return {
    channel: raw.channel as OutreachActivityChannel,
    occurredAt: parseOccurredAt(raw.occurredAt, now),
    details: cleanText(raw.details ?? raw.notes, MAX_DETAILS_LENGTH, "Details", false),
  };
}

export interface FollowUpInput {
  // undefined = leave the existing value alone; null = clear it.
  nextFollowUpAt: Date | null | undefined;
  nextAction: string | null | undefined;
}

export function parseFollowUpInput(raw: Record<string, unknown>): FollowUpInput {
  let nextFollowUpAt: Date | null | undefined;
  if (raw.nextFollowUpAt === undefined) {
    nextFollowUpAt = undefined;
  } else if (raw.nextFollowUpAt === null || raw.nextFollowUpAt === "") {
    nextFollowUpAt = null;
  } else {
    const date = new Date(raw.nextFollowUpAt as string);
    if (typeof raw.nextFollowUpAt !== "string" || Number.isNaN(date.getTime())) {
      throw new OutreachContactError("Follow-up date is not valid.");
    }
    nextFollowUpAt = date;
  }

  let nextAction: string | null | undefined;
  if (raw.nextAction === undefined) {
    nextAction = undefined;
  } else {
    nextAction = cleanText(raw.nextAction, MAX_NEXT_ACTION_LENGTH, "Next action", false);
  }

  return { nextFollowUpAt, nextAction };
}

export function canRecordCustomerOrderLink(matchingOrderIds: readonly string[], orderId: string): boolean {
  return matchingOrderIds.includes(orderId);
}

// Customer status means a genuine order relationship. An accepted quote on
// its own never reaches this function — see b2bQuotation.service.ts.
export function assertCanMarkCustomer(matchingOrderCount: number): void {
  if (matchingOrderCount < 1) {
    throw new OutreachContactError("This contact has no order with the same email address. Link an order before marking them as a customer.", 409);
  }
}

export function assertCanMarkRepeatCustomer(current: OutreachLeadStatus, matchingOrderCount: number): void {
  if (current !== "CUSTOMER" && current !== "REPEAT_CUSTOMER") {
    throw new OutreachContactError("Only a customer can be marked as a repeat customer.", 409);
  }
  if (matchingOrderCount < 2) {
    throw new OutreachContactError("A repeat customer needs at least two orders with the same email address.", 409);
  }
}

export interface TimelineEntry {
  occurredAt: Date;
  id: string;
}

// Newest first. Ties broken by id so the order is stable across requests.
export function sortTimelineNewestFirst<T extends TimelineEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    const diff = b.occurredAt.getTime() - a.occurredAt.getTime();
    if (diff !== 0) return diff;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}
