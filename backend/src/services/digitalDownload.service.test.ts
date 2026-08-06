// Version 7, Milestone 171A: dedicated backend security/entitlement
// tests for digitalDownload.service.ts — the one place in the backend
// that ever decides "is this specific download allowed right now"
// (see that file's own header comment). No production code was
// changed to add the entitlement-denial tests in this file's first
// half — see the "mocking approach" note below.
//
// Version 7, Milestone 171A.1: the happy-path tests in the second half
// (signed URL success, download-log increment, signed-URL failure,
// privacy) became possible after a small, behaviour-preserving seam
// was added to digitalAssetStorage.service.ts — a plain `digitalAssetStorage`
// object grouping its 4 real functions, which digitalDownload.service.ts
// now calls through instead of importing them directly by name. A
// direct named ES module import is a read-only binding from the
// importing side (confirmed empirically: reassigning it throws
// "Cannot assign to read only property"); a plain object's own
// properties are not. The object's default properties are always the
// same real implementations — only a test that temporarily reassigns
// one property (and restores it afterward, as done below) ever sees
// different behaviour.
//
// Mocking approach: Prisma Client's model delegates (prisma.order,
// prisma.orderItem, etc.) are Proxy objects. node:test's built-in
// mock.method() reads Object.getOwnPropertyDescriptor() to capture the
// original method, but Prisma's proxy reports `value: undefined` in
// that descriptor even though direct property access returns a real
// bound function — mock.method() throws ERR_INVALID_ARG_VALUE against
// any prisma.<model>.<method> as a result (confirmed empirically
// before writing this file). Direct property assignment against the
// same proxy DOES work (its `set` trap correctly stores the override),
// so the stub() helper below does that manually, wrapped in
// node:test's own mock.fn() purely for call-count/args tracking.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { prisma } from "../config/prisma.js";
import { digitalAssetStorage } from "./digitalAssetStorage.service.js";
import {
  createGuestDownloadToken,
  getPurchasedDigitalItemsForCustomerOrder,
  getPurchasedDigitalItemsForGuestToken,
  requestSignedDownloadUrlForCustomer,
  requestSignedDownloadUrlForGuestToken,
  DigitalDownloadError,
} from "./digitalDownload.service.js";
import { DigitalAssetStorageError } from "./digitalAssetStorage.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

const ORDER_ITEM_BASE = {
  id: "item-1",
  productName: "Test Colouring Book",
  digitalAsset: { displayName: "Test Colouring Book.pdf", mimeType: "application/pdf", fileSizeBytes: 1000, pageCount: 10, version: null, isActive: true },
  downloadLog: null,
};

// ---------------------------------------------------------------------------
// Part 3: payment-status entitlement gate (getPurchasedDigitalItemsForCustomerOrder)
// ---------------------------------------------------------------------------

test("PAID order: entitlement allowed, purchased digital items are returned", async () => {
  const orderFind = stub(prisma.order, "findUnique", async () => ({ id: "order-1", customerId: "cust-1", paymentStatus: "PAID" }));
  const itemsFind = stub(prisma.orderItem, "findMany", async () => [ORDER_ITEM_BASE]);

  const result = await getPurchasedDigitalItemsForCustomerOrder("SG-2026-TEST", "cust-1");

  assert.equal(result.length, 1);
  assert.equal(result[0]?.productName, "Test Colouring Book");
  orderFind.restore();
  itemsFind.restore();
});

for (const deniedStatus of ["PENDING", "FAILED", "CANCELLED", "REFUNDED"]) {
  test(`${deniedStatus} order: download denied (empty result), never lists items`, async () => {
    const orderFind = stub(prisma.order, "findUnique", async () => ({ id: "order-1", customerId: "cust-1", paymentStatus: deniedStatus }));
    const itemsFind = stub(prisma.orderItem, "findMany", async () => {
      throw new Error("must never be called — payment status gate should short-circuit before listing items");
    });

    const result = await getPurchasedDigitalItemsForCustomerOrder("SG-2026-TEST", "cust-1");

    assert.deepEqual(result, []);
    assert.equal(itemsFind.fn.mock.callCount(), 0);
    orderFind.restore();
    itemsFind.restore();
  });
}

