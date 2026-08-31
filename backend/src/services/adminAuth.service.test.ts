// Milestone 179: adminAuth.service.ts had no dedicated test file before
// this milestone. Covers password strength policy, the "identical null
// result for every failure case" discipline verifyPassword relies on
// for a generic login error (brief section 17), and the session
// lifecycle (create/validate/destroy/revoke-all).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import {
  createSession,
  destroySession,
  hashPassword,
  recordCompletedLogin,
  revokeAllSessions,
  validateAdminPasswordStrength,
  validateSession,
  verifyPassword,
} from "./adminAuth.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

const STRONG_PASSWORD = "correct horse battery staple";

test("validateAdminPasswordStrength: rejects anything under 12 characters", () => {
  assert.notEqual(validateAdminPasswordStrength("short1234567".slice(0, 11)), null);
});

test("validateAdminPasswordStrength: rejects a 12+ character password that's still just a padded common placeholder, case-insensitively", () => {
  assert.notEqual(validateAdminPasswordStrength("MyPassword123"), null);
  assert.notEqual(validateAdminPasswordStrength("PLEASECHANGEME"), null);
});

test("validateAdminPasswordStrength: accepts a long passphrase with spaces and no forced composition rules", () => {
  assert.equal(validateAdminPasswordStrength(STRONG_PASSWORD), null);
});

test("verifyPassword: an unknown email resolves to null", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => null);
  assert.equal(await verifyPassword("nobody@example.com", STRONG_PASSWORD), null);
  findUnique.restore();
});

test("verifyPassword: an inactive account resolves to null even with the correct password", async () => {
  const passwordHash = await hashPassword(STRONG_PASSWORD);
  const findUnique = stub(prisma.adminUser, "findUnique", async () => ({ id: "admin-1", isActive: false, passwordHash }));
  assert.equal(await verifyPassword("owner@example.com", STRONG_PASSWORD), null);
  findUnique.restore();
});

test("verifyPassword: an invited-but-not-activated account (no password set yet) resolves to null", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => ({ id: "admin-1", isActive: true, passwordHash: null }));
  assert.equal(await verifyPassword("pending@example.com", STRONG_PASSWORD), null);
  findUnique.restore();
});

test("verifyPassword: a wrong password resolves to null — the exact same result shape as an unknown email, never distinguishable by the caller", async () => {
  const passwordHash = await hashPassword(STRONG_PASSWORD);
  const findUnique = stub(prisma.adminUser, "findUnique", async () => ({ id: "admin-1", isActive: true, passwordHash }));
  assert.equal(await verifyPassword("owner@example.com", "wrong password entirely"), null);
  findUnique.restore();
});

test("verifyPassword: the correct password for an active account returns a safe profile with no password hash on it", async () => {
  const passwordHash = await hashPassword(STRONG_PASSWORD);
  const findUnique = stub(prisma.adminUser, "findUnique", async () => ({ id: "admin-1", name: "Owner", email: "owner@example.com", role: "ADMIN", isActive: true, passwordHash }));

  const result = await verifyPassword("owner@example.com", STRONG_PASSWORD);
  assert.ok(result);
  assert.equal(result!.email, "owner@example.com");
  assert.equal((result as unknown as Record<string, unknown>).passwordHash, undefined);

  findUnique.restore();
});

test("verifyPassword: normalises the email (trim + lowercase) before lookup", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async (args: { where: Record<string, unknown> }) => {
    assert.equal(args.where.email, "owner@example.com");
    return null;
  });
  await verifyPassword("  Owner@Example.com  ", STRONG_PASSWORD);
  findUnique.restore();
});

test("recordCompletedLogin: updates lastLoginAt for the given admin — the only place this field is ever written", async () => {
  const update = stub(prisma.adminUser, "update", async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    assert.equal(args.where.id, "admin-1");
    assert.ok((args.data.lastLoginAt as Date) instanceof Date);
    return {};
  });
  await recordCompletedLogin("admin-1");
  assert.equal(update.fn.mock.callCount(), 1);
  update.restore();
});

test("revokeAllSessions: deletes every session for the given admin and returns the count", async () => {
  const deleteMany = stub(prisma.adminSession, "deleteMany", async (args: { where: Record<string, unknown> }) => {
    assert.equal(args.where.adminUserId, "admin-1");
    return { count: 4 };
  });
  assert.equal(await revokeAllSessions("admin-1"), 4);
  deleteMany.restore();
});

test("createSession: returns a raw token and persists only its hash, never the raw value", async () => {
  let persistedTokenHash = "";
  const create = stub(prisma.adminSession, "create", async (args: { data: Record<string, unknown> }) => {
    persistedTokenHash = args.data.tokenHash as string;
    return {};
  });

  const { rawToken, expiresAt } = await createSession("admin-1");
  assert.ok(rawToken.length >= 32);
  assert.notEqual(persistedTokenHash, rawToken);
  assert.ok(expiresAt.getTime() > Date.now());

  create.restore();
});

test("validateSession: an unknown token resolves to null", async () => {
  const findUnique = stub(prisma.adminSession, "findUnique", async () => null);
  assert.equal(await validateSession("unknown-token"), null);
  findUnique.restore();
});

test("validateSession: an expired session resolves to null", async () => {
  const findUnique = stub(prisma.adminSession, "findUnique", async () => ({
    id: "session-1",
    expiresAt: new Date(Date.now() - 1000),
    adminUser: { id: "admin-1", isActive: true },
  }));
  assert.equal(await validateSession("expired-token"), null);
  findUnique.restore();
});

test("validateSession: a session for a now-inactive admin resolves to null — deactivation blocks an already-open session immediately", async () => {
  const findUnique = stub(prisma.adminSession, "findUnique", async () => ({
    id: "session-1",
    expiresAt: new Date(Date.now() + 60_000),
    adminUser: { id: "admin-1", isActive: false },
  }));
  const update = stub(prisma.adminSession, "update", async () => ({}));
  assert.equal(await validateSession("some-token"), null);
  findUnique.restore();
  update.restore();
});

test("validateSession: a valid session for an active admin returns the safe profile", async () => {
  const findUnique = stub(prisma.adminSession, "findUnique", async () => ({
    id: "session-1",
    expiresAt: new Date(Date.now() + 60_000),
    adminUser: { id: "admin-1", name: "Owner", email: "owner@example.com", role: "ADMIN", isActive: true },
  }));
  const update = stub(prisma.adminSession, "update", async () => ({}));

  const result = await validateSession("valid-token");
  assert.ok(result);
  assert.equal(result!.id, "admin-1");

  findUnique.restore();
  update.restore();
});

test("destroySession: is idempotent — calling it with an unknown token is not an error", async () => {
  const deleteMany = stub(prisma.adminSession, "deleteMany", async () => ({ count: 0 }));
  await assert.doesNotReject(() => destroySession("unknown-token"));
  deleteMany.restore();
});
