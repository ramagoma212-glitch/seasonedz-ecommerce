// Milestone 179, Part D: admin forgotten/reset password. Deliberately
// its own table/flow, never the customer one — see the service's own
// header comment. Covers the "identical result for every failure case"
// discipline (brief section 21) and the mandatory full session wipe on
// a successful reset (brief section 27).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import { AdminPasswordResetError, requestAdminPasswordReset, resetAdminPasswordWithToken } from "./adminPasswordReset.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

const STRONG_PASSWORD = "correct horse battery staple";

test("requestAdminPasswordReset: an unknown email resolves to null — same as every other failure case", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => null);
  assert.equal(await requestAdminPasswordReset("nobody@example.com"), null);
  findUnique.restore();
});

test("requestAdminPasswordReset: an inactive account resolves to null", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => ({ id: "admin-1", isActive: false, passwordHash: "hash" }));
  assert.equal(await requestAdminPasswordReset("inactive@example.com"), null);
  findUnique.restore();
});

test("requestAdminPasswordReset: an invited-but-not-activated account (no password yet) resolves to null — re-invite is the correct action, not a reset", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => ({ id: "admin-1", isActive: false, passwordHash: null }));
  assert.equal(await requestAdminPasswordReset("pending@example.com"), null);
  findUnique.restore();
});

test("requestAdminPasswordReset: a valid active account gets a fresh raw token, and any prior active token is invalidated first", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => ({ id: "admin-1", name: "Owner", email: "owner@example.com", role: "ADMIN", isActive: true, passwordHash: "hash" }));
  const updateMany = stub(prisma.adminPasswordResetToken, "updateMany", async (args: { where: Record<string, unknown> }) => {
    assert.equal(args.where.adminUserId, "admin-1");
    return { count: 0 };
  });
  const create = stub(prisma.adminPasswordResetToken, "create", async () => ({ id: "token-1" }));
  const transactionStub = stub(prisma, "$transaction", async (ops: unknown[]) => Promise.all(ops));

  const result = await requestAdminPasswordReset("owner@example.com");
  assert.ok(result);
  assert.ok(result!.rawToken.length >= 32);
  assert.equal(result!.admin.email, "owner@example.com");
  assert.equal(updateMany.fn.mock.callCount(), 1);

  findUnique.restore();
  updateMany.restore();
  create.restore();
  transactionStub.restore();
});

test("resetAdminPasswordWithToken: a weak password is rejected before any token lookup", async () => {
  const findUnique = stub(prisma.adminPasswordResetToken, "findUnique", async () => {
    throw new Error("must never be called — password validated first");
  });
  await assert.rejects(() => resetAdminPasswordWithToken("token", "short"), AdminPasswordResetError);
  findUnique.restore();
});

test("resetAdminPasswordWithToken: an unknown token is rejected", async () => {
  const findUnique = stub(prisma.adminPasswordResetToken, "findUnique", async () => null);
  await assert.rejects(() => resetAdminPasswordWithToken("unknown-token", STRONG_PASSWORD), AdminPasswordResetError);
  findUnique.restore();
});

test("resetAdminPasswordWithToken: an already-used token is rejected — never replayable", async () => {
  const findUnique = stub(prisma.adminPasswordResetToken, "findUnique", async () => ({
    id: "token-1",
    adminUserId: "admin-1",
    usedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    adminUser: { isActive: true, email: "owner@example.com" },
  }));
  await assert.rejects(() => resetAdminPasswordWithToken("used-token", STRONG_PASSWORD), AdminPasswordResetError);
  findUnique.restore();
});

test("resetAdminPasswordWithToken: an expired token is rejected", async () => {
  const findUnique = stub(prisma.adminPasswordResetToken, "findUnique", async () => ({
    id: "token-1",
    adminUserId: "admin-1",
    usedAt: null,
    expiresAt: new Date(Date.now() - 1000),
    adminUser: { isActive: true, email: "owner@example.com" },
  }));
  await assert.rejects(() => resetAdminPasswordWithToken("expired-token", STRONG_PASSWORD), AdminPasswordResetError);
  findUnique.restore();
});

test("resetAdminPasswordWithToken: rejects a new password equal to the account's own email", async () => {
  const findUnique = stub(prisma.adminPasswordResetToken, "findUnique", async () => ({
    id: "token-1",
    adminUserId: "admin-1",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    adminUser: { isActive: true, email: "owner@example.com" },
  }));
  await assert.rejects(() => resetAdminPasswordWithToken("token", "owner@example.com"), AdminPasswordResetError);
  findUnique.restore();
});

test("resetAdminPasswordWithToken: on success, updates the password, marks the token used, and revokes every existing session in one transaction", async () => {
  const findUnique = stub(prisma.adminPasswordResetToken, "findUnique", async () => ({
    id: "token-1",
    adminUserId: "admin-1",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    adminUser: { id: "admin-1", name: "Owner", email: "owner@example.com", role: "ADMIN", isActive: true },
  }));
  const userUpdate = stub(prisma.adminUser, "update", async (args: { data: Record<string, unknown> }) => {
    assert.notEqual(args.data.passwordHash, STRONG_PASSWORD, "must be hashed, never stored in plaintext");
    return { id: "admin-1", name: "Owner", email: "owner@example.com", role: "ADMIN" };
  });
  const tokenUpdate = stub(prisma.adminPasswordResetToken, "update", async (args: { data: Record<string, unknown> }) => {
    assert.ok((args.data.usedAt as Date) instanceof Date);
    return { id: "token-1" };
  });
  const sessionDeleteMany = stub(prisma.adminSession, "deleteMany", async (args: { where: Record<string, unknown> }) => {
    assert.equal(args.where.adminUserId, "admin-1");
    return { count: 3 };
  });
  const transactionStub = stub(prisma, "$transaction", async (ops: unknown[]) => Promise.all(ops));

  const result = await resetAdminPasswordWithToken("token", STRONG_PASSWORD);
  assert.equal(result.id, "admin-1");
  assert.equal(userUpdate.fn.mock.callCount(), 1);
  assert.equal(tokenUpdate.fn.mock.callCount(), 1);
  assert.equal(sessionDeleteMany.fn.mock.callCount(), 1);

  findUnique.restore();
  userUpdate.restore();
  tokenUpdate.restore();
  sessionDeleteMany.restore();
  transactionStub.restore();
});
