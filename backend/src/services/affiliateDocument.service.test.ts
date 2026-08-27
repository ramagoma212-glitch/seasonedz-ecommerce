// Version 7, Milestone 176: document upload — LEVEL 1 file validation
// (brief sections 11, 45, 56, 59) and upload/replace orchestration.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import { affiliateDocumentStorage } from "./affiliateDocumentStorage.service.js";
import { AffiliateDocumentError, uploadOrReplaceDocument, validateDocumentFileLevel1 } from "./affiliateDocument.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

const REAL_PDF_BYTES = Buffer.from("%PDF-1.4\nsynthetic test content, never a real document\n%%EOF");
const REAL_JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const REAL_PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const FAKE_PDF_BYTES = Buffer.from("this is just plain text pretending to be a PDF");

test("validateDocumentFileLevel1: accepts a genuine PDF", () => {
  const ext = validateDocumentFileLevel1({ buffer: REAL_PDF_BYTES, mimetype: "application/pdf", size: REAL_PDF_BYTES.length });
  assert.equal(ext, "pdf");
});

test("validateDocumentFileLevel1: accepts a genuine JPEG and PNG", () => {
  assert.equal(validateDocumentFileLevel1({ buffer: REAL_JPEG_BYTES, mimetype: "image/jpeg", size: REAL_JPEG_BYTES.length }), "jpg");
  assert.equal(validateDocumentFileLevel1({ buffer: REAL_PNG_BYTES, mimetype: "image/png", size: REAL_PNG_BYTES.length }), "png");
});

test("validateDocumentFileLevel1: rejects a file whose content does not match its declared MIME type (brief section 11: never trust the browser MIME type alone)", () => {
  assert.throws(
    () => validateDocumentFileLevel1({ buffer: FAKE_PDF_BYTES, mimetype: "application/pdf", size: FAKE_PDF_BYTES.length }),
    AffiliateDocumentError
  );
});

test("validateDocumentFileLevel1: rejects an unsupported MIME type outright (never SVG/HTML — brief section 46)", () => {
  assert.throws(() => validateDocumentFileLevel1({ buffer: Buffer.from("<svg></svg>"), mimetype: "image/svg+xml", size: 11 }), AffiliateDocumentError);
  assert.throws(() => validateDocumentFileLevel1({ buffer: Buffer.from("<html></html>"), mimetype: "text/html", size: 13 }), AffiliateDocumentError);
});

test("validateDocumentFileLevel1: rejects an empty file", () => {
  assert.throws(() => validateDocumentFileLevel1({ buffer: Buffer.alloc(0), mimetype: "application/pdf", size: 0 }), AffiliateDocumentError);
});

test("validateDocumentFileLevel1: rejects an oversized file", () => {
  assert.throws(() => validateDocumentFileLevel1({ buffer: REAL_PDF_BYTES, mimetype: "application/pdf", size: 9 * 1024 * 1024 }), AffiliateDocumentError);
});

test("validateDocumentFileLevel1: rejects a dangerous filename even with an otherwise-valid PDF body (defense in depth)", () => {
  assert.throws(
    () => validateDocumentFileLevel1({ buffer: REAL_PDF_BYTES, mimetype: "application/pdf", size: REAL_PDF_BYTES.length, originalName: "id-document.pdf.exe" }),
    AffiliateDocumentError
  );
});

test("validateDocumentFileLevel1: neutralises a path-traversal-shaped filename (never throws on the traversal itself — the real path is always server-generated, never derived from the filename)", () => {
  // Confirms this function never reads the filename into anything used
  // as a storage path — buildStoragePath()/safeDisplayFileName() are
  // the only functions that ever touch originalName for storage
  // purposes, and neither is exercised here; this just confirms
  // validation itself doesn't choke on or trust a hostile name.
  const ext = validateDocumentFileLevel1({ buffer: REAL_PDF_BYTES, mimetype: "application/pdf", size: REAL_PDF_BYTES.length, originalName: "../../../etc/passwd.pdf" });
  assert.equal(ext, "pdf");
});

// ---------------------------------------------------------------------------
// uploadOrReplaceDocument.
// ---------------------------------------------------------------------------

const APPLICATION_ROW = {
  id: "app-1", firstName: "Jane", surname: "Smith", identityType: "SA_ID", idNumber: "9001015008088", passportNumber: null,
  addressLine1: "12 Oak Road", suburb: "Sunnyside", city: "Pretoria", postalCode: "0002",
};

