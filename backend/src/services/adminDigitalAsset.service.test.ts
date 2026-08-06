// Version 7, Milestone 171A: dedicated backend tests for
// adminDigitalAsset.service.ts. Same manual prisma-proxy stub()
// approach as digitalDownload.service.test.ts — see that file's own
// header comment for why node:test's built-in mock.method() can't be
// used against Prisma Client's model delegates.
//
// This test environment has no real (or mocked) Supabase Storage
// configured (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are unset — see
// this milestone's final report). uploadOrReplaceDigitalAsset()
// checks isDigitalAssetStorageConfigured() AFTER all field/file
// validation but BEFORE ever calling the real upload — so every
// validation-rejection case below (wrong type, dangerous extension,
// oversize, empty, missing fields) is fully provable without Storage,
// and a *passing* validation (valid PDF/ZIP, valid fields) is provable
// by asserting the thrown error is specifically the "storage not
// configured" error, not a validation error — proving acceptance
// without needing a real upload to succeed.
//
// Version 7, Milestone 171A.1: the replacement round-trip tests near
// the end of this file (new storage path, old-object best-effort
// delete, upload-before-delete ordering) became possible after
// digitalAssetStorage.service.ts gained a small `digitalAssetStorage`
// seam object — see digitalDownload.service.test.ts's own header
// comment for the full reasoning (an ES module named import is
// read-only from the importing side; a plain object's properties are
// not).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import { deleteDigitalAsset, uploadOrReplaceDigitalAsset, AdminDigitalAssetError } from "./adminDigitalAsset.service.js";
import { digitalAssetStorage, DigitalAssetStorageError } from "./digitalAssetStorage.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

const VALID_UPLOAD_INPUT = {
  productId: "product-1",
  buffer: Buffer.from("fake-pdf-bytes"),
  mimetype: "application/pdf",
  size: 1024,
  originalName: "my-colouring-book.pdf",
  displayName: "My Colouring Book",
};

// ---------------------------------------------------------------------------
// Part 8: file-type / size / field validation (all provable without Storage
// — validation runs before the "is Storage configured" check).
// ---------------------------------------------------------------------------

test("PDF is an allowed type: passes validation (fails only at the unrelated 'storage not configured' step)", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1", productType: "DIGITAL" }));

  await assert.rejects(
    () => uploadOrReplaceDigitalAsset(VALID_UPLOAD_INPUT),
    (err: unknown) => {
      assert.ok(err instanceof DigitalAssetStorageError, `expected a storage-config error (proving validation passed), got ${(err as Error)?.constructor?.name}`);
      assert.ok(!(err instanceof AdminDigitalAssetError));
      return true;
    }
  );
  productFind.restore();
});

test("ZIP is an allowed type: passes validation (both standard and Windows alias MIME types)", async () => {
  for (const mimetype of ["application/zip", "application/x-zip-compressed"]) {
    const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1", productType: "DIGITAL" }));

    await assert.rejects(
      () => uploadOrReplaceDigitalAsset({ ...VALID_UPLOAD_INPUT, mimetype, originalName: "pages.zip" }),
      (err: unknown) => {
        assert.ok(err instanceof DigitalAssetStorageError);
        return true;
      }
    );
    productFind.restore();
  }
});

test("an unsupported MIME type (e.g. an image) is rejected before ever reaching Storage", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1", productType: "DIGITAL" }));

  await assert.rejects(
    () => uploadOrReplaceDigitalAsset({ ...VALID_UPLOAD_INPUT, mimetype: "image/png", originalName: "cover.png" }),
    (err: unknown) => {
      assert.ok(err instanceof AdminDigitalAssetError);
      assert.match((err as Error).message, /Unsupported file type/);
      return true;
    }
  );
  productFind.restore();
});

test("a dangerous file extension is rejected even with an otherwise-allowed MIME type", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1", productType: "DIGITAL" }));

  await assert.rejects(
    () => uploadOrReplaceDigitalAsset({ ...VALID_UPLOAD_INPUT, originalName: "totally-a-book.exe" }),
    (err: unknown) => {
      assert.ok(err instanceof AdminDigitalAssetError);
      assert.match((err as Error).message, /not allowed for security reasons/);
      return true;
    }
  );
  productFind.restore();
});

test("an oversized file (> 50 MB) is rejected", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1", productType: "DIGITAL" }));

  await assert.rejects(
    () => uploadOrReplaceDigitalAsset({ ...VALID_UPLOAD_INPUT, size: 50 * 1024 * 1024 + 1 }),
    (err: unknown) => {
      assert.ok(err instanceof AdminDigitalAssetError);
      assert.match((err as Error).message, /too large/i);
      return true;
    }
  );
  productFind.restore();
});

