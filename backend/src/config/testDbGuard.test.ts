// Version 7, Milestone 174C, section 0/59: tests for the permanent
// test-database safety guard itself — see testDbGuard.ts's own header
// comment for the full design. evaluateTestDatabaseSafety() and
// installProductionWriteGuard() are both pure/deterministic enough to
// test directly without spawning a real process or touching this
// process's own real prisma client.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateTestDatabaseSafety,
  installProductionWriteGuard,
  isRunningTestFiles,
  ProductionWriteBlockedError,
} from "./testDbGuard.js";

const KNOWN_PRODUCTION_DATABASE_URL = "postgresql://postgres.mswnhwsksocsrbcrdzyb:realpassword@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true";
const KNOWN_PRODUCTION_DIRECT_URL = "postgresql://postgres.mswnhwsksocsrbcrdzyb:realpassword@aws-0-eu-central-1.pooler.supabase.com:5432/postgres";
const UNRECOGNISED_DATABASE_URL = "postgresql://postgres.someOtherProjectRef:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";

test("isRunningTestFiles: true when an argv entry ends in .test.ts (bash-expanded single file)", () => {
  assert.equal(isRunningTestFiles(["node", "/path/to/order.controller.test.ts"]), true);
});

test("isRunningTestFiles: true when an argv entry ends in .test.js (compiled)", () => {
  assert.equal(isRunningTestFiles(["node", "/path/to/order.controller.test.js"]), true);
});

test("isRunningTestFiles: true for the literal, unexpanded glob pattern (a shell with no ** expansion of its own)", () => {
  assert.equal(isRunningTestFiles(["node", "tsx", "--test", "src/**/*.test.ts"]), true);
});

test("isRunningTestFiles: false for a real app/script invocation", () => {
  assert.equal(isRunningTestFiles(["node", "dist/server.js"]), false);
  assert.equal(isRunningTestFiles(["node", "prisma/scripts/processNotifications.ts"]), false);
});

test("evaluateTestDatabaseSafety: refuses when DATABASE_URL resolves to the known production project and no acknowledgment is set", () => {
  const result = evaluateTestDatabaseSafety({ DATABASE_URL: KNOWN_PRODUCTION_DATABASE_URL } as NodeJS.ProcessEnv);
  assert.equal(result.safe, false);
  assert.match(result.reason ?? "", /Refusing to start/);
  // Never leaks the password even in its own explanatory message.
  assert.doesNotMatch(result.reason ?? "", /realpassword/);
});

test("evaluateTestDatabaseSafety: refuses when only DIRECT_URL resolves to the known production project", () => {
  const result = evaluateTestDatabaseSafety({ DIRECT_URL: KNOWN_PRODUCTION_DIRECT_URL } as NodeJS.ProcessEnv);
  assert.equal(result.safe, false);
});

test("evaluateTestDatabaseSafety: safe once explicitly acknowledged, even though it is still the known production project", () => {
  const result = evaluateTestDatabaseSafety({
    DATABASE_URL: KNOWN_PRODUCTION_DATABASE_URL,
    TEST_DB_ACKNOWLEDGE_SHARED_PRODUCTION: "true",
  } as NodeJS.ProcessEnv);
  assert.equal(result.safe, true);
});

test("evaluateTestDatabaseSafety: an acknowledgment value other than the exact string \"true\" does not count", () => {
  const result = evaluateTestDatabaseSafety({
    DATABASE_URL: KNOWN_PRODUCTION_DATABASE_URL,
    TEST_DB_ACKNOWLEDGE_SHARED_PRODUCTION: "1",
  } as NodeJS.ProcessEnv);
  assert.equal(result.safe, false);
});

test("evaluateTestDatabaseSafety: a genuinely unrecognised project needs no acknowledgment at all", () => {
  const result = evaluateTestDatabaseSafety({ DATABASE_URL: UNRECOGNISED_DATABASE_URL } as NodeJS.ProcessEnv);
  assert.equal(result.safe, true);
});

