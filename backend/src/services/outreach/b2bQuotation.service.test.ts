// Milestone 201: B2B quotation service. Every Prisma call is stubbed. The
// quotation row is a small in-memory fake that applies conditional updates
// the way the database would, so these tests check real state sequences:
// DRAFT -> SENDING -> SENT, and each failure path. The send dependencies are
// injected, so nothing here can send email. Email eligibility is asserted to
// be untouched by every path.
import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import {
  createQuotationDraft,
  duplicateQuotation,
  parseQuotationDraftInput,
  reconcileQuotationSend,
  sendQuotation,
  transitionQuotation,
  updateQuotationDraft,
  type QuotationSendDependencies,
} from "./b2bQuotation.service.js";
import { QuotationRuleError } from "./b2bQuotation.rules.js";
import { BrevoSendError } from "../email/providers/brevo.provider.js";

const ACTOR = { id: "admin-1", name: "Owner", email: "owner@seasonedz.test" };
const NOW = new Date("2026-10-04T10:00:00.000Z");

const restores: Array<() => void> = [];
afterEach(() => {
  while (restores.length) restores.pop()!();
  store.quote = null;
  store.activities = [];
  store.contactUpdates = [];
  store.failReserve = false;
  store.failFinalPersist = false;
  store.raceFailuresLeft = 0;
  store.counter = 0;
  store.quotationNumbers = new Set();
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

const store = {
  quote: null as Record<string, any> | null,
  activities: [] as Record<string, unknown>[],
  contactUpdates: [] as Record<string, unknown>[],
  failReserve: false,
  failFinalPersist: false,
  raceFailuresLeft: 0,
  counter: 0,
  quotationNumbers: new Set<string>(),
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function activeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: "contact-1",
    email: "office@sunnyside.test",
    buyerEmail: null,
    organisationName: "Sunnyside Primary School",
    contactName: "Mrs Dlamini",
    phone: "012 000 0000",
    status: "ACTIVE",
    leadStatus: "NEGOTIATING",
    lastContactedAt: null,
    ...overrides,
  };
}

function quotationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "quote-1",
    quotationNumber: "SG-Q-2026-0001",
    contactId: "contact-1",
    status: "DRAFT",
    quotationDate: NOW,
    validUntil: new Date("2026-10-31T10:00:00.000Z"),
    organisationNameSnapshot: "Sunnyside Primary School",
    contactNameSnapshot: "Mrs Dlamini",
    emailSnapshot: "office@sunnyside.test",
    phoneSnapshot: "012 000 0000",
    billingAddress: null,
    notes: null,
    subtotal: "1000.00",
    discountAmount: "0.00",
    deliveryAmount: "0.00",
    total: "1000.00",
    sentAt: null,
    acceptedAt: null,
    declinedAt: null,
    cancelledAt: null,
    sendAttemptCount: 0,
    lastSendAttemptAt: null,
    lastSendError: null,
    lines: [
      {
        position: 1,
        productId: "prod-1",
        descriptionSnapshot: "ABC Colouring Book",
        skuSnapshot: "SG-0001",
        quantity: 10,
        unitPrice: "100.00",
        lineTotal: "1000.00",
      },
    ],
    ...overrides,
  };
}

