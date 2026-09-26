// Milestone 198, Part 26 (CONTACTS): CSV/paste parsing and the
// preview/commit pipeline — including Part 12's own explicit
// requirement that re-importing a suppressed address must never
// silently remove its suppression.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { OutreachContactStatus } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { parseOutreachContactsCsv, parsePastedOutreachContacts, previewOutreachImport, commitOutreachImport } from "./outreachImport.service.js";

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

test("parseOutreachContactsCsv maps a header row in any column order, leaving missing optional columns blank", () => {
  const csv = ["email,organisation_name,tags", "school@example.com,Sunnyside Primary,bulk books;schools", "church@example.com,,"].join("\n");
  const rows = parseOutreachContactsCsv(csv);

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.email, "school@example.com");
  assert.equal(rows[0]?.organisationName, "Sunnyside Primary");
  assert.deepEqual(rows[0]?.tags, ["bulk books", "schools"]);
  assert.equal(rows[1]?.email, "church@example.com");
  assert.equal(rows[1]?.organisationName, undefined);
});

test("parseOutreachContactsCsv throws a clear error when the header has no email column", () => {
  assert.throws(() => parseOutreachContactsCsv("organisation_name\nSunnyside Primary"), /email/i);
});

test("parsePastedOutreachContacts supports a bare email-per-line format", () => {
  const rows = parsePastedOutreachContacts("school@example.com\nchurch@example.com\n\nbooks@example.com");
  assert.deepEqual(
    rows.map((row) => row.email),
    ["school@example.com", "church@example.com", "books@example.com"]
  );
});

test("parsePastedOutreachContacts supports a simple structured comma row: organisation, email, contact, phone", () => {
  const rows = parsePastedOutreachContacts("Sunnyside Primary, school@example.com, Mrs Nkosi, 0821234567");
  assert.equal(rows[0]?.organisationName, "Sunnyside Primary");
  assert.equal(rows[0]?.email, "school@example.com");
  assert.equal(rows[0]?.contactName, "Mrs Nkosi");
  assert.equal(rows[0]?.phone, "0821234567");
});

test("previewOutreachImport classifies every row into exactly one outcome bucket", async () => {
  const findMany = stub(prisma.outreachContact, "findMany", async () => [
    { email: "existing-active@example.com", organisationName: "Existing Active Org", status: OutreachContactStatus.ACTIVE },
    { email: "existing-suppressed@example.com", organisationName: "Existing Suppressed Org", status: OutreachContactStatus.SUPPRESSED },
  ]);

  const rows = [
    { email: "new@example.com" },
    { email: "existing-active@example.com" },
    { email: "existing-suppressed@example.com" },
    { email: "new@example.com" }, // duplicate within this same upload
    { email: "not-an-email" },
  ];

  const preview = await previewOutreachImport(rows);
  assert.deepEqual(
    preview.rows.map((row) => row.outcome),
    ["valid", "duplicate_in_db", "suppressed", "duplicate_in_upload", "invalid_email"]
  );
  assert.equal(preview.counts.valid, 1);
  assert.equal(preview.counts.duplicateInDb, 1);
  assert.equal(preview.counts.suppressed, 1);
  assert.equal(preview.counts.duplicateInUpload, 1);
  assert.equal(preview.counts.invalidEmail, 1);

  findMany.restore();
});

test("commitOutreachImport only creates the genuinely valid rows, skipping every duplicate/invalid/suppressed row", async () => {
  const findMany = stub(prisma.outreachContact, "findMany", async () => [{ email: "existing@example.com", organisationName: "Existing Org", status: OutreachContactStatus.ACTIVE }]);
  const createMany = stub(prisma.outreachContact, "createMany", async (args: { data: unknown[] }) => ({ count: args.data.length }));

  const result = await commitOutreachImport([{ email: "new@example.com" }, { email: "existing@example.com" }, { email: "not-an-email" }]);

  assert.equal(result.created, 1);
  assert.equal(result.skipped, 2);
  assert.equal(createMany.fn.mock.callCount(), 1);
  const createdEmails = (createMany.fn.mock.calls[0]?.arguments[0].data as Array<{ email: string }>).map((row) => row.email);
  assert.deepEqual(createdEmails, ["new@example.com"]);

  findMany.restore();
  createMany.restore();
});

test("commitOutreachImport never touches an existing contact's status — a suppressed contact re-imported stays suppressed", async () => {
  const findMany = stub(prisma.outreachContact, "findMany", async () => [{ email: "unsubscribed@example.com", organisationName: "Some Org", status: OutreachContactStatus.UNSUBSCRIBED }]);
  const createMany = stub(prisma.outreachContact, "createMany", async () => ({ count: 0 }));
  const update = stub(prisma.outreachContact, "update", async () => {
    throw new Error("update should never be called — importing an existing email must never modify that row");
  });

  const result = await commitOutreachImport([{ email: "unsubscribed@example.com", organisationName: "Renamed On Re-import" }]);

  assert.equal(result.created, 0);
  assert.equal(result.skipped, 1);
  assert.equal(update.fn.mock.callCount(), 0);
  assert.equal(createMany.fn.mock.callCount(), 0, "nothing valid to create — createMany should not even be called");

  findMany.restore();
  createMany.restore();
  update.restore();
});
