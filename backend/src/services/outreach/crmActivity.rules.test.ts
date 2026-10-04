// Milestone 201: CRM activity rules — what an admin may record by hand,
// validation of each manual form, customer-conversion thresholds, follow-up
// input, and timeline ordering. Pure logic, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { OutreachContactError } from "./outreachContact.service.js";
import {
  assertCanMarkCustomer,
  assertCanMarkRepeatCustomer,
  canRecordCustomerOrderLink,
  OUTBOUND_ACTIVITY_TYPES,
  parseCatalogueSentInput,
  parseFollowUpInput,
  parseManualActivityInput,
  parseOccurredAt,
  sortTimelineNewestFirst,
} from "./crmActivity.rules.js";

const NOW = new Date("2026-10-04T10:00:00.000Z");

test("the manual types an admin can record are exactly the human-observed ones", () => {
  for (const type of ["NOTE", "REPLY_RECEIVED", "PHONE_CALL", "WHATSAPP", "EMAIL"]) {
    assert.doesNotThrow(() => parseManualActivityInput({ type, title: "x", channel: "EMAIL" }, NOW), type);
  }
});

test("system-owned types can never be created by hand", () => {
  for (const type of ["QUOTE_SENT", "QUOTE_ACCEPTED", "QUOTE_CREATED", "ORDER_CREATED", "CUSTOMER_CONVERTED", "CATALOGUE_SENT", "FOLLOW_UP", "LEAD_STATUS_CHANGED", "QUOTE_SEND_FAILED", "QUOTE_SEND_UNCERTAIN", "QUOTE_SEND_RECONCILED", "CAMPAIGN_SENT", "DROP TABLE"]) {
    assert.throws(() => parseManualActivityInput({ type, title: "x" }, NOW), OutreachContactError, type);
  }
});

test("a reply must say how it arrived and carry a summary", () => {
  assert.throws(() => parseManualActivityInput({ type: "REPLY_RECEIVED", title: "Wants a catalogue" }, NOW), /how the reply arrived/);
  assert.throws(() => parseManualActivityInput({ type: "REPLY_RECEIVED", channel: "FAX", title: "x" }, NOW), /how the reply arrived/);
  assert.throws(() => parseManualActivityInput({ type: "REPLY_RECEIVED", channel: "PHONE", title: "   " }, NOW), /short summary/);
});

test("a reply keeps the channel the admin chose", () => {
  const reply = parseManualActivityInput({ type: "REPLY_RECEIVED", channel: "WHATSAPP", title: "Asked for pricing" }, NOW);
  assert.equal(reply.channel, "WHATSAPP");
  assert.equal(reply.title, "Asked for pricing");
});

test("a phone call and a WhatsApp message get their fixed channel and a default title", () => {
  const call = parseManualActivityInput({ type: "PHONE_CALL" }, NOW);
  assert.equal(call.channel, "PHONE");
  assert.equal(call.title, "Phone call");
  const whatsapp = parseManualActivityInput({ type: "WHATSAPP" }, NOW);
  assert.equal(whatsapp.channel, "WHATSAPP");
  assert.equal(whatsapp.title, "WhatsApp message");
});

test("a note gets a default title and no channel", () => {
  const note = parseManualActivityInput({ type: "NOTE", details: "Principal prefers email" }, NOW);
  assert.equal(note.channel, null);
  assert.equal(note.title, "Note");
  assert.equal(note.details, "Principal prefers email");
});

test("text fields are trimmed, emptied to null, and length-limited", () => {
  const trimmed = parseManualActivityInput({ type: "NOTE", title: "  Call back  ", details: "   " }, NOW);
  assert.equal(trimmed.title, "Call back");
  assert.equal(trimmed.details, null);
  assert.throws(() => parseManualActivityInput({ type: "NOTE", title: "x".repeat(151) }, NOW), /150 characters/);
  assert.throws(() => parseManualActivityInput({ type: "NOTE", details: "x".repeat(5001) }, NOW), /5000 characters/);
  assert.throws(() => parseManualActivityInput({ type: "NOTE", title: 42 }, NOW), /must be text/);
});

test("an activity cannot be dated in the future", () => {
  assert.throws(() => parseOccurredAt("2026-10-05T10:00:00.000Z", NOW), /not happened yet/);
  assert.doesNotThrow(() => parseOccurredAt("2026-10-04T10:02:00.000Z", NOW), "a few minutes of clock drift is tolerated");
});