// Installs the fake quotation row and the Prisma delegates it needs.
function installFakeDatabase(quote: Record<string, unknown> = quotationRow()) {
  store.quote = clone(quote);
  stub(prisma, "$transaction", async (fn: (tx: typeof prisma) => unknown) => {
    if (store.failFinalPersist) {
      store.failFinalPersist = false;
      throw new Error("simulated database failure during final save");
    }
    return fn(prisma);
  });

  stub(prisma.b2bQuotation, "findUnique", async () => (store.quote ? clone(store.quote) : null));

  stub(prisma.b2bQuotation, "updateMany", async (args: { where: Record<string, unknown>; data: Record<string, any> }) => {
    if (store.failReserve && args.data.status === "SENDING") {
      throw new Error("simulated database failure before send");
    }
    if (!store.quote || (args.where.id !== undefined && args.where.id !== store.quote.id)) return { count: 0 };
    if (args.where.status !== undefined && store.quote.status !== args.where.status) return { count: 0 };
    for (const [key, value] of Object.entries(args.data)) {
      if (value && typeof value === "object" && "increment" in (value as object)) {
        store.quote[key] = (Number(store.quote[key]) || 0) + (value as { increment: number }).increment;
      } else {
        store.quote[key] = value;
      }
    }
    return { count: 1 };
  });

  stub(prisma.b2bQuotation, "update", async () => (store.quote ? clone(store.quote) : null));
  stub(prisma.outreachActivity, "create", async (args: { data: Record<string, unknown> }) => {
    store.activities.push(clone(args.data));
    return args.data;
  });
  stub(prisma.outreachContact, "findUnique", async (args: { select?: Record<string, boolean> }) =>
    args.select && Object.keys(args.select).length === 1 && "lastContactedAt" in args.select ? { lastContactedAt: null } : activeContact()
  );
  stub(prisma.outreachContact, "update", async (args: { data: Record<string, unknown> }) => {
    store.contactUpdates.push(clone(args.data));
    return activeContact();
  });
}

function activityTypes() {
  return store.activities.map((activity) => activity.type);
}

function assertNeverWroteEligibility() {
  for (const data of store.contactUpdates) {
    assert.ok(!("status" in data), "a quotation action must never change OutreachContact.status (email eligibility)");
  }
}

function sendDeps(overrides: Partial<QuotationSendDependencies> = {}) {
  const deliver = mock.fn(async (..._args: unknown[]) => undefined);
  const deps: QuotationSendDependencies = {
    isDeliveryEnabled: () => true,
    deliver: deliver as unknown as QuotationSendDependencies["deliver"],
    ...overrides,
  };
  return { deps, deliver };
}

function providerRejected() {
  return new BrevoSendError("Brevo send failed (400).", "REJECTED");
}

function providerUnreachable() {
  return new BrevoSendError("Could not reach Brevo.", "UNREACHABLE");
}

const CONFIRM = { confirmRecipientEmail: "office@sunnyside.test" };

async function expectRuleError(promise: Promise<unknown>, pattern: RegExp, statusCode?: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof QuotationRuleError, `expected QuotationRuleError, got ${String(error)}`);
    assert.match(error.message, pattern);
    if (statusCode !== undefined) assert.equal(error.statusCode, statusCode);
    return true;
  });
}

function draftPayload(overrides: Record<string, unknown> = {}) {
  return {
    contactId: "contact-1",
    validUntil: "2026-10-31",
    discount: "0",
    delivery: "0",
    lines: [{ productId: "prod-1", quantity: 10, unitPrice: "100" }],
    ...overrides,
  };
}

function stubProductsAndContactForCreate() {
  stub(prisma.outreachContact, "findUnique", async () => activeContact());
  stub(prisma.product, "findMany", async () => [{ id: "prod-1", name: "ABC Colouring Book", sku: "SG-0001", status: "ACTIVE" }]);
}

// --- sending: the state sequence -------------------------------------------

test("successful send: DRAFT -> SENDING -> SENT, one QUOTE_SENT activity, and one provider call", async () => {
  installFakeDatabase();
  const { deps, deliver } = sendDeps();

  const result = await sendQuotation("quote-1", CONFIRM, ACTOR, deps, NOW);

  assert.equal(deliver.mock.callCount(), 1);
  assert.equal(result?.status, "SENT");
  assert.equal(result?.sendAttemptCount, 1);
  assert.deepEqual(activityTypes(), ["QUOTE_SENT"]);
  const sent = deliver.mock.calls[0]!.arguments[0] as unknown as Record<string, unknown>;
  assert.equal(sent.templateName, "b2b-quotation");
  assert.equal(sent.recipientRole, "contact");
  assert.equal(sent.recipientEmail, "office@sunnyside.test");
  assertNeverWroteEligibility();
});

