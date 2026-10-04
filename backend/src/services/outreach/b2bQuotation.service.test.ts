// Milestone 201: B2B quotation service. Every Prisma call is stubbed, so
// these tests never touch a database and never send email: the send
// dependencies are injected, and every test that could send uses a fake.
// The rules that matter most are asserted here: a suppressed contact is never
// emailed, a failed send records nothing, and no quotation action changes
// email eligibility (OutreachContact.status).
import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../config/prisma.js";
import {
  createQuotationDraft,
  duplicateQuotation,
  sendQuotation,
  transitionQuotation,
  updateQuotationDraft,
  type QuotationSendDependencies,
} from "./b2bQuotation.service.js";
import { QuotationRuleError } from "./b2bQuotation.rules.js";

const ACTOR = { id: "admin-1", name: "Owner", email: "owner@seasonedz.test" };
const NOW = new Date("2026-10-04T10:00:00.000Z");

type Restore = () => void;
const restores: Restore[] = [];

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

function activeProduct(overrides: Record<string, unknown> = {}) {
  return { id: "prod-1", name: "ABC Colouring Book", sku: "SG-0001", status: "ACTIVE", ...overrides };
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

function stubTransaction() {
  stub(prisma, "$transaction", async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
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

async function expectRuleError(promise: Promise<unknown>, pattern: RegExp, statusCode?: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof QuotationRuleError, `expected QuotationRuleError, got ${String(error)}`);
    assert.match(error.message, pattern);
    if (statusCode !== undefined) assert.equal(error.statusCode, statusCode);
    return true;
  });
}

// --- creation -------------------------------------------------------------

test("creates a draft with server-computed totals and the first SAST-year number", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => activeContact());
  stub(prisma.product, "findMany", async () => [activeProduct()]);
  const counter = stub(prisma.quotationNumberCounter, "upsert", async () => ({ year: 2026, lastValue: 1 }));
  const created = stub(prisma.b2bQuotation, "create", async (args: { data: Record<string, unknown> }) => quotationRow({ ...args.data, id: "quote-1" }));
  const activity = stub(prisma.outreachActivity, "create", async () => ({ id: "act-1" }));

  await createQuotationDraft(draftPayload({ discount: "50", delivery: "120" }), ACTOR, NOW);

  assert.equal(counter.mock.callCount(), 1);
  const data = created.mock.calls[0]!.arguments[0]!.data as Record<string, unknown>;
  assert.equal(data.quotationNumber, "SG-Q-2026-0001");
  assert.equal(data.subtotal, "1000.00");
  assert.equal(data.discountAmount, "50.00");
  assert.equal(data.deliveryAmount, "120.00");
  assert.equal(data.total, "1070.00");
  assert.equal(data.status, "DRAFT");
  assert.equal(data.createdByAdminUserId, ACTOR.id);
  assert.equal(activity.mock.calls[0]!.arguments[0]!.data.type, "QUOTE_CREATED");
});

test("the price on a line is the admin's quote price, not the product's website price", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => activeContact());
  stub(prisma.product, "findMany", async () => [activeProduct({ price: "250.00" })]);
  stub(prisma.quotationNumberCounter, "upsert", async () => ({ year: 2026, lastValue: 2 }));
  const created = stub(prisma.b2bQuotation, "create", async (args: { data: Record<string, unknown> }) => quotationRow({ ...args.data }));
  stub(prisma.outreachActivity, "create", async () => ({ id: "act-1" }));

  await createQuotationDraft(draftPayload({ lines: [{ productId: "prod-1", quantity: 100, unitPrice: "80" }] }), ACTOR, NOW);

  const lines = (created.mock.calls[0]!.arguments[0]!.data.lines as { create: Record<string, unknown>[] }).create;
  assert.equal(lines[0]!.unitPrice, "80.00");
  assert.equal(lines[0]!.lineTotal, "8000.00");
  assert.equal(lines[0]!.descriptionSnapshot, "ABC Colouring Book", "the description is read from the product, never the client");
  assert.equal(lines[0]!.skuSnapshot, "SG-0001");
});

test("an inactive product cannot be quoted", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => activeContact());
  stub(prisma.product, "findMany", async () => [activeProduct({ status: "ARCHIVED" })]);
  stub(prisma.quotationNumberCounter, "upsert", async () => ({ year: 2026, lastValue: 1 }));
  await expectRuleError(createQuotationDraft(draftPayload(), ACTOR, NOW), /not available to quote/);
});

test("a product id that does not exist is refused", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => activeContact());
  stub(prisma.product, "findMany", async () => []);
  await expectRuleError(createQuotationDraft(draftPayload(), ACTOR, NOW), /no longer exists/, 404);
});

