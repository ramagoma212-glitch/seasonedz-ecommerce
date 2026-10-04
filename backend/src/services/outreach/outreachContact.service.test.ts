// Milestone 198, Part 26 (CONTACTS): validation, case-insensitive
// duplicate detection, and suppression behaviour. Same stub() helper
// pattern coupon.service.test.ts already established for mocking
// individual Prisma model delegates in isolation, without a real
// database.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { OutreachContactStatus, OutreachLeadStatus } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import {
  createContact,
  updateContact,
  setContactStatus,
  unsubscribeContactByToken,
  OutreachContactError,
  isValidOutreachEmail,
  normalizeOutreachEmail,
  buildOutreachContactWhere,
  getFollowUpState,
  getCrmSummary,
  getContactCampaignHistory,
} from "./outreachContact.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return {
    fn,
    restore: () => {
      obj[key] = original;
    },
  };
}

function baseContactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "contact-1",
    organisationName: "Sunnyside Primary School",
    contactName: "Mrs Nkosi",
    email: "school@example.com",
    phone: null,
    organisationType: "School",
    province: "Gauteng",
    city: "Pretoria",
    website: null,
    source: "Manual research",
    sourceUrl: null,
    notes: null,
    tags: [],
    status: OutreachContactStatus.ACTIVE,
    suppressedAt: null,
    suppressedReason: null,
    leadStatus: OutreachLeadStatus.PROSPECT,
    contactRole: null,
    buyerEmail: null,
    lastContactedAt: null,
    nextFollowUpAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("normalizeOutreachEmail trims and lowercases", () => {
  assert.equal(normalizeOutreachEmail("  HELLO@Example.COM  "), "hello@example.com");
});

test("isValidOutreachEmail rejects an obviously malformed address", () => {
  assert.equal(isValidOutreachEmail("not-an-email"), false);
  assert.equal(isValidOutreachEmail("school@example.com"), true);
});

test("createContact rejects an invalid email before ever touching the database", async () => {
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => null);
  const create = stub(prisma.outreachContact, "create", async () => baseContactRow());

  await assert.rejects(() => createContact({ organisationName: "Test Org", email: "not-an-email" }), OutreachContactError);
  assert.equal(create.fn.mock.callCount(), 0);

  findUnique.restore();
  create.restore();
});

test("createContact rejects a case-insensitive duplicate — HELLO@Example.com and hello@example.com are the same contact", async () => {
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => baseContactRow({ email: "hello@example.com" }));
  const create = stub(prisma.outreachContact, "create", async () => baseContactRow());

  await assert.rejects(() => createContact({ organisationName: "Another Org", email: "HELLO@Example.com" }), (error: unknown) => {
    assert.ok(error instanceof OutreachContactError);
    assert.equal((error as OutreachContactError).statusCode, 409);
    return true;
  });
  assert.equal(create.fn.mock.callCount(), 0);

  findUnique.restore();
  create.restore();
});

test("createContact succeeds for a genuinely new, valid contact, storing the normalized email", async () => {
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => null);
  const create = stub(prisma.outreachContact, "create", async (args: { data: Record<string, unknown> }) => baseContactRow(args.data));

  const contact = await createContact({ organisationName: "New School", email: "  New.School@Example.COM  " });
  assert.equal(contact.email, "new.school@example.com");
  assert.equal(create.fn.mock.callCount(), 1);

  findUnique.restore();
  create.restore();
});

test("createContact does not require an organisation name — a bulk-import-style bare email is a valid contact on its own", async () => {
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => null);
  const create = stub(prisma.outreachContact, "create", async (args: { data: Record<string, unknown> }) => baseContactRow(args.data));

  const contact = await createContact({ email: "bare@example.com" });
  assert.equal(contact.organisationName, null);

  findUnique.restore();
  create.restore();
});