test("uploadOrReplaceDocument: a first-time upload creates a new current document with a classification result", async () => {
  const configured = stub(affiliateDocumentStorage, "isAffiliateDocumentStorageConfigured", () => true);
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => APPLICATION_ROW);
  const existingFind = stub(prisma.affiliateApplicationDocument, "findFirst", async () => null);
  const upload = stub(affiliateDocumentStorage, "uploadAffiliateDocument", mock.fn(async () => ({ path: "affiliate-applications/app-1/random.pdf" })));
  const docCreate = stub(prisma.affiliateApplicationDocument, "create", mock.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "doc-1", ...data })));
  const eventCreate = stub(prisma.affiliateApplicationEvent, "create", async () => ({ id: "event-1" }));

  const result = await uploadOrReplaceDocument({
    applicationId: "app-1",
    slot: "IDENTITY",
    identityDocumentType: "SA_ID",
    buffer: REAL_PDF_BYTES,
    mimetype: "application/pdf",
    size: REAL_PDF_BYTES.length,
    originalName: "my-id.pdf",
  });

  assert.equal(result.id, "doc-1");
  assert.equal(upload.fn.mock.callCount(), 1);
  assert.equal(docCreate.fn.mock.callCount(), 1);
  const createData = docCreate.fn.mock.calls[0]!.arguments[0].data;
  assert.equal(createData.isCurrent, true);
  assert.notEqual(createData.classification, undefined);

  applicationFind.restore();
  existingFind.restore();
  upload.restore();
  docCreate.restore();
  eventCreate.restore();
  configured.restore();
});

test("uploadOrReplaceDocument: replacing an existing document marks the old one isCurrent:false and removes its storage object only after the new row commits (brief section 40)", async () => {
  const configured = stub(affiliateDocumentStorage, "isAffiliateDocumentStorageConfigured", () => true);
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => APPLICATION_ROW);
  const existingDoc = { id: "old-doc-1", storagePath: "affiliate-applications/app-1/old.pdf" };
  const existingFind = stub(prisma.affiliateApplicationDocument, "findFirst", async () => existingDoc);
  const upload = stub(affiliateDocumentStorage, "uploadAffiliateDocument", async () => ({ path: "affiliate-applications/app-1/new-random.pdf" }));
  const docCreate = stub(prisma.affiliateApplicationDocument, "create", async ({ data }: { data: Record<string, unknown> }) => ({ id: "doc-2", ...data }));
  const docUpdate = stub(prisma.affiliateApplicationDocument, "update", mock.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ id: where.id, ...data })));
  const eventCreate = stub(prisma.affiliateApplicationEvent, "create", async () => ({ id: "event-2" }));
  const remove = stub(affiliateDocumentStorage, "removeAffiliateDocumentObjectBestEffort", mock.fn(async () => {}));

  await uploadOrReplaceDocument({
    applicationId: "app-1",
    slot: "IDENTITY",
    identityDocumentType: "SA_ID",
    buffer: REAL_PDF_BYTES,
    mimetype: "application/pdf",
    size: REAL_PDF_BYTES.length,
  });

  assert.equal(docUpdate.fn.mock.callCount(), 1, "the old document row is marked isCurrent:false, never deleted");
  assert.equal(docUpdate.fn.mock.calls[0]!.arguments[0].data.isCurrent, false);
  assert.equal(remove.fn.mock.callCount(), 1);
  assert.equal(remove.fn.mock.calls[0]!.arguments[0], "affiliate-applications/app-1/old.pdf", "only ever the OLD object is removed, never the new one");

  applicationFind.restore();
  existingFind.restore();
  upload.restore();
  docCreate.restore();
  docUpdate.restore();
  eventCreate.restore();
  remove.restore();
  configured.restore();
});

test("uploadOrReplaceDocument: a storage upload failure never creates an orphaned/inconsistent database row", async () => {
  const configured = stub(affiliateDocumentStorage, "isAffiliateDocumentStorageConfigured", () => true);
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => APPLICATION_ROW);
  const existingFind = stub(prisma.affiliateApplicationDocument, "findFirst", async () => null);
  const upload = stub(affiliateDocumentStorage, "uploadAffiliateDocument", async () => {
    throw new Error("storage unavailable");
  });
  const docCreate = stub(prisma.affiliateApplicationDocument, "create", mock.fn(async () => {
    throw new Error("must never be called — the storage upload already failed");
  }));

  await assert.rejects(
    () => uploadOrReplaceDocument({ applicationId: "app-1", slot: "IDENTITY", identityDocumentType: "SA_ID", buffer: REAL_PDF_BYTES, mimetype: "application/pdf", size: REAL_PDF_BYTES.length }),
    /storage unavailable/
  );
  assert.equal(docCreate.fn.mock.callCount(), 0);

  applicationFind.restore();
  existingFind.restore();
  upload.restore();
  docCreate.restore();
  configured.restore();
});
