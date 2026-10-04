// Milestone 201: CRM activity service. Prisma is stubbed; nothing here sends
// email or touches a real row. Key invariants proven below: every CRM action
// leaves OutreachContact.status (email eligibility) untouched, customer links
// need an exact email match, and only real outbound contact moves
// lastContactedAt forward.
import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../config/prisma.js";
import {
  completeFollowUp,
  findMatchingOrdersForContact,
  linkOrder,
  markCustomer,
  markRepeatCustomer,
  recordCatalogueSent,
  recordManualActivity,
  setFollowUp,
} from "./crmActivity.service.js";
import { OutreachContactError } from "./outreachContact.service.js";

const ACTOR = { id: "admin-1", name: "Owner", email: "owner@seasonedz.test" };
const NOW = new Date("2026-10-04T10:00:00.000Z");

const restores: Array<() => void> = [];
afterEach(() => {
  while (restores.length) restores.pop()!();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  restores.push(() => {
    obj[key] = original;
  });
  return fn;
}

function contactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "contact-1",
    email: "office@sunnyside.test",
    buyerEmail: null,
    status: "ACTIVE",
    leadStatus: "CONTACTED",
    lastContactedAt: null,
    lastCatalogueSentAt: null,
    nextFollowUpAt: null,
    nextAction: null,
    ...overrides,
  };
}

function stubTransaction() {
  stub(prisma, "$transaction", async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
}

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNumber: "SG-100001",
    createdAt: new Date("2026-09-20T09:00:00.000Z"),
    status: "DELIVERED",
    total: { toString: () => "1200.00" },
    ...overrides,
  };
}

// Every test that touches a contact checks that no write ever carried a
// `status` key: that would be an email-eligibility change in disguise.
function assertNoStatusWrite(updateFn: { mock: { calls: Array<{ arguments: unknown[] }> } }) {
  for (const call of updateFn.mock.calls) {
    const data = (call.arguments[0] as { data?: Record<string, unknown> }).data ?? {};
    assert.ok(!("status" in data), "email eligibility (OutreachContact.status) must never change in a CRM action");
  }
}

async function expectContactError(promise: Promise<unknown>, pattern: RegExp, statusCode?: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof OutreachContactError, `expected OutreachContactError, got ${String(error)}`);
    assert.match(error.message, pattern);
    if (statusCode !== undefined) assert.equal(error.statusCode, statusCode);
    return true;
  });
}

// --- activities and reply recording ------------------------------------------

test("recording a reply stores it but never counts as us contacting the lead", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => contactRow({ lastContactedAt: new Date("2026-09-01T09:00:00Z") }));
  const activity = stub(prisma.outreachActivity, "create", async (args: { data: Record<string, unknown> }) => ({ id: "act-1", ...args.data }));
  const contactUpdate = stub(prisma.outreachContact, "update", async () => ({}));

  await recordManualActivity(
    "contact-1",
    { type: "REPLY_RECEIVED", channel: "EMAIL", title: "Wants a catalogue", occurredAt: "2026-10-03T08:00:00Z" },
    ACTOR,
    NOW
  );

  assert.equal(activity.mock.calls[0]!.arguments[0]!.data.type, "REPLY_RECEIVED");
  assert.equal(activity.mock.calls[0]!.arguments[0]!.data.createdByAdminUserId, ACTOR.id);
  assert.equal(contactUpdate.mock.callCount(), 0, "a reply must not move lastContactedAt");
});

test("an outbound call moves lastContactedAt forward, but never backwards", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => contactRow({ lastContactedAt: new Date("2026-10-02T09:00:00Z") }));
  stub(prisma.outreachActivity, "create", async (args: { data: Record<string, unknown> }) => ({ id: "act-1", ...args.data }));
  const contactUpdate = stub(prisma.outreachContact, "update", async () => ({}));

  await recordManualActivity("contact-1", { type: "PHONE_CALL", occurredAt: "2026-09-30T09:00:00Z" }, ACTOR, NOW);
  assert.equal(contactUpdate.mock.callCount(), 0, "an older call never rewinds lastContactedAt");

  await recordManualActivity("contact-1", { type: "PHONE_CALL", occurredAt: "2026-10-03T09:00:00Z" }, ACTOR, NOW);
  assert.equal((contactUpdate.mock.calls[0]!.arguments[0]!.data.lastContactedAt as Date).toISOString(), "2026-10-03T09:00:00.000Z");
  assertNoStatusWrite(contactUpdate);
});

test("system-owned activity types cannot be injected through the manual endpoint", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => contactRow());
  const activity = stub(prisma.outreachActivity, "create", async () => ({ id: "act-1" }));
  await expectContactError(recordManualActivity("contact-1", { type: "QUOTE_SENT", title: "forged" }, ACTOR, NOW), /cannot be recorded by hand/);
  assert.equal(activity.mock.callCount(), 0);
});

test("recording against a contact that does not exist returns a 404 and writes nothing", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => null);
  const activity = stub(prisma.outreachActivity, "create", async () => ({ id: "act-1" }));
  await expectContactError(recordManualActivity("missing", { type: "NOTE", title: "x" }, ACTOR, NOW), /not found/, 404);
  assert.equal(activity.mock.callCount(), 0);
});

