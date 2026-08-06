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
// without needing a real upload to succeed. The one thing that
// specific technique cannot prove is the actual round-trip (a new
// storage path really differing from the old one, the old object
// really being removed) — see the final report for that remaining gap.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import { deleteDigitalAsset, uploadOrReplaceDigitalAsset, AdminDigitalAssetError } from "./adminDigitalAsset.service.js";
import { DigitalAssetStorageError } from "./digitalAssetStorage.service.js";

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
