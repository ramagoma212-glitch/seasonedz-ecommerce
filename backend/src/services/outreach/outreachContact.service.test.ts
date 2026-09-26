// Milestone 198, Part 26 (CONTACTS): validation, case-insensitive
// duplicate detection, and suppression behaviour. Same stub() helper
// pattern coupon.service.test.ts already established for mocking
// individual Prisma model delegates in isolation, without a real
// database.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { OutreachContactStatus } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { createContact, setContactStatus, unsubscribeContactByToken, OutreachContactError, isValidOutreachEmail, normalizeOutreachEmail } from "./outreachContact.service.js";

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
