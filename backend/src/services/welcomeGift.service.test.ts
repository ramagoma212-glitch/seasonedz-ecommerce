// Milestone 189: dedicated tests for welcomeGift.service.ts — the one
// place that decides "should this customer receive the gift right now"
// and "is this token/asset-key pair allowed to download anything".
// Same stub()-based Prisma mocking approach as digitalDownload.service.test.ts
// (see that file's own header comment for why: Prisma's model delegates
// are Proxy objects that node:test's mock.method() can't capture, but
// direct property assignment against the same proxy works).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { digitalAssetStorage } from "./digitalAssetStorage.service.js";
import { maybeSendGuestWelcomeGift, maybeSendWelcomeGift, resolveWelcomeGiftDownload, WELCOME_GIFT_ASSET_KEYS } from "./welcomeGift.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`customerId`)", { code: "P2002", clientVersion: "5.22.0" });
}

const CONFIGURED_ASSET_ROWS = WELCOME_GIFT_ASSET_KEYS.map((assetKey) => ({ assetKey, isConfigured: true }));

// ---------------------------------------------------------------------------
// maybeSendWelcomeGift — kill switch / configuration gates
// ---------------------------------------------------------------------------

test("maybeSendWelcomeGift: WELCOME_GIFT_ENABLED=false is a silent no-op, never touches the database", async () => {
  const originalEnabled = env.welcomeGiftEnabled;
  env.welcomeGiftEnabled = false;

  const assetFind = stub(prisma.welcomeGiftAsset, "findMany", async () => {
    throw new Error("must never be called — the enabled flag should short-circuit first");
  });

  await maybeSendWelcomeGift("cust-1");

  assert.equal(assetFind.fn.mock.callCount(), 0);
  assetFind.restore();
  env.welcomeGiftEnabled = originalEnabled;
});

test("maybeSendWelcomeGift: enabled but not all three assets configured — skips, never creates a delivery row", async () => {
  const originalEnabled = env.welcomeGiftEnabled;
  env.welcomeGiftEnabled = true;

  const assetFind = stub(prisma.welcomeGiftAsset, "findMany", async () => [
    { assetKey: "abc_sample", isConfigured: true },
    { assetKey: "mindfulness_sample", isConfigured: false },
    { assetKey: "creative_activity_sample", isConfigured: true },
  ]);
  const deliveryCreate = stub(prisma.welcomeGiftDelivery, "create", async () => {
    throw new Error("must never be called — not every asset is configured");
  });

  await maybeSendWelcomeGift("cust-1");

  assert.equal(deliveryCreate.fn.mock.callCount(), 0);
  assetFind.restore();
  deliveryCreate.restore();
  env.welcomeGiftEnabled = originalEnabled;
});

// ---------------------------------------------------------------------------
// maybeSendWelcomeGift — one-time-delivery guarantee
// ---------------------------------------------------------------------------

test("maybeSendWelcomeGift: a concurrent/duplicate trigger for an already-claimed customer silently no-ops (P2002)", async () => {
  const originalEnabled = env.welcomeGiftEnabled;
  const originalEmailEnabled = env.emailEnabled;
  env.welcomeGiftEnabled = true;
  env.emailEnabled = true;

  const assetFind = stub(prisma.welcomeGiftAsset, "findMany", async () => CONFIGURED_ASSET_ROWS);
  const customerFind = stub(prisma.customer, "findUnique", async () => ({ id: "cust-1", email: "jane@example.com", firstName: "Jane", isActive: true }));
  const deliveryCreate = stub(prisma.welcomeGiftDelivery, "create", async () => {
    throw uniqueConstraintError();
  });
  const deliveryUpdate = stub(prisma.welcomeGiftDelivery, "update", async () => {
    throw new Error("must never be called — the create() already lost the race");
  });

  await maybeSendWelcomeGift("cust-1");

  assert.equal(deliveryCreate.fn.mock.callCount(), 1);
  assert.equal(deliveryUpdate.fn.mock.callCount(), 0);

  assetFind.restore();
  customerFind.restore();
  deliveryCreate.restore();
  deliveryUpdate.restore();
  env.welcomeGiftEnabled = originalEnabled;
  env.emailEnabled = originalEmailEnabled;
});