test("no download is ever granted merely because an order exists — a found-but-unpaid order still denies", async () => {
  const orderFind = stub(prisma.order, "findUnique", async () => ({ id: "order-1", customerId: "cust-1", paymentStatus: "PENDING" }));
  const result = await getPurchasedDigitalItemsForCustomerOrder("SG-2026-TEST", "cust-1");
  assert.deepEqual(result, []);
  orderFind.restore();
});

// ---------------------------------------------------------------------------
// Part 4: customer ownership
// ---------------------------------------------------------------------------

test("correct logged-in customer can list their own purchased digital item", async () => {
  const orderFind = stub(prisma.order, "findUnique", async () => ({ id: "order-1", customerId: "cust-1", paymentStatus: "PAID" }));
  const itemsFind = stub(prisma.orderItem, "findMany", async () => [ORDER_ITEM_BASE]);

  const result = await getPurchasedDigitalItemsForCustomerOrder("SG-2026-TEST", "cust-1");
  assert.equal(result.length, 1);
  orderFind.restore();
  itemsFind.restore();
});

test("a different customer cannot access another customer's paid digital purchase (generic empty result, not an error)", async () => {
  const orderFind = stub(prisma.order, "findUnique", async () => ({ id: "order-1", customerId: "cust-owner", paymentStatus: "PAID" }));
  const itemsFind = stub(prisma.orderItem, "findMany", async () => {
    throw new Error("must never be called — ownership mismatch should short-circuit first");
  });

  const result = await getPurchasedDigitalItemsForCustomerOrder("SG-2026-TEST", "cust-attacker");

  assert.deepEqual(result, []);
  assert.equal(itemsFind.fn.mock.callCount(), 0);
  orderFind.restore();
  itemsFind.restore();
});

test("requestSignedDownloadUrlForCustomer: wrong customer receives the generic safe failure, never reveals the order exists", async () => {
  const itemFind = stub(prisma.orderItem, "findUnique", async () => ({ order: { customerId: "cust-owner" } }));

  await assert.rejects(
    () => requestSignedDownloadUrlForCustomer("item-1", "cust-attacker"),
    (err: unknown) => {
      assert.ok(err instanceof DigitalDownloadError);
      assert.equal(err.statusCode, 404);
      assert.equal(err.message, "Download not available.");
      return true;
    }
  );
  itemFind.restore();
});

// ---------------------------------------------------------------------------
// Part 3 (second entry point) + Part 7 (failure-side log): requestSignedDownloadUrlForCustomer
// entitlement re-check, and proof a denied request never writes a download log.
// ---------------------------------------------------------------------------