test("setContactStatus sets suppressedAt only the first time status ever leaves ACTIVE", async () => {
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => ({ id: "contact-1", suppressedAt: null }));
  const update = stub(prisma.outreachContact, "update", async (args: { data: Record<string, unknown> }) => baseContactRow(args.data));

  await setContactStatus("contact-1", OutreachContactStatus.BOUNCED, "Hard bounce");
  const firstCallData = update.fn.mock.calls[0]?.arguments[0].data;
  assert.ok(firstCallData.suppressedAt instanceof Date);

  findUnique.restore();
  update.restore();
});

test("setContactStatus does not re-set suppressedAt on a second status change — the original suppression date is preserved", async () => {
  const originalSuppressedAt = new Date("2026-01-01T00:00:00.000Z");
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => ({ id: "contact-1", suppressedAt: originalSuppressedAt }));
  const update = stub(prisma.outreachContact, "update", async (args: { data: Record<string, unknown> }) => baseContactRow(args.data));

  await setContactStatus("contact-1", OutreachContactStatus.SUPPRESSED, "Manual suppression, second time");
  const callData = update.fn.mock.calls[0]?.arguments[0].data;
  assert.equal("suppressedAt" in callData, false, "suppressedAt should not be part of the update payload once already set");

  findUnique.restore();
  update.restore();
});

test("unsubscribeContactByToken moves an ACTIVE contact to UNSUBSCRIBED", async () => {
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => baseContactRow({ status: OutreachContactStatus.ACTIVE }));
  const update = stub(prisma.outreachContact, "update", async (args: { data: Record<string, unknown> }) => baseContactRow(args.data));

  const result = await unsubscribeContactByToken("contact-1");
  assert.equal(result?.status, OutreachContactStatus.UNSUBSCRIBED);
  assert.equal(update.fn.mock.callCount(), 1);

  findUnique.restore();
  update.restore();
});

test("unsubscribeContactByToken never downgrades an already-more-severe status (e.g. a real complaint marked SUPPRESSED by an admin)", async () => {
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => baseContactRow({ status: OutreachContactStatus.SUPPRESSED }));
  const update = stub(prisma.outreachContact, "update", async () => {
    throw new Error("update should never be called — an already-suppressed contact must be left exactly as is");
  });

  const result = await unsubscribeContactByToken("contact-1");
  assert.equal(result?.status, OutreachContactStatus.SUPPRESSED);

  findUnique.restore();
  update.restore();
});

test("unsubscribeContactByToken returns null for an unknown contact id, never throws", async () => {
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => null);

  const result = await unsubscribeContactByToken("does-not-exist");
  assert.equal(result, null);

  findUnique.restore();
});

// ---------------------------------------------------------------------------
// Milestone 199: CRM fields (leadStatus/contactRole/buyerEmail/
// lastContactedAt/nextFollowUpAt) — kept completely separate from email
// eligibility (status).
// ---------------------------------------------------------------------------

test("updateContact accepts a valid leadStatus and never touches the email-eligibility status field", async () => {
  const existing = baseContactRow({ leadStatus: OutreachLeadStatus.PROSPECT, status: OutreachContactStatus.ACTIVE });
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => existing);
  const update = stub(prisma.outreachContact, "update", async (args: { data: Record<string, unknown> }) => baseContactRow(args.data));
  const transaction = stub(prisma, "$transaction", async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  const activity = stub(prisma.outreachActivity, "create", async (args: { data: Record<string, unknown> }) => args.data);

  await updateContact("contact-1", { leadStatus: "INTERESTED" }, { id: "admin-1", name: "Owner", email: "owner@example.invalid" });
  const callData = update.fn.mock.calls[0]?.arguments[0].data;
  assert.equal(callData.leadStatus, "INTERESTED");
  assert.equal("status" in callData, false, "a leadStatus update must never also write the email-eligibility status field");

  const history = activity.fn.mock.calls[0]?.arguments[0].data;
  assert.equal(history.type, "LEAD_STATUS_CHANGED");
  assert.equal(history.fromLeadStatus, "PROSPECT");
  assert.equal(history.toLeadStatus, "INTERESTED");
  assert.equal(history.createdByAdminUserId, "admin-1");
  assert.equal(transaction.fn.mock.callCount(), 1, "the status change and its history row are written together");

  findUnique.restore();
  update.restore();
  transaction.restore();
  activity.restore();
});