test("maybeSendWelcomeGift: first-ever trigger claims the row, sends, then marks SENT", async () => {
  const originalEnabled = env.welcomeGiftEnabled;
  const originalEmailEnabled = env.emailEnabled;
  const originalProvider = env.emailProvider;
  env.welcomeGiftEnabled = true;
  env.emailEnabled = false; // deterministic: sendWelcomeGiftEmail() returns true immediately, no Brevo involved

  const assetFindMany = stub(prisma.welcomeGiftAsset, "findMany", async () => CONFIGURED_ASSET_ROWS);
  const customerFind = stub(prisma.customer, "findUnique", async () => ({ id: "cust-1", email: "jane@example.com", firstName: "Jane", isActive: true }));
  const deliveryCreate = stub(prisma.welcomeGiftDelivery, "create", async (args: any) => ({ id: "delivery-1", ...args.data }));
  const deliveryUpdate = stub(prisma.welcomeGiftDelivery, "update", async (args: any) => args);

  await maybeSendWelcomeGift("cust-1");

  assert.equal(deliveryCreate.fn.mock.callCount(), 1);
  assert.equal(deliveryUpdate.fn.mock.callCount(), 1);
  const updateArgs = deliveryUpdate.fn.mock.calls[0]?.arguments[0];
  assert.equal(updateArgs.where.id, "delivery-1");
  assert.equal(updateArgs.data.status, "SENT");
  assert.ok(updateArgs.data.sentAt instanceof Date);

  assetFindMany.restore();
  customerFind.restore();
  deliveryCreate.restore();
  deliveryUpdate.restore();
  env.welcomeGiftEnabled = originalEnabled;
  env.emailEnabled = originalEmailEnabled;
  env.emailProvider = originalProvider;
});

test("maybeSendWelcomeGift: a genuine Brevo delivery failure marks FAILED, never SENT, never throws", async () => {
  const originalEnabled = env.welcomeGiftEnabled;
  const originalEmailEnabled = env.emailEnabled;
  const originalProvider = env.emailProvider;
  env.welcomeGiftEnabled = true;
  env.emailEnabled = true;
  env.emailProvider = "not-a-real-provider"; // deterministic: sendWelcomeGiftEmail() hits its "not implemented" branch and returns false

  const assetFindMany = stub(prisma.welcomeGiftAsset, "findMany", async () => CONFIGURED_ASSET_ROWS);
  const customerFind = stub(prisma.customer, "findUnique", async () => ({ id: "cust-1", email: "jane@example.com", firstName: "Jane", isActive: true }));
  const deliveryCreate = stub(prisma.welcomeGiftDelivery, "create", async (args: any) => ({ id: "delivery-1", ...args.data }));
  const deliveryUpdate = stub(prisma.welcomeGiftDelivery, "update", async (args: any) => args);

  await maybeSendWelcomeGift("cust-1");

  const updateArgs = deliveryUpdate.fn.mock.calls[0]?.arguments[0];
  assert.equal(updateArgs.data.status, "FAILED");
  assert.ok(updateArgs.data.failedAt instanceof Date);
  assert.equal(updateArgs.data.status === "SENT", false);

  assetFindMany.restore();
  customerFind.restore();
  deliveryCreate.restore();
  deliveryUpdate.restore();
  env.welcomeGiftEnabled = originalEnabled;
  env.emailEnabled = originalEmailEnabled;
  env.emailProvider = originalProvider;
});

// ---------------------------------------------------------------------------
// maybeSendWelcomeGift — first-name reliability (brief Part T)
// ---------------------------------------------------------------------------

test('maybeSendWelcomeGift: a placeholder "Customer" first name (social sign-up fallback) is not treated as reliably available', async () => {
  const originalEnabled = env.welcomeGiftEnabled;
  const originalEmailEnabled = env.emailEnabled;
  env.welcomeGiftEnabled = true;
  env.emailEnabled = false;

  const assetFindMany = stub(prisma.welcomeGiftAsset, "findMany", async () => CONFIGURED_ASSET_ROWS);
  const customerFind = stub(prisma.customer, "findUnique", async () => ({ id: "cust-2", email: "someone@example.com", firstName: "Customer", isActive: true }));
  const deliveryCreate = stub(prisma.welcomeGiftDelivery, "create", async (args: any) => ({ id: "delivery-2", ...args.data }));
  const deliveryUpdate = stub(prisma.welcomeGiftDelivery, "update", async (args: any) => args);

  // console-mode logging is the only observable side effect here since
  // email.service.ts isn't itself mocked — this test only needs to
  // confirm maybeSendWelcomeGift completes and marks SENT without
  // throwing when firstName is the literal placeholder value.
  await maybeSendWelcomeGift("cust-2");

  assert.equal(deliveryUpdate.fn.mock.calls[0]?.arguments[0].data.status, "SENT");

  assetFindMany.restore();
  customerFind.restore();
  deliveryCreate.restore();
  deliveryUpdate.restore();
  env.welcomeGiftEnabled = originalEnabled;
  env.emailEnabled = originalEmailEnabled;
});