test("the same product cannot appear twice on one quotation", async () => {
  await expectRuleError(
    createQuotationDraft(
      draftPayload({
        lines: [
          { productId: "prod-1", quantity: 1, unitPrice: "10" },
          { productId: "prod-1", quantity: 2, unitPrice: "10" },
        ],
      }),
      ACTOR,
      NOW
    ),
    /already on the quotation/
  );
});

test("a quotation cannot expire before it is dated", async () => {
  await expectRuleError(createQuotationDraft(draftPayload({ validUntil: "2026-09-01" }), ACTOR, NOW), /cannot be before the quotation date/);
});

test("a discount larger than the subtotal is refused before anything is written", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => activeContact());
  stub(prisma.product, "findMany", async () => [activeProduct()]);
  const created = stub(prisma.b2bQuotation, "create", async () => quotationRow());
  await expectRuleError(createQuotationDraft(draftPayload({ discount: "5000" }), ACTOR, NOW), /more than the subtotal/);
  assert.equal(created.mock.callCount(), 0);
});

test("a client-supplied quotation number is ignored: numbers only come from the counter", async () => {
  stubTransaction();
  stub(prisma.outreachContact, "findUnique", async () => activeContact());
  stub(prisma.product, "findMany", async () => [activeProduct()]);
  stub(prisma.quotationNumberCounter, "upsert", async () => ({ year: 2026, lastValue: 9 }));
  const created = stub(prisma.b2bQuotation, "create", async (args: { data: Record<string, unknown> }) => quotationRow({ ...args.data }));
  stub(prisma.outreachActivity, "create", async () => ({ id: "act-1" }));

  await createQuotationDraft(draftPayload({ quotationNumber: "SG-Q-2026-0001", total: "1" }), ACTOR, NOW);

  const data = created.mock.calls[0]!.arguments[0]!.data as Record<string, unknown>;
  assert.equal(data.quotationNumber, "SG-Q-2026-0009");
  assert.equal(data.total, "1000.00", "a client-supplied total is never trusted");
});

// --- editing and duplicating ----------------------------------------------

test("a sent quotation cannot be edited", async () => {
  stub(prisma.b2bQuotation, "findUnique", async () => ({ id: "quote-1", status: "SENT", quotationDate: NOW, contactId: "contact-1" }));
  const deleted = stub(prisma.b2bQuotationLine, "deleteMany", async () => ({ count: 0 }));
  await expectRuleError(updateQuotationDraft("quote-1", draftPayload(), NOW), /Only draft quotations can be edited/, 409);
  assert.equal(deleted.mock.callCount(), 0, "the lines of a sent quote are never removed");
});

test("editing a draft keeps its original quotation date when none is supplied", async () => {
  stubTransaction();
  const originalDate = new Date("2026-09-15T08:00:00.000Z");
  stub(prisma.b2bQuotation, "findUnique", async () => ({ id: "quote-1", status: "DRAFT", quotationDate: originalDate, contactId: "contact-1" }));
  stub(prisma.product, "findMany", async () => [activeProduct()]);
  stub(prisma.b2bQuotationLine, "deleteMany", async () => ({ count: 1 }));
  const updated = stub(prisma.b2bQuotation, "update", async (args: { data: Record<string, unknown> }) => ({ ...args.data }));

  await updateQuotationDraft("quote-1", draftPayload({ validUntil: "2026-11-30" }), NOW);

  assert.equal((updated.mock.calls[0]!.arguments[0]!.data.quotationDate as Date).getTime(), originalDate.getTime());
});

test("duplicating a quotation with a removed product is refused rather than guessed", async () => {
  stub(prisma.b2bQuotation, "findUnique", async () => quotationRow({ lines: [{ ...quotationRow().lines[0], productId: null }] }));
  await expectRuleError(duplicateQuotation("quote-1", ACTOR, NOW), /has since been removed/, 409);
});

// --- sending: every guard must hold before anything is emailed --------------

test("sending a quotation that is not a draft is refused and nothing is emailed", async () => {
  stub(prisma.b2bQuotation, "findUnique", async () => quotationRow({ status: "SENT", lines: [] }));
  const { deps, deliver } = sendDeps();
  await expectRuleError(sendQuotation("quote-1", { confirmRecipientEmail: "office@sunnyside.test" }, ACTOR, deps, NOW), /Only a draft/, 409);
  assert.equal(deliver.mock.callCount(), 0);
});