// --- next action and follow-up -------------------------------------------------

test("setting a follow-up stores the date and the next action without touching eligibility", async () => {
  stub(prisma.outreachContact, "findUnique", async () => contactRow());
  const update = stub(prisma.outreachContact, "update", async () => ({}));
  await setFollowUp("contact-1", { nextFollowUpAt: "2026-10-07", nextAction: "Call principal" });
  const data = update.mock.calls[0]!.arguments[0]!.data as Record<string, unknown>;
  assert.equal((data.nextFollowUpAt as Date).toISOString(), "2026-10-07T00:00:00.000Z");
  assert.equal(data.nextAction, "Call principal");
  assertNoStatusWrite(update);
});

test("clearing the follow-up also clears the action it belonged to", async () => {
  stub(prisma.outreachContact, "findUnique", async () => contactRow());
  const update = stub(prisma.outreachContact, "update", async () => ({}));
  await setFollowUp("contact-1", { nextFollowUpAt: null });
  assert.deepEqual(update.mock.calls[0]!.arguments[0]!.data, { nextFollowUpAt: null, nextAction: null });
});

test("rescheduling leaves the existing next action alone unless one is supplied", async () => {
  stub(prisma.outreachContact, "findUnique", async () => contactRow());
  const update = stub(prisma.outreachContact, "update", async () => ({}));
  await setFollowUp("contact-1", { nextFollowUpAt: "2026-10-10" });
  assert.ok(!("nextAction" in (update.mock.calls[0]!.arguments[0]!.data as object)));
});

test("completing a follow-up records FOLLOW_UP and sets the next step atomically", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => contactRow());
  const activity = stub(prisma.outreachActivity, "create", async (args: { data: Record<string, unknown> }) => ({ id: "act-1", ...args.data }));
  const update = stub(prisma.outreachContact, "update", async () => ({}));

  await completeFollowUp("contact-1", { notes: "Principal will decide Friday", nextFollowUpAt: "2026-10-09", nextAction: "Send quote" }, ACTOR, NOW);

  assert.equal(activity.mock.calls[0]!.arguments[0]!.data.type, "FOLLOW_UP");
  assert.equal(activity.mock.calls[0]!.arguments[0]!.data.details, "Principal will decide Friday");
  const data = update.mock.calls[0]!.arguments[0]!.data as Record<string, unknown>;
  assert.equal(data.nextAction, "Send quote");
  assert.equal((data.lastContactedAt as Date).getTime(), NOW.getTime());
  assertNoStatusWrite(update);
});

test("completing a follow-up with nothing scheduled clears the old follow-up", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => contactRow({ nextFollowUpAt: new Date("2026-10-01T00:00:00Z"), nextAction: "Old" }));
  stub(prisma.outreachActivity, "create", async () => ({ id: "act-1" }));
  const update = stub(prisma.outreachContact, "update", async () => ({}));
  await completeFollowUp("contact-1", {}, ACTOR, NOW);
  const data = update.mock.calls[0]!.arguments[0]!.data as Record<string, unknown>;
  assert.equal(data.nextFollowUpAt, null);
  assert.equal(data.nextAction, null);
});

// --- catalogue tracking ----------------------------------------------------------

test("recording a catalogue send tracks its date without changing the lead status", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => contactRow({ lastCatalogueSentAt: new Date("2026-09-10T09:00:00Z") }));
  const activity = stub(prisma.outreachActivity, "create", async (args: { data: Record<string, unknown> }) => ({ id: "act-1", ...args.data }));
  const update = stub(prisma.outreachContact, "update", async () => ({}));

  await recordCatalogueSent("contact-1", { channel: "WHATSAPP", occurredAt: "2026-10-03T09:00:00Z" }, ACTOR, NOW);

  assert.equal(activity.mock.calls[0]!.arguments[0]!.data.type, "CATALOGUE_SENT");
  const data = update.mock.calls[0]!.arguments[0]!.data as Record<string, unknown>;
  assert.equal((data.lastCatalogueSentAt as Date).toISOString(), "2026-10-03T09:00:00.000Z");
  assert.ok(!("leadStatus" in data), "the lead status is offered in the UI, never applied automatically");
  assertNoStatusWrite(update);
});

// --- order and customer linking ------------------------------------------------

test("matching orders are found by exact email, ignoring letter case, never by name", async () => {
  const findMany = stub(prisma.order, "findMany", async () => [orderRow()]);
  const orders = await findMatchingOrdersForContact({ email: "Office@Sunnyside.test", buyerEmail: null });
  const where = findMany.mock.calls[0]!.arguments[0]!.where as { OR: Array<{ customerEmail: { equals: string; mode: string } }>; status: unknown };
  assert.deepEqual(where.OR, [{ customerEmail: { equals: "Office@Sunnyside.test", mode: "insensitive" } }]);
  assert.deepEqual(where.status, { not: "CANCELLED" }, "cancelled orders are never evidence of a customer");
  assert.equal(orders[0]!.total, "1200.00");
});