test("the reservation is committed before the provider is called", async () => {
  installFakeDatabase();
  let statusDuringProviderCall: string | null = null;
  const { deps } = sendDeps({
    deliver: (async () => {
      statusDuringProviderCall = store.quote!.status;
    }) as unknown as QuotationSendDependencies["deliver"],
  });
  await sendQuotation("quote-1", CONFIRM, ACTOR, deps, NOW);
  assert.equal(statusDuringProviderCall, "SENDING", "a crash during the call must leave a reservation, not a draft");
});

test("a second send attempt while the first is in flight is refused and never reaches the provider", async () => {
  installFakeDatabase();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let providerEntered!: () => void;
  const entered = new Promise<void>((resolve) => {
    providerEntered = resolve;
  });
  let providerCalls = 0;
  const { deps } = sendDeps({
    deliver: (async () => {
      providerCalls += 1;
      providerEntered();
      await gate;
    }) as unknown as QuotationSendDependencies["deliver"],
  });

  const first = sendQuotation("quote-1", CONFIRM, ACTOR, deps, NOW);
  await entered;
  await expectRuleError(sendQuotation("quote-1", CONFIRM, ACTOR, deps, NOW), /already being sent|Do not resend/, 409);

  release();
  await first;
  assert.equal(providerCalls, 1, "exactly one email, however many attempts");
  assert.equal(store.quote!.status, "SENT");
});

test("a sent quotation cannot be sent again", async () => {
  installFakeDatabase();
  const { deps, deliver } = sendDeps();
  await sendQuotation("quote-1", CONFIRM, ACTOR, deps, NOW);
  await expectRuleError(sendQuotation("quote-1", CONFIRM, ACTOR, deps, NOW), /Only a draft/, 409);
  assert.equal(deliver.mock.callCount(), 1);
});

// --- provider failure ---------------------------------------------------------

test("provider refusal returns the quotation to DRAFT, records QUOTE_SEND_FAILED, and allows a retry", async () => {
  installFakeDatabase();
  const failing = sendDeps({
    deliver: (async () => {
      throw providerRejected();
    }) as unknown as QuotationSendDependencies["deliver"],
  });

  await expectRuleError(sendQuotation("quote-1", CONFIRM, ACTOR, failing.deps, NOW), /nothing was sent/, 502);
  assert.equal(store.quote!.status, "DRAFT");
  assert.match(store.quote!.lastSendError, /Not accepted by the email provider/);
  assert.deepEqual(activityTypes(), ["QUOTE_SEND_FAILED"]);
  assert.ok(!activityTypes().includes("QUOTE_SENT"));

  const retry = sendDeps();
  const result = await sendQuotation("quote-1", CONFIRM, ACTOR, retry.deps, NOW);
  assert.equal(result?.status, "SENT");
  assert.equal(retry.deliver.mock.callCount(), 1);
  assert.equal(result?.sendAttemptCount, 2);
});

test("an unreachable or unconfirmed provider leaves SEND_UNCERTAIN and blocks any blind resend", async () => {
  installFakeDatabase();
  const uncertain = sendDeps({
    deliver: (async () => {
      throw providerUnreachable();
    }) as unknown as QuotationSendDependencies["deliver"],
  });

  await expectRuleError(sendQuotation("quote-1", CONFIRM, ACTOR, uncertain.deps, NOW), /Do not resend/, 502);
  assert.equal(store.quote!.status, "SEND_UNCERTAIN");
  assert.deepEqual(activityTypes(), ["QUOTE_SEND_UNCERTAIN"]);

  const again = sendDeps();
  await expectRuleError(sendQuotation("quote-1", CONFIRM, ACTOR, again.deps, NOW), /already in progress or its outcome is unconfirmed/, 409);
  assert.equal(again.deliver.mock.callCount(), 0, "no second email while the outcome is unknown");
});

test("an unexpected, unclassified error is treated as unknown, never as a clean failure", async () => {
  installFakeDatabase();
  const { deps } = sendDeps({
    deliver: (async () => {
      throw new Error("socket hang up");
    }) as unknown as QuotationSendDependencies["deliver"],
  });
  await expectRuleError(sendQuotation("quote-1", CONFIRM, ACTOR, deps, NOW), /may or may not have been delivered/, 502);
  assert.equal(store.quote!.status, "SEND_UNCERTAIN");
});