test("an empty file (0 bytes) is rejected", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1", productType: "DIGITAL" }));

  await assert.rejects(
    () => uploadOrReplaceDigitalAsset({ ...VALID_UPLOAD_INPUT, size: 0 }),
    (err: unknown) => {
      assert.ok(err instanceof AdminDigitalAssetError);
      assert.match((err as Error).message, /empty/i);
      return true;
    }
  );
  productFind.restore();
});

test("a missing displayName is rejected", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1", productType: "DIGITAL" }));

  await assert.rejects(
    () => uploadOrReplaceDigitalAsset({ ...VALID_UPLOAD_INPUT, displayName: "" }),
    (err: unknown) => {
      assert.ok(err instanceof AdminDigitalAssetError);
      assert.match((err as Error).message, /displayName is required/);
      return true;
    }
  );
  productFind.restore();
});

test("uploading for a product that does not exist is rejected before any validation", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => null);

  await assert.rejects(
    () => uploadOrReplaceDigitalAsset(VALID_UPLOAD_INPUT),
    (err: unknown) => {
      assert.ok(err instanceof AdminDigitalAssetError);
      assert.equal((err as AdminDigitalAssetError).statusCode, 404);
      return true;
    }
  );
  productFind.restore();
});

// ---------------------------------------------------------------------------
// Part 8: ACTIVE-product delete-block (fully testable — no Storage call
// is ever reached for the blocked case).
// ---------------------------------------------------------------------------

test("deleting the file of a currently-ACTIVE digital product is blocked", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1", status: "ACTIVE" }));
  const assetFind = stub(prisma.digitalAsset, "findUnique", async () => ({ id: "asset-1", storagePath: "digital-assets/product-1/123-file.pdf" }));
  const assetDelete = stub(prisma.digitalAsset, "delete", async () => {
    throw new Error("must never be called — an ACTIVE product's file must not be deletable");
  });

  await assert.rejects(
    () => deleteDigitalAsset("product-1"),
    (err: unknown) => {
      assert.ok(err instanceof AdminDigitalAssetError);
      assert.equal((err as AdminDigitalAssetError).statusCode, 409);
      assert.match((err as Error).message, /Active/);
      return true;
    }
  );
  assert.equal(assetDelete.fn.mock.callCount(), 0);
  productFind.restore();
  assetFind.restore();
  assetDelete.restore();
});

test("deleting the file of a DRAFT digital product's file is allowed (Storage cleanup safely no-ops when unconfigured)", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1", status: "DRAFT" }));
  const assetFind = stub(prisma.digitalAsset, "findUnique", async () => ({ id: "asset-1", storagePath: "digital-assets/product-1/123-file.pdf" }));
  const assetDelete = stub(prisma.digitalAsset, "delete", async () => ({}));

  await deleteDigitalAsset("product-1");

  assert.equal(assetDelete.fn.mock.callCount(), 1);
  productFind.restore();
  assetFind.restore();
  assetDelete.restore();
});

test("deleting when no digital file exists for the product is rejected", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1", status: "DRAFT" }));
  const assetFind = stub(prisma.digitalAsset, "findUnique", async () => null);

  await assert.rejects(
    () => deleteDigitalAsset("product-1"),
    (err: unknown) => {
      assert.ok(err instanceof AdminDigitalAssetError);
      assert.equal((err as AdminDigitalAssetError).statusCode, 404);
      return true;
    }
  );
  productFind.restore();
  assetFind.restore();
});

test("deleting for a product that does not exist is rejected", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => null);

  await assert.rejects(
    () => deleteDigitalAsset("product-1"),
    (err: unknown) => {
      assert.ok(err instanceof AdminDigitalAssetError);
      assert.equal((err as AdminDigitalAssetError).statusCode, 404);
      return true;
    }
  );
  productFind.restore();
});

// ---------------------------------------------------------------------------
// Version 7, Milestone 171A.1 — replacement round-trip tests, made
// possible by the digitalAssetStorage seam (see this file's own header
// comment). Storage is mocked "configured" and successful throughout.
// ---------------------------------------------------------------------------

const OLD_STORAGE_PATH = "digital-assets/product-1/1000000000000-old-book.pdf";