test("a buyer email on the contact also counts as an exact match", async () => {
  const findMany = stub(prisma.order, "findMany", async () => []);
  await findMatchingOrdersForContact({ email: "office@sunnyside.test", buyerEmail: "buyer@sunnyside.test" });
  const where = findMany.mock.calls[0]!.arguments[0]!.where as { OR: unknown[] };
  assert.equal(where.OR.length, 2);
});

test("an order whose email does not match is refused as a link", async () => {
  stub(prisma.outreachContact, "findUnique", async () => contactRow());
  stub(prisma.order, "findMany", async () => [orderRow({ id: "order-1" })]);
  const activity = stub(prisma.outreachActivity, "create", async () => ({ id: "act-1" }));
  await expectContactError(linkOrder("contact-1", "order-99", ACTOR), /does not have this contact's email/, 409);
  assert.equal(activity.mock.callCount(), 0);
});

test("the same order cannot be linked twice", async () => {
  stub(prisma.outreachContact, "findUnique", async () => contactRow());
  stub(prisma.order, "findMany", async () => [orderRow()]);
  stub(prisma.outreachActivity, "findFirst", async () => ({ id: "existing" }));
  const create = stub(prisma.outreachActivity, "create", async () => ({ id: "act-1" }));
  await expectContactError(linkOrder("contact-1", "order-1", ACTOR), /already linked/, 409);
  assert.equal(create.mock.callCount(), 0);
});

test("linking an order records ORDER_CREATED at the order's own date and changes no lead status", async () => {
  stub(prisma.outreachContact, "findUnique", async () => contactRow({ leadStatus: "NEGOTIATING" }));
  stub(prisma.order, "findMany", async () => [orderRow()]);
  stub(prisma.outreachActivity, "findFirst", async () => null);
  const create = stub(prisma.outreachActivity, "create", async (args: { data: Record<string, unknown> }) => ({ id: "act-1", ...args.data }));
  const contactUpdate = stub(prisma.outreachContact, "update", async () => ({}));

  await linkOrder("contact-1", "order-1", ACTOR);

  const data = create.mock.calls[0]!.arguments[0]!.data as Record<string, unknown>;
  assert.equal(data.type, "ORDER_CREATED");
  assert.equal(data.orderId, "order-1");
  assert.equal((data.occurredAt as Date).toISOString(), "2026-09-20T09:00:00.000Z");
  assert.equal(contactUpdate.mock.callCount(), 0);
});

test("marking a customer needs a matching order, then sets CUSTOMER and records the link", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => contactRow({ leadStatus: "QUOTE_REQUESTED" }));
  stub(prisma.order, "findMany", async () => [orderRow()]);
  const update = stub(prisma.outreachContact, "update", async () => ({}));
  const activity = stub(prisma.outreachActivity, "create", async (args: { data: Record<string, unknown> }) => ({ id: "act-1", ...args.data }));

  await markCustomer("contact-1", "order-1", ACTOR, NOW);

  assert.equal(update.mock.calls[0]!.arguments[0]!.data.leadStatus, "CUSTOMER");
  assert.equal(activity.mock.calls[0]!.arguments[0]!.data.type, "CUSTOMER_CONVERTED");
  assertNoStatusWrite(update);
});

test("an accepted quote alone is never enough to mark a customer: no matching order means refusal", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => contactRow({ leadStatus: "NEGOTIATING" }));
  stub(prisma.order, "findMany", async () => []);
  const update = stub(prisma.outreachContact, "update", async () => ({}));
  await expectContactError(markCustomer("contact-1", "order-1", ACTOR, NOW), /no order with the same email/, 409);
  assert.equal(update.mock.callCount(), 0);
});

test("repeat customer needs an existing customer and two orders", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => contactRow({ leadStatus: "CUSTOMER" }));
  stub(prisma.order, "findMany", async () => [orderRow({ id: "a" }), orderRow({ id: "b" })]);
  const update = stub(prisma.outreachContact, "update", async () => ({}));
  stub(prisma.outreachActivity, "create", async (args: { data: Record<string, unknown> }) => ({ id: "act-1", ...args.data }));

  await markRepeatCustomer("contact-1", ACTOR, NOW);
  assert.equal(update.mock.calls[0]!.arguments[0]!.data.leadStatus, "REPEAT_CUSTOMER");
  assertNoStatusWrite(update);
});

test("a single-order customer cannot be promoted to repeat customer", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => contactRow({ leadStatus: "CUSTOMER" }));
  stub(prisma.order, "findMany", async () => [orderRow()]);
  const update = stub(prisma.outreachContact, "update", async () => ({}));
  await expectContactError(markRepeatCustomer("contact-1", ACTOR, NOW), /at least two orders/, 409);
  assert.equal(update.mock.callCount(), 0);
});

test("a prospect with two matching orders is still not a repeat customer until they are a customer", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => contactRow({ leadStatus: "INTERESTED" }));
  stub(prisma.order, "findMany", async () => [orderRow({ id: "a" }), orderRow({ id: "b" })]);
  await expectContactError(markRepeatCustomer("contact-1", ACTOR, NOW), /Only a customer/, 409);
});
