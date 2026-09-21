// Milestone 189: dedicated tests for adminWelcomeGiftAsset.service.ts —
// the strict asset-key allowlist and the real (not fabricated) PDF
// page-count check are the two security/correctness-critical pieces.
// Uses pdf-lib itself to generate real, genuine in-memory PDFs with a
// known page count, so the page-count assertions exercise the real
// parser, not a mocked one. Same stub()-based Prisma mocking approach
// as welcomeGift.service.test.ts.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { prisma } from "../config/prisma.js";
import { digitalAssetStorage } from "./digitalAssetStorage.service.js";
import { uploadWelcomeGiftAsset, AdminWelcomeGiftAssetError } from "./adminWelcomeGiftAsset.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    doc.addPage([200, 200]);
  }
  return Buffer.from(await doc.save());
}

test("uploadWelcomeGiftAsset: rejects an asset key outside the fixed allowlist, before touching storage or the database", async () => {
  const upload = stub(digitalAssetStorage, "uploadDigitalAsset", async () => {
    throw new Error("must never be called — the allowlist check must short-circuit first");
  });

  const buffer = await makePdf(4);
  await assert.rejects(
    () => uploadWelcomeGiftAsset({ assetKey: "not_a_real_asset", buffer, mimetype: "application/pdf", size: buffer.length }),
    (error: unknown) => {
      assert.ok(error instanceof AdminWelcomeGiftAssetError);
      assert.equal(error.statusCode, 404);
      return true;
    }
  );

  assert.equal(upload.fn.mock.callCount(), 0);
  upload.restore();
});

test("uploadWelcomeGiftAsset: rejects a non-PDF MIME type", async () => {
  const buffer = Buffer.from("not really a pdf");
  await assert.rejects(
    () => uploadWelcomeGiftAsset({ assetKey: "abc_sample", buffer, mimetype: "image/png", size: buffer.length }),
    (error: unknown) => {
      assert.ok(error instanceof AdminWelcomeGiftAssetError);
      assert.match((error as Error).message, /Unsupported file type/);
      return true;
    }
  );
});

test("uploadWelcomeGiftAsset: rejects a real PDF with the wrong page count (3, not 4) — genuinely parsed, not guessed", async () => {
  const buffer = await makePdf(3);
  await assert.rejects(
    () => uploadWelcomeGiftAsset({ assetKey: "abc_sample", buffer, mimetype: "application/pdf", size: buffer.length }),
    (error: unknown) => {
      assert.ok(error instanceof AdminWelcomeGiftAssetError);
      assert.match((error as Error).message, /must be exactly 4 pages/);
      assert.match((error as Error).message, /has 3/);
      return true;
    }
  );
});

test("uploadWelcomeGiftAsset: rejects a file that merely claims application/pdf but isn't a real, parseable PDF", async () => {
  const buffer = Buffer.from("this is definitely not a pdf file");
  await assert.rejects(
    () => uploadWelcomeGiftAsset({ assetKey: "abc_sample", buffer, mimetype: "application/pdf", size: buffer.length }),
    (error: unknown) => {
      assert.ok(error instanceof AdminWelcomeGiftAssetError);
      assert.match((error as Error).message, /could not be read as a valid PDF/);
      return true;
    }
  );
});

test("uploadWelcomeGiftAsset: a genuine 4-page PDF for an allowlisted key is accepted, stored, and marked isConfigured: true", async () => {
  const isConfigured = stub(digitalAssetStorage, "isDigitalAssetStorageConfigured", () => true);
  const upload = stub(digitalAssetStorage, "uploadDigitalAsset", async () => ({ path: "welcome-gift/abc_sample/123-file.pdf" }));
  const existingFind = stub(prisma.welcomeGiftAsset, "findUnique", async () => null);
  const upsert = stub(prisma.welcomeGiftAsset, "upsert", async (args: any) => ({ assetKey: "abc_sample", ...args.create }));
  const removeBestEffort = stub(digitalAssetStorage, "removeDigitalAssetObjectBestEffort", async () => {});

  const buffer = await makePdf(4);
  const result = await uploadWelcomeGiftAsset({ assetKey: "abc_sample", buffer, mimetype: "application/pdf", size: buffer.length, originalName: "abc-sample.pdf" });

  assert.equal(result.isConfigured, true);
  assert.equal(result.pageCount, 4);
  assert.equal(upload.fn.mock.callCount(), 1);
  assert.equal(upsert.fn.mock.callCount(), 1);
  // No prior object existed for this key, so cleanup must never run.
  assert.equal(removeBestEffort.fn.mock.callCount(), 0);

  isConfigured.restore();
  upload.restore();
  existingFind.restore();
  upsert.restore();
  removeBestEffort.restore();
});