test("updateContact records no lead-status history when the lead status did not change", async () => {
  const existing = baseContactRow({ leadStatus: OutreachLeadStatus.INTERESTED });
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => existing);
  const update = stub(prisma.outreachContact, "update", async (args: { data: Record<string, unknown> }) => baseContactRow(args.data));
  const transaction = stub(prisma, "$transaction", async () => {
    throw new Error("must not run");
  });

  await updateContact("contact-1", { leadStatus: "INTERESTED", notes: "still interested" });
  assert.equal(update.fn.mock.callCount(), 1);
  assert.equal(transaction.fn.mock.callCount(), 0);

  findUnique.restore();
  update.restore();
  transaction.restore();
});

test("updateContact rejects an invalid leadStatus value before ever touching the database", async () => {
  const existing = baseContactRow();
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => existing);
  const update = stub(prisma.outreachContact, "update", async () => {
    throw new Error("update should never be called for an invalid leadStatus");
  });

  await assert.rejects(() => updateContact("contact-1", { leadStatus: "WON_THE_DEAL" }), OutreachContactError);

  findUnique.restore();
  update.restore();
});

test("updateContact validates buyerEmail when supplied, but never writes it into the primary campaign email field", async () => {
  const existing = baseContactRow();
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => existing);
  const update = stub(prisma.outreachContact, "update", async (args: { data: Record<string, unknown> }) => baseContactRow(args.data));

  await updateContact("contact-1", { buyerEmail: "  Buyer@Example.COM  " });
  const callData = update.fn.mock.calls[0]?.arguments[0].data;
  assert.equal(callData.buyerEmail, "buyer@example.com");
  assert.equal(callData.email, existing.email, "the primary campaign email must be unaffected by a buyerEmail update");

  findUnique.restore();
  update.restore();
});

test("updateContact rejects an invalid buyerEmail", async () => {
  const existing = baseContactRow();
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => existing);
  const update = stub(prisma.outreachContact, "update", async () => {
    throw new Error("update should never be called for an invalid buyerEmail");
  });

  await assert.rejects(() => updateContact("contact-1", { buyerEmail: "not-an-email" }), OutreachContactError);

  findUnique.restore();
  update.restore();
});

test("updateContact parses a date-only nextFollowUpAt string into a real Date", async () => {
  const existing = baseContactRow();
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => existing);
  const update = stub(prisma.outreachContact, "update", async (args: { data: Record<string, unknown> }) => baseContactRow(args.data));

  await updateContact("contact-1", { nextFollowUpAt: "2026-10-15" });
  const callData = update.fn.mock.calls[0]?.arguments[0].data;
  assert.ok(callData.nextFollowUpAt instanceof Date);

  findUnique.restore();
  update.restore();
});

test("updateContact treats an empty-string nextFollowUpAt as clearing it to null", async () => {
  const existing = baseContactRow({ nextFollowUpAt: new Date("2026-10-15") });
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => existing);
  const update = stub(prisma.outreachContact, "update", async (args: { data: Record<string, unknown> }) => baseContactRow(args.data));

  await updateContact("contact-1", { nextFollowUpAt: "" });
  const callData = update.fn.mock.calls[0]?.arguments[0].data;
  assert.equal(callData.nextFollowUpAt, null);

  findUnique.restore();
  update.restore();
});