// --- database failures around the provider call ---------------------------------

test("a database failure before the provider call sends nothing and leaves the draft untouched", async () => {
  installFakeDatabase();
  store.failReserve = true;
  const { deps, deliver } = sendDeps();
  await expectRuleError(sendQuotation("quote-1", CONFIRM, ACTOR, deps, NOW), /could not be reserved for sending, so nothing was sent/, 503);
  assert.equal(deliver.mock.callCount(), 0);
  assert.equal(store.quote!.status, "DRAFT");
  assert.equal(store.activities.length, 0);
});

test("a database failure after the provider accepted leaves SENDING, not DRAFT, and blocks a resend", async () => {
  installFakeDatabase();
  store.failFinalPersist = true;
  const { deps, deliver } = sendDeps();

  await expectRuleError(sendQuotation("quote-1", CONFIRM, ACTOR, deps, NOW), /accepted by the provider.*Do not resend/, 500);
  assert.equal(deliver.mock.callCount(), 1, "the email was accepted once");
  assert.equal(store.quote!.status, "SENDING", "must not look like an ordinary unsent draft");
  assert.match(store.quote!.lastSendError, /final save failed/);
  assert.ok(!activityTypes().includes("QUOTE_SENT"), "no QUOTE_SENT is claimed without the save");

  const again = sendDeps();
  await expectRuleError(sendQuotation("quote-1", CONFIRM, ACTOR, again.deps, NOW), /Do not resend it/, 409);
  assert.equal(again.deliver.mock.callCount(), 0);
});

// --- gates that run before any reservation ---------------------------------------

test("a suppressed contact is refused before anything is reserved or emailed", async () => {
  installFakeDatabase();
  stub(prisma.outreachContact, "findUnique", async () => activeContact({ status: "UNSUBSCRIBED" }));
  const { deps, deliver } = sendDeps();
  await expectRuleError(
    sendQuotation("quote-1", CONFIRM, ACTOR, deps, NOW),
    /email status is UNSUBSCRIBED.*Their email eligibility has not been changed/,
    409
  );
  assert.equal(deliver.mock.callCount(), 0);
  assert.equal(store.quote!.status, "DRAFT");
});

test("SUPPRESSED, BOUNCED and INVALID contacts are refused the same way", async () => {
  for (const status of ["SUPPRESSED", "BOUNCED", "INVALID"]) {
    installFakeDatabase();
    stub(prisma.outreachContact, "findUnique", async () => activeContact({ status }));
    const { deps, deliver } = sendDeps();
    await expectRuleError(sendQuotation("quote-1", CONFIRM, ACTOR, deps, NOW), /not sent/, 409);
    assert.equal(deliver.mock.callCount(), 0, status);
    restores.splice(0).reverse().forEach((restore) => restore());
  }
});

test("when email delivery is off, nothing is reserved and nothing is sent", async () => {
  installFakeDatabase();
  const { deps, deliver } = sendDeps({ isDeliveryEnabled: () => false });
  await expectRuleError(sendQuotation("quote-1", CONFIRM, ACTOR, deps, NOW), /switched off/, 503);
  assert.equal(deliver.mock.callCount(), 0);
  assert.equal(store.quote!.status, "DRAFT");
});

test("the recipient must be typed correctly and match the contact on record", async () => {
  installFakeDatabase();
  const { deps, deliver } = sendDeps();
  await expectRuleError(sendQuotation("quote-1", { confirmRecipientEmail: "someone.else@example.test" }, ACTOR, deps, NOW), /does not match this contact/, 409);
  await expectRuleError(sendQuotation("quote-1", {}, ACTOR, deps, NOW), /Type the recipient email address to confirm/);
  assert.equal(deliver.mock.callCount(), 0);
  assert.equal(store.quote!.status, "DRAFT");
});

// --- reconciliation ------------------------------------------------------------------