test("occurredAt defaults to now and rejects garbage", () => {
  assert.equal(parseOccurredAt(undefined, NOW).getTime(), NOW.getTime());
  assert.equal(parseOccurredAt("", NOW).getTime(), NOW.getTime());
  assert.throws(() => parseOccurredAt("not a date", NOW), /not valid/);
  assert.throws(() => parseOccurredAt(12345, NOW), /not valid/);
});

test("catalogue tracking needs a real channel", () => {
  assert.equal(parseCatalogueSentInput({ channel: "EMAIL" }, NOW).channel, "EMAIL");
  assert.equal(parseCatalogueSentInput({ channel: "WHATSAPP" }, NOW).channel, "WHATSAPP");
  assert.throws(() => parseCatalogueSentInput({ channel: "PHONE" }, NOW), /how the catalogue was sent/);
  assert.throws(() => parseCatalogueSentInput({}, NOW), /how the catalogue was sent/);
});

test("follow-up input distinguishes 'leave alone', 'clear' and 'set'", () => {
  const untouched = parseFollowUpInput({});
  assert.equal(untouched.nextFollowUpAt, undefined);
  assert.equal(untouched.nextAction, undefined);

  const cleared = parseFollowUpInput({ nextFollowUpAt: null, nextAction: null });
  assert.equal(cleared.nextFollowUpAt, null);
  assert.equal(cleared.nextAction, null);

  const set = parseFollowUpInput({ nextFollowUpAt: "2026-10-07", nextAction: "  Call principal  " });
  assert.equal(set.nextFollowUpAt?.toISOString(), "2026-10-07T00:00:00.000Z");
  assert.equal(set.nextAction, "Call principal");
});

test("follow-up input rejects invalid dates and oversized actions", () => {
  assert.throws(() => parseFollowUpInput({ nextFollowUpAt: "next tuesday" }), /not valid/);
  assert.throws(() => parseFollowUpInput({ nextFollowUpAt: 20261007 }), /not valid/);
  assert.throws(() => parseFollowUpInput({ nextAction: "x".repeat(201) }), /200 characters/);
});

test("a customer order link must be one of the orders matched by email", () => {
  assert.equal(canRecordCustomerOrderLink(["ord-1", "ord-2"], "ord-2"), true);
  assert.equal(canRecordCustomerOrderLink(["ord-1"], "ord-99"), false);
  assert.equal(canRecordCustomerOrderLink([], "ord-1"), false);
});

test("marking a customer requires at least one matching order", () => {
  assert.doesNotThrow(() => assertCanMarkCustomer(1));
  assert.throws(() => assertCanMarkCustomer(0), (error: unknown) => error instanceof OutreachContactError && error.statusCode === 409);
});

test("repeat customer needs an existing customer and at least two orders", () => {
  assert.doesNotThrow(() => assertCanMarkRepeatCustomer("CUSTOMER", 2));
  assert.doesNotThrow(() => assertCanMarkRepeatCustomer("REPEAT_CUSTOMER", 5));
  assert.throws(() => assertCanMarkRepeatCustomer("CUSTOMER", 1), /at least two orders/);
  assert.throws(() => assertCanMarkRepeatCustomer("NEGOTIATING", 3), /Only a customer/);
  assert.throws(() => assertCanMarkRepeatCustomer("PROSPECT", 3), /Only a customer/);
});

test("a reply never counts as us contacting the lead", () => {
  assert.equal(OUTBOUND_ACTIVITY_TYPES.has("REPLY_RECEIVED"), false);
  assert.equal(OUTBOUND_ACTIVITY_TYPES.has("NOTE"), false);
  for (const type of ["PHONE_CALL", "WHATSAPP", "EMAIL", "CATALOGUE_SENT", "QUOTE_SENT", "FOLLOW_UP"] as const) {
    assert.equal(OUTBOUND_ACTIVITY_TYPES.has(type), true, type);
  }
});

test("the timeline is newest first, with a stable order for identical timestamps", () => {
  const entries = [
    { id: "b", occurredAt: new Date("2026-10-01T09:00:00Z") },
    { id: "a", occurredAt: new Date("2026-10-03T09:00:00Z") },
    { id: "c", occurredAt: new Date("2026-10-01T09:00:00Z") },
  ];
  assert.deepEqual(
    sortTimelineNewestFirst(entries).map((entry) => entry.id),
    ["a", "c", "b"]
  );
  assert.equal(entries[0]!.id, "b", "the input array is not mutated");
});