test("a suppressed (UNSUBSCRIBED) contact is never emailed a quotation", async () => {
  stub(prisma.b2bQuotation, "findUnique", async () => quotationRow({ lines: [] }));
  stub(prisma.outreachContact, "findUnique", async () => activeContact({ status: "UNSUBSCRIBED" }));
  const updateMany = stub(prisma.b2bQuotation, "updateMany", async () => ({ count: 1 }));
  const activity = stub(prisma.outreachActivity, "create", async () => ({ id: "act-1" }));
  const { deps, deliver } = sendDeps();

  await expectRuleError(
    sendQuotation("quote-1", { confirmRecipientEmail: "office@sunnyside.test" }, ACTOR, deps, NOW),
    /email status is UNSUBSCRIBED.*Their email eligibility has not been changed/,
    409
  );
  assert.equal(deliver.mock.callCount(), 0, "no email is handed to the provider");
  assert.equal(updateMany.mock.callCount(), 0, "the quotation stays a draft");
  assert.equal(activity.mock.callCount(), 0, "no QUOTE_SENT activity is recorded");
});

test("a BOUNCED, INVALID or SUPPRESSED contact is refused the same way", async () => {
  for (const status of ["SUPPRESSED", "BOUNCED", "INVALID"]) {
    stub(prisma.b2bQuotation, "findUnique", async () => quotationRow({ lines: [] }));
    stub(prisma.outreachContact, "findUnique", async () => activeContact({ status }));
    const { deps, deliver } = sendDeps();
    await expectRuleError(sendQuotation("quote-1", { confirmRecipientEmail: "office@sunnyside.test" }, ACTOR, deps, NOW), /not sent/, 409);
    assert.equal(deliver.mock.callCount(), 0, status);
    restores.splice(0).forEach((restore) => restore());
  }
});

test("when email delivery is switched off, nothing is sent and the draft stays a draft", async () => {
  stub(prisma.b2bQuotation, "findUnique", async () => quotationRow({ lines: [] }));
  stub(prisma.outreachContact, "findUnique", async () => activeContact());
  const updateMany = stub(prisma.b2bQuotation, "updateMany", async () => ({ count: 1 }));
  const { deps, deliver } = sendDeps({ isDeliveryEnabled: () => false });

  await expectRuleError(sendQuotation("quote-1", { confirmRecipientEmail: "office@sunnyside.test" }, ACTOR, deps, NOW), /switched off/, 503);
  assert.equal(deliver.mock.callCount(), 0);
  assert.equal(updateMany.mock.callCount(), 0);
});

test("the recipient must be typed correctly, matching the contact on record", async () => {
  stub(prisma.b2bQuotation, "findUnique", async () => quotationRow({ lines: [] }));
  stub(prisma.outreachContact, "findUnique", async () => activeContact());
  const { deps, deliver } = sendDeps();

  await expectRuleError(sendQuotation("quote-1", { confirmRecipientEmail: "someone.else@example.test" }, ACTOR, deps, NOW), /does not match this contact/, 409);
  await expectRuleError(sendQuotation("quote-1", {}, ACTOR, deps, NOW), /email address/);
  assert.equal(deliver.mock.callCount(), 0);
});

test("a provider failure leaves the quotation as a draft and records no activity", async () => {
  stub(prisma.b2bQuotation, "findUnique", async () => quotationRow({ lines: [] }));
  stub(prisma.outreachContact, "findUnique", async () => activeContact());
  const updateMany = stub(prisma.b2bQuotation, "updateMany", async () => ({ count: 1 }));
  const activity = stub(prisma.outreachActivity, "create", async () => ({ id: "act-1" }));
  const { deps } = sendDeps({
    deliver: (async () => {
      throw new Error("Brevo unreachable");
    }) as unknown as QuotationSendDependencies["deliver"],
  });

  await expectRuleError(sendQuotation("quote-1", { confirmRecipientEmail: "office@sunnyside.test" }, ACTOR, deps, NOW), /could not be sent/, 502);
  assert.equal(updateMany.mock.callCount(), 0, "status is not moved to SENT");
  assert.equal(activity.mock.callCount(), 0, "no QUOTE_SENT activity is recorded");
});

test("a successful send emails the contact, marks the quotation SENT and records one QUOTE_SENT activity", async () => {
  stubTransaction();
  stub(prisma.b2bQuotation, "findUnique", async () => quotationRow());
  stub(prisma.outreachContact, "findUnique", async (args: { select?: Record<string, boolean> }) =>
    args.select?.lastContactedAt ? { lastContactedAt: null } : activeContact()
  );
  const updateMany = stub(prisma.b2bQuotation, "updateMany", async () => ({ count: 1 }));
  const activity = stub(prisma.outreachActivity, "create", async () => ({ id: "act-1" }));
  const contactUpdate = stub(prisma.outreachContact, "update", async () => ({ id: "contact-1" }));
  const { deps, deliver } = sendDeps();

  await sendQuotation("quote-1", { confirmRecipientEmail: "Office@Sunnyside.test" }, ACTOR, deps, NOW);

  assert.equal(deliver.mock.callCount(), 1);
  const sent = deliver.mock.calls[0]!.arguments[0] as unknown as Record<string, unknown>;
  assert.equal(sent.templateName, "b2b-quotation");
  assert.equal(sent.recipientRole, "contact");
  assert.equal(sent.recipientEmail, "office@sunnyside.test");
  assert.equal(sent.reference, "quotation:SG-Q-2026-0001");

  assert.deepEqual(updateMany.mock.calls[0]!.arguments[0]!.where, { id: "quote-1", status: "DRAFT" }, "claim only a draft");
  assert.equal(updateMany.mock.calls[0]!.arguments[0]!.data.status, "SENT");

  assert.equal(activity.mock.callCount(), 1);
  const recorded = activity.mock.calls[0]!.arguments[0]!.data as Record<string, unknown>;
  assert.equal(recorded.type, "QUOTE_SENT");
  assert.equal(recorded.channel, "EMAIL");
  assert.equal(recorded.quotationId, "quote-1");

  assert.equal(contactUpdate.mock.callCount(), 1, "last-contacted moves forward");
  assert.ok(!("status" in (contactUpdate.mock.calls[0]!.arguments[0]!.data as object)), "a send never changes email eligibility");
});