test("evaluateTestDatabaseSafety: a missing DATABASE_URL/DIRECT_URL entirely is treated as safe (nothing to resolve to production)", () => {
  const result = evaluateTestDatabaseSafety({} as NodeJS.ProcessEnv);
  assert.equal(result.safe, true);
});

test("evaluateTestDatabaseSafety: a malformed connection string never throws — treated as not-production, not a crash", () => {
  const result = evaluateTestDatabaseSafety({ DATABASE_URL: "not a real url at all" } as NodeJS.ProcessEnv);
  assert.equal(result.safe, true);
});

// ---------------------------------------------------------------------------
// installProductionWriteGuard
// ---------------------------------------------------------------------------

function fakePrismaClient() {
  return {
    // Meta/internal properties a real PrismaClient also carries —
    // must never be touched by the guard.
    $extends: () => {},
    _engine: {},
    notification: {
      findUnique: async () => ({ id: "n1" }),
      findMany: async () => [],
      create: async () => ({ id: "n1" }),
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
      upsert: async () => ({}),
      delete: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
    },
    $transaction: async (cb: unknown) => (typeof cb === "function" ? (cb as (x: unknown) => unknown)(undefined) : cb),
    $executeRaw: async () => 0,
    $queryRaw: async () => [],
  };
}

test("installProductionWriteGuard: a real (unstubbed) create/update/delete call throws ProductionWriteBlockedError", async () => {
  const client = fakePrismaClient();
  installProductionWriteGuard(client);

  await assert.rejects(() => client.notification.create(), ProductionWriteBlockedError);
  await assert.rejects(() => client.notification.update(), ProductionWriteBlockedError);
  await assert.rejects(() => client.notification.updateMany(), ProductionWriteBlockedError);
  await assert.rejects(() => client.notification.upsert(), ProductionWriteBlockedError);
  await assert.rejects(() => client.notification.delete(), ProductionWriteBlockedError);
  await assert.rejects(() => client.notification.deleteMany(), ProductionWriteBlockedError);
});

test("installProductionWriteGuard: read methods (findUnique/findMany) are left completely untouched", async () => {
  const client = fakePrismaClient();
  installProductionWriteGuard(client);

  const found = await client.notification.findUnique();
  assert.deepEqual(found, { id: "n1" });
  const many = await client.notification.findMany();
  assert.deepEqual(many, []);
});

test("installProductionWriteGuard: a real (unstubbed) $transaction call is blocked too — a callback's own tx would otherwise bypass the per-model wrapper", async () => {
  const client = fakePrismaClient();
  installProductionWriteGuard(client);

  await assert.rejects(() => client.$transaction(async () => {}), ProductionWriteBlockedError);
});

test("installProductionWriteGuard: $executeRaw is blocked, but $queryRaw (a read) is left untouched", async () => {
  const client = fakePrismaClient();
  installProductionWriteGuard(client);

  await assert.rejects(() => client.$executeRaw(), ProductionWriteBlockedError);
  const rows = await client.$queryRaw();
  assert.deepEqual(rows, []);
});

test("installProductionWriteGuard: a test's own stub() (capturing the guard as \"original\") still works exactly as before", async () => {
  const client = fakePrismaClient();
  installProductionWriteGuard(client);

  // The exact stub()/restore() shape used throughout this codebase's
  // test suite — captures whatever is currently installed (the guard's
  // blockedFn) as `original`.
  const original = client.notification.create;
  let called = false;
  client.notification.create = (async () => {
    called = true;
    return { id: "stubbed" };
  }) as typeof client.notification.create;

  const result = await client.notification.create();
  assert.equal(called, true);
  assert.deepEqual(result, { id: "stubbed" });

  // Restoring mid-test puts the GUARD back, not a real unguarded
  // method — exactly the property that would have caught 174B's leak.
  client.notification.create = original;
  await assert.rejects(() => client.notification.create(), ProductionWriteBlockedError);
});

test("installProductionWriteGuard: never touches $extends or other internal/meta properties", () => {
  const client = fakePrismaClient();
  const originalExtends = client.$extends;
  installProductionWriteGuard(client);
  assert.equal(client.$extends, originalExtends);
});