test("reconciling an unresolved send as delivered records SENT with the admin's note", async () => {
  installFakeDatabase(quotationRow({ status: "SEND_UNCERTAIN" }));
  const result = await reconcileQuotationSend("quote-1", { outcome: "SENT", note: "Found it in the sent folder" }, ACTOR, NOW);
  assert.equal(result?.status, "SENT");
  assert.deepEqual(activityTypes(), ["QUOTE_SENT"]);
  assert.match(store.activities[0]!.details as string, /Found it in the sent folder/);
});

test("reconciling as not delivered returns the quotation to DRAFT so it can be sent again", async () => {
  installFakeDatabase(quotationRow({ status: "SENDING" }));
  const result = await reconcileQuotationSend("quote-1", { outcome: "NOT_SENT", note: "Checked mailbox, nothing arrived" }, ACTOR, NOW);
  assert.equal(result?.status, "DRAFT");
  assert.deepEqual(activityTypes(), ["QUOTE_SEND_RECONCILED"]);
});

test("reconciliation needs a real note and only applies to an unresolved send", async () => {
  installFakeDatabase(quotationRow({ status: "SEND_UNCERTAIN" }));
  await expectRuleError(reconcileQuotationSend("quote-1", { outcome: "SENT", note: "ok" }, ACTOR, NOW), /at least 5 characters/);
  await expectRuleError(reconcileQuotationSend("quote-1", { outcome: "MAYBE", note: "checked it" }, ACTOR, NOW), /Choose whether/);

  installFakeDatabase(quotationRow({ status: "SENT" }));
  await expectRuleError(reconcileQuotationSend("quote-1", { outcome: "SENT", note: "checked it" }, ACTOR, NOW), /in progress or unconfirmed/, 409);
});

// --- status moves that must not bypass the send states ----------------------------

test("a SENDING or SEND_UNCERTAIN quotation cannot be accepted, declined, cancelled or edited", async () => {
  for (const status of ["SENDING", "SEND_UNCERTAIN"]) {
    installFakeDatabase(quotationRow({ status }));
    await expectRuleError(transitionQuotation("quote-1", "ACCEPTED", ACTOR, NOW), /cannot be marked accepted/, 409);
    await expectRuleError(transitionQuotation("quote-1", "CANCELLED", ACTOR, NOW), /cannot be marked cancelled/, 409);
    await expectRuleError(updateQuotationDraft("quote-1", draftPayload(), NOW), /Only draft quotations can be edited/, 409);
    restores.splice(0).reverse().forEach((restore) => restore());
  }
});

test("a draft cannot be marked accepted: it was never sent", async () => {
  installFakeDatabase();
  await expectRuleError(transitionQuotation("quote-1", "ACCEPTED", ACTOR, NOW), /cannot be marked accepted/, 409);
});

test("accepting a sent quotation records QUOTE_ACCEPTED and never makes the lead a customer", async () => {
  installFakeDatabase(quotationRow({ status: "SENT" }));
  await transitionQuotation("quote-1", "ACCEPTED", ACTOR, NOW);
  assert.deepEqual(activityTypes(), ["QUOTE_ACCEPTED"]);
  assert.equal(store.contactUpdates.length, 0, "accepting never writes the contact at all");
});

// --- numbering race -----------------------------------------------------------------