for (const deniedStatus of ["PENDING", "FAILED", "CANCELLED", "REFUNDED"]) {
  test(`requestSignedDownloadUrlForCustomer: ${deniedStatus} order denies download and never logs a download`, async () => {
    const itemFind = stub(prisma.orderItem, "findUnique", async (args: { select?: unknown }) => {
      // Both calls in this function use the same mock; the second
      // (loadDownloadableItem's own findUnique) needs the fuller shape.
      if (args?.select && "order" in (args.select as object) && Object.keys(args.select as object).length === 1) {
        return { order: { customerId: "cust-1" } };
      }
      return {
        productType: "DIGITAL",
        order: { paymentStatus: deniedStatus },
        digitalAsset: { id: "asset-1", storagePath: "path/to/file.pdf", isActive: true, product: { downloadEnabled: true } },
      };
    });
    const logUpsert = stub(prisma.digitalDownloadLog, "upsert", async () => ({}));

    await assert.rejects(
      () => requestSignedDownloadUrlForCustomer("item-1", "cust-1"),
      (err: unknown) => {
        assert.ok(err instanceof DigitalDownloadError);
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
    assert.equal(logUpsert.fn.mock.callCount(), 0, "a denied request must never write a DigitalDownloadLog row");
    itemFind.restore();
    logUpsert.restore();
  });
}

test("requestSignedDownloadUrlForCustomer: PAID order with an inactive digital asset still denies (asset must be active)", async () => {
  const itemFind = stub(prisma.orderItem, "findUnique", async (args: { select?: unknown }) => {
    if (args?.select && Object.keys(args.select as object).length === 1) return { order: { customerId: "cust-1" } };
    return {
      productType: "DIGITAL",
      order: { paymentStatus: "PAID" },
      digitalAsset: { id: "asset-1", storagePath: "path/to/file.pdf", isActive: false, product: { downloadEnabled: true } },
    };
  });

  await assert.rejects(() => requestSignedDownloadUrlForCustomer("item-1", "cust-1"), DigitalDownloadError);
  itemFind.restore();
});

test("requestSignedDownloadUrlForCustomer: PAID order with downloadEnabled=false on the product still denies", async () => {
  const itemFind = stub(prisma.orderItem, "findUnique", async (args: { select?: unknown }) => {
    if (args?.select && Object.keys(args.select as object).length === 1) return { order: { customerId: "cust-1" } };
    return {
      productType: "DIGITAL",
      order: { paymentStatus: "PAID" },
      digitalAsset: { id: "asset-1", storagePath: "path/to/file.pdf", isActive: true, product: { downloadEnabled: false } },
    };
  });

  await assert.rejects(() => requestSignedDownloadUrlForCustomer("item-1", "cust-1"), DigitalDownloadError);
  itemFind.restore();
});

// Part 6 (partial — see this milestone's final report for what remains
// untestable without mocking the storage layer): proves the
// entitlement GATE itself allows a genuinely PAID, owned, active,
// download-enabled item through to the signed-URL step — the request
// only fails afterward because this test environment has no real (or
// mocked) Supabase Storage configured, which throws a *different*
// error type (DigitalAssetStorageError, not DigitalDownloadError).
// That distinction is exactly what proves entitlement itself passed.
test("requestSignedDownloadUrlForCustomer: PAID+owned+active+enabled reaches the signed-URL step (entitlement gate passes)", async () => {
  const itemFind = stub(prisma.orderItem, "findUnique", async (args: { select?: unknown }) => {
    if (args?.select && Object.keys(args.select as object).length === 1) return { order: { customerId: "cust-1" } };
    return {
      productType: "DIGITAL",
      order: { paymentStatus: "PAID" },
      digitalAsset: { id: "asset-1", storagePath: "path/to/file.pdf", isActive: true, product: { downloadEnabled: true } },
    };
  });

  await assert.rejects(
    () => requestSignedDownloadUrlForCustomer("item-1", "cust-1"),
    (err: unknown) => {
      // NOT a DigitalDownloadError (which would mean entitlement was
      // denied) — a DigitalAssetStorageError/"not configured" error
      // here means the gate was passed and only the unrelated storage
      // layer blocked it.
      assert.ok(!(err instanceof DigitalDownloadError), "entitlement must not be denied for a genuinely PAID, owned, active item");
      return true;
    }
  );
  itemFind.restore();
});

// ---------------------------------------------------------------------------
// Part 5: guest token tests
// ---------------------------------------------------------------------------

test("unknown guest token: denied (record not found)", async () => {
  const tokenFind = stub(prisma.guestDownloadToken, "findUnique", async () => null);
  const result = await getPurchasedDigitalItemsForGuestToken("some-unknown-raw-token");
  assert.deepEqual(result, []);
  tokenFind.restore();
});

test("expired guest token: denied even though the order is PAID", async () => {
  const tokenFind = stub(prisma.guestDownloadToken, "findUnique", async () => ({
    id: "token-1",
    orderId: "order-1",
    expiresAt: new Date(Date.now() - 60_000),
    order: { paymentStatus: "PAID" },
  }));
  const result = await getPurchasedDigitalItemsForGuestToken("some-raw-token");
  assert.deepEqual(result, []);
  tokenFind.restore();
});

test("guest token tied to an unpaid order: denied", async () => {
  const tokenFind = stub(prisma.guestDownloadToken, "findUnique", async () => ({
    id: "token-1",
    orderId: "order-1",
    expiresAt: new Date(Date.now() + 60_000),
    order: { paymentStatus: "PENDING" },
  }));
  const result = await getPurchasedDigitalItemsForGuestToken("some-raw-token");
  assert.deepEqual(result, []);
  tokenFind.restore();
});

test("guest token tied to a PAID order: allowed, items listed", async () => {
  const tokenFind = stub(prisma.guestDownloadToken, "findUnique", async () => ({
    id: "token-1",
    orderId: "order-1",
    expiresAt: new Date(Date.now() + 60_000),
    order: { paymentStatus: "PAID" },
  }));
  const itemsFind = stub(prisma.orderItem, "findMany", async () => [ORDER_ITEM_BASE]);

  const result = await getPurchasedDigitalItemsForGuestToken("some-raw-token");
  assert.equal(result.length, 1);
  tokenFind.restore();
  itemsFind.restore();
});

test("guest token: the raw token is never queried directly — a SHA-256 hash is used for the lookup, matching what createGuestDownloadToken persists", async () => {
  const rawToken = "raw-guest-token-value";
  const expectedHash = createHash("sha256").update(rawToken).digest("hex");

  const tokenFind = stub(prisma.guestDownloadToken, "findUnique", async (args: { where: { tokenHash: string } }) => {
    assert.equal(args.where.tokenHash, expectedHash);
    assert.notEqual(args.where.tokenHash, rawToken, "the raw token must never be used directly as a lookup key");
    return null;
  });

  await getPurchasedDigitalItemsForGuestToken(rawToken);
  assert.equal(tokenFind.fn.mock.callCount(), 1);
  tokenFind.restore();
});

test("createGuestDownloadToken: only the token's hash is persisted, never the raw token; expiry is ~7 days out", async () => {
  let capturedData: { orderId: string; tokenHash: string; expiresAt: Date } | undefined;
  const tokenCreate = stub(prisma.guestDownloadToken, "create", async (args: { data: typeof capturedData }) => {
    capturedData = args.data;
    return {};
  });

  const rawToken = await createGuestDownloadToken("order-1");

  assert.ok(capturedData);
  assert.notEqual(capturedData!.tokenHash, rawToken, "the raw token must never be written to the database");
  assert.equal(capturedData!.tokenHash, createHash("sha256").update(rawToken).digest("hex"));
  const daysUntilExpiry = (capturedData!.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  assert.ok(daysUntilExpiry > 6.9 && daysUntilExpiry < 7.1, `expected ~7 day expiry, got ${daysUntilExpiry} days`);
  tokenCreate.restore();
});

test("requestSignedDownloadUrlForGuestToken: invalid/expired token gives a generic safe message, never confirms which case it was", async () => {
  const tokenFind = stub(prisma.guestDownloadToken, "findUnique", async () => null);

  await assert.rejects(
    () => requestSignedDownloadUrlForGuestToken("bad-token", "item-1"),
    (err: unknown) => {
      assert.ok(err instanceof DigitalDownloadError);
      assert.equal(err.message, "This download link is invalid or has expired.");
      return true;
    }
  );
  tokenFind.restore();
});

test("requestSignedDownloadUrlForGuestToken: a valid token cannot be used to reach an orderItem belonging to a different, unrelated order", async () => {
  const tokenFind = stub(prisma.guestDownloadToken, "findUnique", async () => ({
    id: "token-1",
    orderId: "order-mine",
    expiresAt: new Date(Date.now() + 60_000),
    order: { paymentStatus: "PAID" },
  }));
  const itemFind = stub(prisma.orderItem, "findUnique", async () => ({ orderId: "order-someone-elses" }));
  const logUpsert = stub(prisma.digitalDownloadLog, "upsert", async () => ({}));

  await assert.rejects(
    () => requestSignedDownloadUrlForGuestToken("valid-raw-token", "item-belonging-to-another-order"),
    (err: unknown) => {
      assert.ok(err instanceof DigitalDownloadError);
      assert.equal(err.message, "Download not available.");
      return true;
    }
  );
  assert.equal(logUpsert.fn.mock.callCount(), 0, "an unrelated-order access attempt must never write a download log");
  tokenFind.restore();
  itemFind.restore();
  logUpsert.restore();
});

// ---------------------------------------------------------------------------
// Version 7, Milestone 171A.1 — happy-path tests, made possible by the
// digitalAssetStorage seam (see this file's own header comment).
// ---------------------------------------------------------------------------

const DOWNLOADABLE_ITEM_SHAPE = {
  productType: "DIGITAL",
  order: { paymentStatus: "PAID" },
  digitalAsset: { id: "asset-1", storagePath: "digital-assets/product-1/123-book.pdf", isActive: true, product: { downloadEnabled: true } },
};

// Part 4: signed URL success (customer path) — proves the real
// SIGNED_URL_EXPIRY_SECONDS constant (300 = 5 minutes) is what's
// actually supplied to storage, without changing that value.
test("requestSignedDownloadUrlForCustomer: PAID+owned+active+enabled returns the real signed URL and the exact existing 300s (5 minute) expiry", async () => {
  const itemFind = stub(prisma.orderItem, "findUnique", async (args: { select?: unknown }) => {
    if (args?.select) return { order: { customerId: "cust-1" } };
    return DOWNLOADABLE_ITEM_SHAPE;
  });
  const logUpsert = stub(prisma.digitalDownloadLog, "upsert", async () => ({}));

  const originalCreateSignedUrl = digitalAssetStorage.createSignedDownloadUrl;
  let capturedPath: string | undefined;
  let capturedExpiry: number | undefined;
  digitalAssetStorage.createSignedDownloadUrl = (async (path: string, expiresIn: number) => {
    capturedPath = path;
    capturedExpiry = expiresIn;
    return "https://storage.example.com/signed/abc123";
  }) as typeof digitalAssetStorage.createSignedDownloadUrl;

  try {
    const result = await requestSignedDownloadUrlForCustomer("item-1", "cust-1");

    assert.equal(result.url, "https://storage.example.com/signed/abc123");
    assert.equal(result.expiresInSeconds, 300, "expiry returned to the caller must match the real production constant");
    assert.equal(capturedExpiry, 300, "expiry actually supplied to storage must be exactly 300 seconds (5 minutes) — the existing value, unchanged");
    assert.equal(capturedPath, "digital-assets/product-1/123-book.pdf");
  } finally {
    digitalAssetStorage.createSignedDownloadUrl = originalCreateSignedUrl;
    itemFind.restore();
    logUpsert.restore();
  }
});

// Part 4 (guest path) + Part 9: privacy assertion — the returned
// object exposes only {url, expiresInSeconds}, never storageBucket/
// storagePath or any other internal-location metadata.
test("requestSignedDownloadUrlForGuestToken: PAID token returns a real signed URL exposing only {url, expiresInSeconds}", async () => {
  const tokenFind = stub(prisma.guestDownloadToken, "findUnique", async () => ({
    id: "token-1",
    orderId: "order-1",
    expiresAt: new Date(Date.now() + 60_000),
    order: { paymentStatus: "PAID" },
  }));
  const itemFind = stub(prisma.orderItem, "findUnique", async (args: { select?: unknown }) => {
    if (args?.select) return { orderId: "order-1" };
    return DOWNLOADABLE_ITEM_SHAPE;
  });
  const logUpsert = stub(prisma.digitalDownloadLog, "upsert", async () => ({}));
  const tokenUpdate = stub(prisma.guestDownloadToken, "update", async () => ({}));

  const originalCreateSignedUrl = digitalAssetStorage.createSignedDownloadUrl;
  digitalAssetStorage.createSignedDownloadUrl = (async () => "https://storage.example.com/signed/guest-xyz") as typeof digitalAssetStorage.createSignedDownloadUrl;

  try {
    const result = await requestSignedDownloadUrlForGuestToken("valid-raw-token", "item-1");

    assert.equal(result.url, "https://storage.example.com/signed/guest-xyz");
    assert.equal(result.expiresInSeconds, 300);
    assert.deepEqual(
      Object.keys(result).sort(),
      ["expiresInSeconds", "url"],
      "the response must expose only url + expiresInSeconds — never storageBucket/storagePath or any other internal metadata"
    );
    // @ts-expect-error deliberately checking for absence of internal fields not on the type
    assert.equal(result.storagePath, undefined);
    // @ts-expect-error deliberately checking for absence of internal fields not on the type
    assert.equal(result.storageBucket, undefined);
  } finally {
    digitalAssetStorage.createSignedDownloadUrl = originalCreateSignedUrl;
    tokenFind.restore();
    itemFind.restore();
    logUpsert.restore();
    tokenUpdate.restore();
  }
});

// Part 5: DigitalDownloadLog success — a genuinely successful signed-URL
// issuance calls upsert() with the shape that increments an existing
// row or creates a fresh one at count 1, tied to the correct orderItemId.
test("a successful signed-URL issuance creates/updates DigitalDownloadLog correctly, tied to the right orderItemId", async () => {
  const itemFind = stub(prisma.orderItem, "findUnique", async (args: { select?: unknown }) => {
    if (args?.select) return { order: { customerId: "cust-1" } };
    return DOWNLOADABLE_ITEM_SHAPE;
  });

  let capturedUpsertArgs: { where: { orderItemId: string }; create: { orderItemId: string; digitalAssetId: string; customerId: string | null; downloadCount: number }; update: { downloadCount: { increment: number } } } | undefined;
  const logUpsert = stub(prisma.digitalDownloadLog, "upsert", async (args: typeof capturedUpsertArgs) => {
    capturedUpsertArgs = args;
    return {};
  });

  const originalCreateSignedUrl = digitalAssetStorage.createSignedDownloadUrl;
  digitalAssetStorage.createSignedDownloadUrl = (async () => "https://storage.example.com/signed/log-test") as typeof digitalAssetStorage.createSignedDownloadUrl;

  try {
    await requestSignedDownloadUrlForCustomer("item-1", "cust-1");

    assert.equal(logUpsert.fn.mock.callCount(), 1);
    assert.ok(capturedUpsertArgs);
    assert.equal(capturedUpsertArgs!.where.orderItemId, "item-1");
    assert.equal(capturedUpsertArgs!.create.orderItemId, "item-1");
    assert.equal(capturedUpsertArgs!.create.digitalAssetId, "asset-1");
    assert.equal(capturedUpsertArgs!.create.customerId, "cust-1");
    assert.equal(capturedUpsertArgs!.create.downloadCount, 1, "a fresh log row starts at download count 1");
    assert.equal(capturedUpsertArgs!.update.downloadCount.increment, 1, "an existing log row increments by 1 on every further download");
  } finally {
    digitalAssetStorage.createSignedDownloadUrl = originalCreateSignedUrl;
    itemFind.restore();
    logUpsert.restore();
  }
});

// Part 8: signed-URL generation failure — a real Storage-layer failure
// must surface as the existing safe DigitalAssetStorageError (never a
// raw Supabase error/internal path), and must never log a download.
test("a Storage-layer signed-URL failure surfaces the existing safe error and never logs a download", async () => {
  const itemFind = stub(prisma.orderItem, "findUnique", async (args: { select?: unknown }) => {
    if (args?.select) return { order: { customerId: "cust-1" } };
    return DOWNLOADABLE_ITEM_SHAPE;
  });
  const logUpsert = stub(prisma.digitalDownloadLog, "upsert", async () => ({}));

  const originalCreateSignedUrl = digitalAssetStorage.createSignedDownloadUrl;
  digitalAssetStorage.createSignedDownloadUrl = (async () => {
    throw new DigitalAssetStorageError("Could not generate a download link right now. Please try again shortly.", 502);
  }) as typeof digitalAssetStorage.createSignedDownloadUrl;

  try {
    await assert.rejects(
      () => requestSignedDownloadUrlForCustomer("item-1", "cust-1"),
      (err: unknown) => {
        assert.ok(err instanceof DigitalAssetStorageError);
        // Never a raw Supabase message/path — the existing generic-safe message.
        assert.equal((err as Error).message, "Could not generate a download link right now. Please try again shortly.");
        return true;
      }
    );
    assert.equal(logUpsert.fn.mock.callCount(), 0, "a failed signed-URL attempt must never write a download log");
  } finally {
    digitalAssetStorage.createSignedDownloadUrl = originalCreateSignedUrl;
    itemFind.restore();
    logUpsert.restore();
  }
});