test("updateContact leaves leadStatus/contactRole/buyerEmail/follow-up fields untouched when the field isn't part of this update at all", async () => {
  const existing = baseContactRow({ leadStatus: OutreachLeadStatus.CUSTOMER, contactRole: "Buyer", buyerEmail: "buyer@example.com" });
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => existing);
  const update = stub(prisma.outreachContact, "update", async (args: { data: Record<string, unknown> }) => baseContactRow(args.data));

  // Only touching notes — every CRM field must be preserved exactly.
  await updateContact("contact-1", { notes: "Called again, still interested." });
  const callData = update.fn.mock.calls[0]?.arguments[0].data;
  assert.equal(callData.leadStatus, OutreachLeadStatus.CUSTOMER);
  assert.equal(callData.contactRole, "Buyer");
  assert.equal(callData.buyerEmail, "buyer@example.com");

  findUnique.restore();
  update.restore();
});

test("a suppressed/unsubscribed contact's email-eligibility status cannot be changed by a leadStatus update — status is simply never part of that payload", async () => {
  const existing = baseContactRow({ status: OutreachContactStatus.SUPPRESSED, suppressedAt: new Date(), suppressedReason: "Hard complaint" });
  const findUnique = stub(prisma.outreachContact, "findUnique", async () => existing);
  // A real Prisma update() returns the full row with every column not
  // present in `data` left exactly as it already was — simulated here
  // by merging onto `existing` rather than a fresh baseContactRow(),
  // which would otherwise silently default status back to ACTIVE.
  const update = stub(prisma.outreachContact, "update", async (args: { data: Record<string, unknown> }) => ({ ...existing, ...args.data }));
  const transaction = stub(prisma, "$transaction", async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  const activity = stub(prisma.outreachActivity, "create", async (args: { data: Record<string, unknown> }) => args.data);

  const result = await updateContact("contact-1", { leadStatus: "CUSTOMER" });
  assert.equal(activity.fn.mock.callCount(), 1, "the lead change is still recorded in the timeline");
  assert.equal(transaction.fn.mock.callCount(), 1);
  // parseOutreachContactInput never reads or writes `status` at all —
  // the suppressed contact's eligibility can only ever change through
  // setContactStatus(), a completely separate function.
  assert.equal(result.status, OutreachContactStatus.SUPPRESSED);

  findUnique.restore();
  update.restore();
  transaction.restore();
  activity.restore();
});

// ---------------------------------------------------------------------------
// Milestone 199: follow-up state — timezone-safe SAST calendar-day
// boundaries, never the server's own local time or a raw UTC day.
// ---------------------------------------------------------------------------

test("getFollowUpState: null nextFollowUpAt is NONE", () => {
  assert.equal(getFollowUpState(null), "NONE");
});

test("getFollowUpState: a date clearly in the past is OVERDUE", () => {
  const now = new Date("2026-10-15T10:00:00.000Z"); // midday SAST, 15 Oct
  assert.equal(getFollowUpState(new Date("2026-10-10T10:00:00.000Z"), now), "OVERDUE");
});

test("getFollowUpState: a date clearly in the future is UPCOMING", () => {
  const now = new Date("2026-10-15T10:00:00.000Z");
  assert.equal(getFollowUpState(new Date("2026-10-20T10:00:00.000Z"), now), "UPCOMING");
});

test("getFollowUpState: 23:59 SAST on the due date is still DUE_TODAY, not OVERDUE — the exact boundary this milestone's timezone-safety requirement is about", () => {
  // 2026-10-15 23:59 SAST == 2026-10-15 21:59 UTC (SAST = UTC+2).
  const now = new Date("2026-10-15T12:00:00.000Z"); // midday SAST, 15 Oct
  const nextFollowUpAt = new Date("2026-10-15T21:59:00.000Z");
  assert.equal(getFollowUpState(nextFollowUpAt, now), "DUE_TODAY");
});

test("getFollowUpState: 00:00 SAST on the due date is DUE_TODAY, not OVERDUE — one minute after SAST midnight", () => {
  // 2026-10-15 00:01 SAST == 2026-10-14 22:01 UTC.
  const now = new Date("2026-10-15T12:00:00.000Z");
  const nextFollowUpAt = new Date("2026-10-14T22:01:00.000Z");
  assert.equal(getFollowUpState(nextFollowUpAt, now), "DUE_TODAY");
});

test("getFollowUpState: one minute before SAST midnight on the due date is still OVERDUE (it was due yesterday in SAST)", () => {
  // 2026-10-14 23:59 SAST == 2026-10-14 21:59 UTC — the day before `now`.
  const now = new Date("2026-10-15T12:00:00.000Z");
  const nextFollowUpAt = new Date("2026-10-14T21:59:00.000Z");
  assert.equal(getFollowUpState(nextFollowUpAt, now), "OVERDUE");
});

test("getFollowUpState: exactly now is DUE_TODAY", () => {
  const now = new Date("2026-10-15T12:00:00.000Z");
  assert.equal(getFollowUpState(now, now), "DUE_TODAY");
});

// ---------------------------------------------------------------------------
// Milestone 199: list filters — leadStatus and followUpState.
// ---------------------------------------------------------------------------

test("buildOutreachContactWhere applies a leadStatus filter", () => {
  const where = buildOutreachContactWhere({ leadStatus: OutreachLeadStatus.INTERESTED });
  assert.equal(where.leadStatus, OutreachLeadStatus.INTERESTED);
});

test("buildOutreachContactWhere applies a followUpState filter as a real nextFollowUpAt range, never a separate stored field", () => {
  const where = buildOutreachContactWhere({ followUpState: "OVERDUE" });
  assert.ok(where.nextFollowUpAt && typeof where.nextFollowUpAt === "object" && "lt" in (where.nextFollowUpAt as object));
});

test("buildOutreachContactWhere's followUpState filter never touches or overrides the status (email eligibility) filter", () => {
  const where = buildOutreachContactWhere({ status: OutreachContactStatus.ACTIVE, followUpState: "DUE_TODAY" });
  assert.equal(where.status, OutreachContactStatus.ACTIVE);
  assert.ok(where.nextFollowUpAt);
});

// ---------------------------------------------------------------------------
// Milestone 199: CRM summary — real counts only, never an invented rate.
// ---------------------------------------------------------------------------

test("getCrmSummary returns a real zero-filled count for every lead status, even ones with no contacts at all", async () => {
  const groupBy = stub(prisma.outreachContact, "groupBy", async () => [{ leadStatus: OutreachLeadStatus.PROSPECT, _count: 5 }]);
  const count = stub(prisma.outreachContact, "count", async () => 0);

  const summary = await getCrmSummary();
  assert.equal(summary.byLeadStatus.PROSPECT, 5);
  assert.equal(summary.byLeadStatus.CUSTOMER, 0);
  assert.equal(summary.byLeadStatus.REPEAT_CUSTOMER, 0);
  assert.equal(summary.dueToday, 0);
  assert.equal(summary.overdue, 0);

  groupBy.restore();
  count.restore();
});

// ---------------------------------------------------------------------------
// Milestone 199: contact campaign history — read from the existing
// OutreachCampaignRecipient relation, SENT never relabelled.
// ---------------------------------------------------------------------------

test("getContactCampaignHistory reports SENT exactly as that word, never relabelled 'Delivered'", async () => {
  const findMany = stub(prisma.outreachCampaignRecipient, "findMany", async () => [
    {
      campaign: { id: "camp-1", name: "Seasonedz ABC School Introductions", subject: "Hello from Seasonedz" },
      status: "SENT",
      sentAt: new Date("2026-09-30T18:15:04.000Z"),
      failureReason: null,
    },
  ]);

  const history = await getContactCampaignHistory("contact-1");
  assert.equal(history.length, 1);
  assert.equal(history[0]?.status, "SENT");

  findMany.restore();
});