function raceCounter() {
  stub(prisma.quotationNumberCounter, "upsert", async () => {
    if (store.raceFailuresLeft > 0) {
      store.raceFailuresLeft -= 1;
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the counter row", { code: "P2002", clientVersion: "5.22.0" });
    }
    store.counter += 1;
    return { year: 2026, lastValue: store.counter };
  });
  stub(prisma.b2bQuotation, "create", async (args: { data: Record<string, any> }) => {
    if (store.quotationNumbers.has(args.data.quotationNumber)) {
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed on quotationNumber", { code: "P2002", clientVersion: "5.22.0" });
    }
    store.quotationNumbers.add(args.data.quotationNumber);
    return quotationRow({ ...args.data, id: `quote-${store.quotationNumbers.size}` });
  });
  stub(prisma, "$transaction", async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  stub(prisma.outreachActivity, "create", async (args: { data: Record<string, unknown> }) => args.data);
}

test("two simultaneous first quotations of a year get distinct SG-Q numbers even when one collides on the counter", async () => {
  stubProductsAndContactForCreate();
  raceCounter();
  store.raceFailuresLeft = 1;

  const [a, b] = await Promise.all([createQuotationDraft(draftPayload(), ACTOR, NOW), createQuotationDraft(draftPayload(), ACTOR, NOW)]);

  assert.notEqual(a.quotationNumber, b.quotationNumber);
  assert.deepEqual([a.quotationNumber, b.quotationNumber].sort(), ["SG-Q-2026-0001", "SG-Q-2026-0002"]);
});

test("a counter conflict that keeps happening is reported, never papered over with a duplicate number", async () => {
  stubProductsAndContactForCreate();
  raceCounter();
  store.raceFailuresLeft = 10;
  await expectRuleError(createQuotationDraft(draftPayload(), ACTOR, NOW), /same moment/, 409);
  assert.equal(store.quotationNumbers.size, 0);
});

test("a retry after a single conflict still produces exactly one quotation", async () => {
  stubProductsAndContactForCreate();
  raceCounter();
  store.raceFailuresLeft = 2;
  const created = await createQuotationDraft(draftPayload(), ACTOR, NOW);
  assert.equal(created.quotationNumber, "SG-Q-2026-0001");
  assert.equal(store.quotationNumbers.size, 1);
});

// --- line limit ---------------------------------------------------------------------

function linesOf(count: number) {
  return Array.from({ length: count }, (_, index) => ({ productId: `prod-${index + 1}`, quantity: 1, unitPrice: "10" }));
}

test("a quotation may have up to 15 line items", () => {
  assert.doesNotThrow(() => parseQuotationDraftInput(draftPayload({ lines: linesOf(15) }), NOW));
});

test("a sixteenth line item is refused with a clear error, never truncated", () => {
  assert.throws(() => parseQuotationDraftInput(draftPayload({ lines: linesOf(16) }), NOW), /at most 15 line items/);
});

// --- creation and editing ---------------------------------------------------------------

test("creation computes totals on the server from the admin's quote price", async () => {
  stubProductsAndContactForCreate();
  raceCounter();
  const created = await createQuotationDraft(draftPayload({ discount: "50", delivery: "120" }), ACTOR, NOW);
  assert.equal(created.quotationNumber, "SG-Q-2026-0001");
  assert.equal(created.subtotal, "1000.00");
  assert.equal(created.total, "1070.00");
  assert.equal(created.status, "DRAFT");
});

test("an inactive product cannot be quoted", async () => {
  stub(prisma.outreachContact, "findUnique", async () => activeContact());
  stub(prisma.product, "findMany", async () => [{ id: "prod-1", name: "Old book", sku: null, status: "ARCHIVED" }]);
  stub(prisma.quotationNumberCounter, "upsert", async () => ({ year: 2026, lastValue: 1 }));
  stub(prisma, "$transaction", async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  await expectRuleError(createQuotationDraft(draftPayload(), ACTOR, NOW), /not available to quote/);
});

test("editing a draft keeps its original quotation date when none is supplied", async () => {
  const originalDate = new Date("2026-09-15T08:00:00.000Z");
  installFakeDatabase(quotationRow({ quotationDate: originalDate }));
  stub(prisma.product, "findMany", async () => [{ id: "prod-1", name: "ABC Colouring Book", sku: "SG-0001", status: "ACTIVE" }]);
  stub(prisma.b2bQuotationLine, "deleteMany", async () => ({ count: 1 }));
  const updated = stub(prisma.b2bQuotation, "update", async (args: { data: Record<string, unknown> }) => ({ ...args.data }));

  await updateQuotationDraft("quote-1", draftPayload({ validUntil: "2026-11-30" }), NOW);
  assert.equal((updated.mock.calls[0]!.arguments[0]!.data.quotationDate as Date).getTime(), originalDate.getTime());
});

test("duplicating a quotation with a removed product is refused rather than guessed", async () => {
  installFakeDatabase(quotationRow({ lines: [{ ...quotationRow().lines[0], productId: null }] }));
  await expectRuleError(duplicateQuotation("quote-1", ACTOR, NOW), /has since been removed/, 409);
});