test("Part 6: replacing an existing file uploads to a new path, updates the DB row, then best-effort deletes the old object — in that order", async () => {
  const callOrder: string[] = [];

  const configuredStub = stub(digitalAssetStorage, "isDigitalAssetStorageConfigured", () => true);
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1", productType: "DIGITAL" }));
  const assetFind = stub(prisma.digitalAsset, "findUnique", async () => ({ id: "asset-1", storagePath: OLD_STORAGE_PATH }));

  let capturedUploadPath: string | undefined;
  const uploadStub = stub(digitalAssetStorage, "uploadDigitalAsset", async ({ path }: { path: string }) => {
    callOrder.push("upload");
    capturedUploadPath = path;
    return { path };
  });

  const updateStub = stub(prisma.digitalAsset, "update", async () => {
    callOrder.push("update");
    // Mirrors the real call's `select: digitalAssetSelect` projection
    // exactly (see adminDigitalAsset.service.ts) — deliberately does
    // NOT include storagePath/storageBucket, same as the real Prisma
    // response never would with that select clause.
    return { id: "asset-1", productId: "product-1", fileName: "new-book.pdf", displayName: "New Book", mimeType: "application/pdf", fileSizeBytes: 2048, pageCount: null, version: null, isActive: true, createdAt: new Date(), updatedAt: new Date() };
  });
  const createStub = stub(prisma.digitalAsset, "create", async () => {
    throw new Error("must never be called — an existing asset must be updated, not created a second time");
  });

  let capturedDeletePath: string | undefined;
  const deleteStub = stub(digitalAssetStorage, "removeDigitalAssetObjectBestEffort", async (path: string) => {
    callOrder.push("delete-old");
    capturedDeletePath = path;
  });

  try {
    const result = await uploadOrReplaceDigitalAsset({ ...VALID_UPLOAD_INPUT, originalName: "new-book.pdf" });

    assert.ok(capturedUploadPath, "a new storage path must have been generated and uploaded to");
    assert.notEqual(capturedUploadPath, OLD_STORAGE_PATH, "replace must use a brand-new path, never overwrite the old object in place");
    assert.match(capturedUploadPath!, /^digital-assets\/product-1\/\d+-new-book\.pdf$/);

    assert.equal(createStub.fn.mock.callCount(), 0);
    assert.equal(updateStub.fn.mock.callCount(), 1);

    assert.equal(capturedDeletePath, OLD_STORAGE_PATH, "the OLD object (and only the old one) must be the one removed");

    assert.deepEqual(callOrder, ["upload", "update", "delete-old"], "must upload the new file, commit the DB update, and only then best-effort delete the old object");
    // The admin-facing row never carrying storagePath/storageBucket is
    // guaranteed at compile time — AdminDigitalAssetRow's own type has
    // no such fields at all (matching digitalAssetSelect); `result` is
    // typed as exactly that interface, so there is nothing to assert
    // at runtime beyond what TypeScript already enforces here.
    assert.ok(result.fileName, "sanity check: a real row was returned");
  } finally {
    configuredStub.restore();
    productFind.restore();
    assetFind.restore();
    uploadStub.restore();
    updateStub.restore();
    createStub.restore();
    deleteStub.restore();
  }
});

// Part 7: the old object's deletion failing must not lose the new
// asset — removeDigitalAssetObjectBestEffort's own real contract is
// "never throws" (internal try/catch — see digitalAssetStorage.service.ts),
// so this test simulates that exact contract (resolves normally even
// though the underlying deletion did not really succeed) rather than
// inventing a new "what if it throws" scenario that could never
// happen in the real implementation.
test("Part 7: old-object deletion failing (per its own never-throws contract) does not lose the newly-replaced asset", async () => {
  const configuredStub = stub(digitalAssetStorage, "isDigitalAssetStorageConfigured", () => true);
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1", productType: "DIGITAL" }));
  const assetFind = stub(prisma.digitalAsset, "findUnique", async () => ({ id: "asset-1", storagePath: OLD_STORAGE_PATH }));
  const uploadStub = stub(digitalAssetStorage, "uploadDigitalAsset", async ({ path }: { path: string }) => ({ path }));
  const updateStub = stub(prisma.digitalAsset, "update", async () => ({
    id: "asset-1", productId: "product-1", fileName: "new-book.pdf", displayName: "New Book", mimeType: "application/pdf",
    fileSizeBytes: 2048, pageCount: null, version: null, isActive: true, createdAt: new Date(), updatedAt: new Date(),
  }));

  let deleteWasAttempted = false;
  const deleteStub = stub(digitalAssetStorage, "removeDigitalAssetObjectBestEffort", async () => {
    deleteWasAttempted = true;
    // Real contract: the underlying Supabase call may fail internally,
    // but this function itself never throws — it resolves regardless.
  });

  try {
    const result = await uploadOrReplaceDigitalAsset({ ...VALID_UPLOAD_INPUT, originalName: "new-book.pdf" });

    assert.ok(deleteWasAttempted, "old-object deletion must still have been attempted");
    assert.equal(updateStub.fn.mock.callCount(), 1, "the new asset's DB row must already be committed by the time cleanup runs");
    assert.equal(result.fileName, "new-book.pdf", "the newly-replaced asset must be returned successfully, never lost because old cleanup didn't really succeed");
  } finally {
    configuredStub.restore();
    productFind.restore();
    assetFind.restore();
    uploadStub.restore();
    updateStub.restore();
    deleteStub.restore();
  }
});