// ---------------------------------------------------------------------------
// resolveWelcomeGiftDownload — strict allowlist, no enumeration
// ---------------------------------------------------------------------------

test("resolveWelcomeGiftDownload: an asset key outside the fixed allowlist is rejected without ever querying the database", async () => {
  const deliveryFind = stub(prisma.welcomeGiftDelivery, "findUnique", async () => {
    throw new Error("must never be called — the asset-key allowlist check must short-circuit first");
  });

  const result = await resolveWelcomeGiftDownload("some-raw-token", "../../etc/passwd");

  assert.equal(result, null);
  assert.equal(deliveryFind.fn.mock.callCount(), 0);
  deliveryFind.restore();
});

test("resolveWelcomeGiftDownload: unknown token hash returns null (not found), never throws", async () => {
  const deliveryFind = stub(prisma.welcomeGiftDelivery, "findUnique", async () => null);
  // Not in the customer table falls back to the guest table (see the
  // "falls back to the guest table" test below) — stubbed here too so
  // this test stays fully isolated (no real network call) and still
  // covers "genuinely unknown everywhere" returning null.
  const guestFind = stub(prisma.guestWelcomeGiftDelivery, "findUnique", async () => null);

  const result = await resolveWelcomeGiftDownload("some-raw-token", "abc_sample");

  assert.equal(result, null);
  deliveryFind.restore();
  guestFind.restore();
});

test("resolveWelcomeGiftDownload: an expired token is rejected", async () => {
  const deliveryFind = stub(prisma.welcomeGiftDelivery, "findUnique", async () => ({ expiresAt: new Date(Date.now() - 1000) }));

  const result = await resolveWelcomeGiftDownload("some-raw-token", "abc_sample");

  assert.equal(result, null);
  deliveryFind.restore();
});

test("resolveWelcomeGiftDownload: a valid token but a not-yet-configured asset is rejected", async () => {
  const deliveryFind = stub(prisma.welcomeGiftDelivery, "findUnique", async () => ({ expiresAt: new Date(Date.now() + 1000 * 60) }));
  const assetFind = stub(prisma.welcomeGiftAsset, "findUnique", async () => ({ isConfigured: false, storagePath: null, displayName: "ABC Learning Sample" }));

  const result = await resolveWelcomeGiftDownload("some-raw-token", "abc_sample");

  assert.equal(result, null);
  deliveryFind.restore();
  assetFind.restore();
});

test("resolveWelcomeGiftDownload: a valid token and configured asset returns a freshly-generated signed URL", async () => {
  const deliveryFind = stub(prisma.welcomeGiftDelivery, "findUnique", async () => ({ expiresAt: new Date(Date.now() + 1000 * 60) }));
  const assetFind = stub(prisma.welcomeGiftAsset, "findUnique", async () => ({ isConfigured: true, storagePath: "welcome-gift/abc_sample/123-file.pdf", displayName: "ABC Learning Sample" }));
  const signedUrl = stub(digitalAssetStorage, "createSignedDownloadUrl", async () => "https://signed.example.com/fresh-url");

  const result = await resolveWelcomeGiftDownload("some-raw-token", "abc_sample");

  assert.deepEqual(result, { signedUrl: "https://signed.example.com/fresh-url", displayName: "ABC Learning Sample" });
  assert.equal(signedUrl.fn.mock.callCount(), 1);
  deliveryFind.restore();
  assetFind.restore();
  signedUrl.restore();
});

test("resolveWelcomeGiftDownload: looks up by the hash of the token, never a raw stored token", async () => {
  let capturedWhere: any = null;
  const deliveryFind = stub(prisma.welcomeGiftDelivery, "findUnique", async (args: any) => {
    capturedWhere = args.where;
    return null;
  });
  const guestFind = stub(prisma.guestWelcomeGiftDelivery, "findUnique", async () => null);

  await resolveWelcomeGiftDownload("plain-raw-token-value", "abc_sample");

  assert.equal(capturedWhere.tokenHash, createHash("sha256").update("plain-raw-token-value").digest("hex"));
  assert.notEqual(capturedWhere.tokenHash, "plain-raw-token-value");
  deliveryFind.restore();
  guestFind.restore();
});