test("a quotation that changed state during the send is reported, not silently double-counted", async () => {
  stubTransaction();
  stub(prisma.b2bQuotation, "findUnique", async () => quotationRow());
  stub(prisma.outreachContact, "findUnique", async () => activeContact());
  stub(prisma.b2bQuotation, "updateMany", async () => ({ count: 0 }));
  const activity = stub(prisma.outreachActivity, "create", async () => ({ id: "act-1" }));
  const { deps } = sendDeps();
  await expectRuleError(sendQuotation("quote-1", { confirmRecipientEmail: "office@sunnyside.test" }, ACTOR, deps, NOW), /changed while it was being sent/, 409);
  assert.equal(activity.mock.callCount(), 0);
});

// --- status moves -------------------------------------------------------------

test("a draft cannot be marked accepted: it was never sent", async () => {
  stub(prisma.b2bQuotation, "findUnique", async () => quotationRow({ status: "DRAFT" }));
  const updateMany = stub(prisma.b2bQuotation, "updateMany", async () => ({ count: 1 }));
  await expectRuleError(transitionQuotation("quote-1", "ACCEPTED", ACTOR, NOW), /cannot be marked accepted/, 409);
  assert.equal(updateMany.mock.callCount(), 0);
});

test("accepting a sent quotation records QUOTE_ACCEPTED and does NOT change the lead to customer", async () => {
  stubTransaction();
  stub(prisma.b2bQuotation, "findUnique", async () => quotationRow({ status: "SENT", lines: [] }));
  const updateMany = stub(prisma.b2bQuotation, "updateMany", async () => ({ count: 1 }));
  const activity = stub(prisma.outreachActivity, "create", async () => ({ id: "act-1" }));
  const contactUpdate = stub(prisma.outreachContact, "update", async () => ({}));

  await transitionQuotation("quote-1", "ACCEPTED", ACTOR, NOW);

  assert.equal(updateMany.mock.calls[0]!.arguments[0]!.where.status, "SENT");
  assert.ok("acceptedAt" in (updateMany.mock.calls[0]!.arguments[0]!.data as object));
  assert.equal(activity.mock.calls[0]!.arguments[0]!.data.type, "QUOTE_ACCEPTED");
  assert.equal(contactUpdate.mock.callCount(), 0, "accepting a quote never moves the lead to CUSTOMER");
});

test("declining records QUOTE_DECLINED; cancelling records a NOTE and never a sale", async () => {
  stubTransaction();
  stub(prisma.b2bQuotation, "findUnique", async () => quotationRow({ status: "SENT", lines: [] }));
  stub(prisma.b2bQuotation, "updateMany", async () => ({ count: 1 }));
  const activity = stub(prisma.outreachActivity, "create", async () => ({ id: "act-1" }));

  await transitionQuotation("quote-1", "DECLINED", ACTOR, NOW);
  assert.equal(activity.mock.calls[0]!.arguments[0]!.data.type, "QUOTE_DECLINED");

  await transitionQuotation("quote-1", "CANCELLED", ACTOR, NOW);
  assert.equal(activity.mock.calls[1]!.arguments[0]!.data.type, "NOTE");
});

test("a lost race on a status change is refused and records nothing", async () => {
  stubTransaction();
  stub(prisma.b2bQuotation, "findUnique", async () => quotationRow({ status: "SENT", lines: [] }));
  stub(prisma.b2bQuotation, "updateMany", async () => ({ count: 0 }));
  const activity = stub(prisma.outreachActivity, "create", async () => ({ id: "act-1" }));
  await expectRuleError(transitionQuotation("quote-1", "ACCEPTED", ACTOR, NOW), /changed while you were working/, 409);
  assert.equal(activity.mock.callCount(), 0);
});