test("resolveWelcomeGiftDownload: falls back to the guest table when no customer delivery matches, and still works", async () => {
  const customerFind = stub(prisma.welcomeGiftDelivery, "findUnique", async () => null);
  const guestFind = stub(prisma.guestWelcomeGiftDelivery, "findUnique", async () => ({ expiresAt: new Date(Date.now() + 1000 * 60) }));
  const assetFind = stub(prisma.welcomeGiftAsset, "findUnique", async () => ({ isConfigured: true, storagePath: "welcome-gift/abc_sample/123-file.pdf", displayName: "ABC Learning Sample" }));
  const signedUrl = stub(digitalAssetStorage, "createSignedDownloadUrl", async () => "https://signed.example.com/guest-url");

  const result = await resolveWelcomeGiftDownload("some-raw-token", "abc_sample");

  assert.deepEqual(result, { signedUrl: "https://signed.example.com/guest-url", displayName: "ABC Learning Sample" });
  assert.equal(customerFind.fn.mock.callCount(), 1);
  assert.equal(guestFind.fn.mock.callCount(), 1);
  customerFind.restore();
  guestFind.restore();
  assetFind.restore();
  signedUrl.restore();
});

test("resolveWelcomeGiftDownload: guest table not existing yet (migration not applied) behaves exactly like 'not found', never throws", async () => {
  const customerFind = stub(prisma.welcomeGiftDelivery, "findUnique", async () => null);
  const guestFind = stub(prisma.guestWelcomeGiftDelivery, "findUnique", async () => {
    throw new Prisma.PrismaClientKnownRequestError('The table `public.GuestWelcomeGiftDelivery` does not exist', { code: "P2021", clientVersion: "5.22.0" });
  });

  const result = await resolveWelcomeGiftDownload("some-raw-token", "abc_sample");

  assert.equal(result, null);
  customerFind.restore();
  guestFind.restore();
});

// ---------------------------------------------------------------------------
// maybeSendGuestWelcomeGift — email normalisation (canonical identity)
// ---------------------------------------------------------------------------
//
// GuestWelcomeGiftDelivery.customerEmail is a plain case-SENSITIVE unique
// column (no citext, no functional lower(email) index) — so the one-time
// guarantee only holds if the APPLICATION always normalises (trim +
// lowercase) before every create/lookup. These tests prove that
// contract directly, independent of whether the real table exists yet.

const EMAIL_VARIANTS = ["person@example.com", "Person@Example.com", " person@example.com "];
const CANONICAL_EMAIL = "person@example.com";

for (const variant of EMAIL_VARIANTS) {
  test(`maybeSendGuestWelcomeGift: "${variant}" normalises to the canonical identity before create()`, async () => {
    const originalEnabled = env.welcomeGiftEnabled;
    const originalEmailEnabled = env.emailEnabled;
    env.welcomeGiftEnabled = true;
    env.emailEnabled = false; // deterministic send, no Brevo involved

    const assetFindMany = stub(prisma.welcomeGiftAsset, "findMany", async () => CONFIGURED_ASSET_ROWS);
    let capturedEmail: string | null = null;
    const guestCreate = stub(prisma.guestWelcomeGiftDelivery, "create", async (args: any) => {
      capturedEmail = args.data.customerEmail;
      return { id: "guest-delivery-1", ...args.data };
    });
    const guestUpdate = stub(prisma.guestWelcomeGiftDelivery, "update", async (args: any) => args);

    await maybeSendGuestWelcomeGift(variant, "Jane");

    assert.equal(guestCreate.fn.mock.callCount(), 1);
    assert.equal(capturedEmail, CANONICAL_EMAIL, `"${variant}" must normalise to "${CANONICAL_EMAIL}" before create(), got "${capturedEmail}"`);

    assetFindMany.restore();
    guestCreate.restore();
    guestUpdate.restore();
    env.welcomeGiftEnabled = originalEnabled;
    env.emailEnabled = originalEmailEnabled;
  });
}

test("maybeSendGuestWelcomeGift: three casing/whitespace variants of the same email all collide on the same canonical row (real one-time-gate behaviour)", async () => {
  const originalEnabled = env.welcomeGiftEnabled;
  const originalEmailEnabled = env.emailEnabled;
  env.welcomeGiftEnabled = true;
  env.emailEnabled = false;

  const assetFindMany = stub(prisma.welcomeGiftAsset, "findMany", async () => CONFIGURED_ASSET_ROWS);

  // Simulates the real unique-index behaviour: the FIRST call to reach
  // this canonical email succeeds; every subsequent call for any
  // casing/whitespace variant of the identical address collides on the
  // same row, exactly as Postgres's UNIQUE("customerEmail") would
  // enforce once every write is normalised first.
  const claimedEmails = new Set<string>();
  const guestCreate = stub(prisma.guestWelcomeGiftDelivery, "create", async (args: any) => {
    const email = args.data.customerEmail;
    if (claimedEmails.has(email)) throw uniqueConstraintError();
    claimedEmails.add(email);
    return { id: "guest-delivery-1", ...args.data };
  });
  const guestUpdate = stub(prisma.guestWelcomeGiftDelivery, "update", async (args: any) => args);

  for (const variant of EMAIL_VARIANTS) {
    await maybeSendGuestWelcomeGift(variant, "Jane");
  }

  assert.equal(guestCreate.fn.mock.callCount(), 3, "create() is attempted on every call (the DB is the one deciding who wins)");
  assert.equal(guestUpdate.fn.mock.callCount(), 1, "only the first call's row is ever updated to SENT — the other two lost the unique-constraint race and stopped");
  assert.equal(claimedEmails.size, 1, "all three variants collapsed onto exactly one canonical row");

  assetFindMany.restore();
  guestCreate.restore();
  guestUpdate.restore();
  env.welcomeGiftEnabled = originalEnabled;
  env.emailEnabled = originalEmailEnabled;
});

// ---------------------------------------------------------------------------
// maybeSendGuestWelcomeGift — configuration gates, one-time gate, happy path
// ---------------------------------------------------------------------------

test("maybeSendGuestWelcomeGift: WELCOME_GIFT_ENABLED=false is a silent no-op, never touches the database", async () => {
  const originalEnabled = env.welcomeGiftEnabled;
  env.welcomeGiftEnabled = false;

  const assetFind = stub(prisma.welcomeGiftAsset, "findMany", async () => {
    throw new Error("must never be called — the enabled flag should short-circuit first");
  });

  await maybeSendGuestWelcomeGift("guest@example.com", "Guest");

  assert.equal(assetFind.fn.mock.callCount(), 0);
  assetFind.restore();
  env.welcomeGiftEnabled = originalEnabled;
});

test("maybeSendGuestWelcomeGift: a concurrent/duplicate trigger for an already-delivered email silently no-ops (P2002)", async () => {
  const originalEnabled = env.welcomeGiftEnabled;
  const originalEmailEnabled = env.emailEnabled;
  env.welcomeGiftEnabled = true;
  env.emailEnabled = true;

  const assetFind = stub(prisma.welcomeGiftAsset, "findMany", async () => CONFIGURED_ASSET_ROWS);
  const guestCreate = stub(prisma.guestWelcomeGiftDelivery, "create", async () => {
    throw uniqueConstraintError();
  });
  const guestUpdate = stub(prisma.guestWelcomeGiftDelivery, "update", async () => {
    throw new Error("must never be called — the create() already lost the race");
  });

  await maybeSendGuestWelcomeGift("guest@example.com", "Guest");

  assert.equal(guestCreate.fn.mock.callCount(), 1);
  assert.equal(guestUpdate.fn.mock.callCount(), 0);

  assetFind.restore();
  guestCreate.restore();
  guestUpdate.restore();
  env.welcomeGiftEnabled = originalEnabled;
  env.emailEnabled = originalEmailEnabled;
});

test("maybeSendGuestWelcomeGift: first-ever trigger claims the row, sends with an account-creation invite, then marks SENT", async () => {
  const originalEnabled = env.welcomeGiftEnabled;
  const originalEmailEnabled = env.emailEnabled;
  env.welcomeGiftEnabled = true;
  env.emailEnabled = false;

  const assetFindMany = stub(prisma.welcomeGiftAsset, "findMany", async () => CONFIGURED_ASSET_ROWS);
  const guestCreate = stub(prisma.guestWelcomeGiftDelivery, "create", async (args: any) => ({ id: "guest-delivery-1", ...args.data }));
  const guestUpdate = stub(prisma.guestWelcomeGiftDelivery, "update", async (args: any) => args);

  await maybeSendGuestWelcomeGift("Guest@Example.com", "Guest");

  assert.equal(guestCreate.fn.mock.callCount(), 1);
  assert.equal(guestCreate.fn.mock.calls[0]?.arguments[0].data.customerEmail, "guest@example.com");
  assert.equal(guestUpdate.fn.mock.callCount(), 1);
  const updateArgs = guestUpdate.fn.mock.calls[0]?.arguments[0];
  assert.equal(updateArgs.where.id, "guest-delivery-1");
  assert.equal(updateArgs.data.status, "SENT");
  assert.ok(updateArgs.data.sentAt instanceof Date);

  assetFindMany.restore();
  guestCreate.restore();
  guestUpdate.restore();
  env.welcomeGiftEnabled = originalEnabled;
  env.emailEnabled = originalEmailEnabled;
});
