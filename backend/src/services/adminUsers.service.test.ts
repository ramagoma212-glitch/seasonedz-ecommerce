// Milestone 179, Part G: admin-user management. The lockout guard here
// is the single most important property in this file — it must be
// impossible, through any combination of role change or deactivation,
// to end up with zero active ADMIN accounts (brief Part G/H).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { UserRole } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AdminUsersError, changeAdminUserRole, listAdminUsers, setAdminUserActive } from "./adminUsers.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

function adminRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "admin-1",
    name: "Owner",
    email: "owner@example.com",
    passwordHash: "bcrypt-hash-must-never-appear-in-output",
    role: UserRole.ADMIN,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    invitation: null,
    ...overrides,
  };
}

test("listAdminUsers: never includes passwordHash, even though the underlying row carries one", async () => {
  const findMany = stub(prisma.adminUser, "findMany", async () => [adminRow()]);

  const result = await listAdminUsers();
  const summary = result[0]! as unknown as Record<string, unknown>;
  assert.equal(summary.passwordHash, undefined);
  assert.equal(summary.email, "owner@example.com");

  findMany.restore();
});

test("listAdminUsers: invitationPending is true only for an inactive account with an unused invitation", async () => {
  const findMany = stub(prisma.adminUser, "findMany", async () => [
    adminRow({ id: "a", isActive: false, invitation: { usedAt: null } }),
    adminRow({ id: "b", isActive: false, invitation: { usedAt: new Date() } }),
    adminRow({ id: "c", isActive: true, invitation: null }),
  ]);

  const result = await listAdminUsers();
  assert.equal(result.find((a) => a.id === "a")!.invitationPending, true);
  assert.equal(result.find((a) => a.id === "b")!.invitationPending, false);
  assert.equal(result.find((a) => a.id === "c")!.invitationPending, false);

  findMany.restore();
});

test("changeAdminUserRole: an unknown admin id is rejected", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => null);
  await assert.rejects(() => changeAdminUserRole("missing", UserRole.STAFF), (error: unknown) => error instanceof AdminUsersError && error.statusCode === 404);
  findUnique.restore();
});

test("changeAdminUserRole: demoting the last active ADMIN to STAFF is rejected", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => adminRow());
  const count = stub(prisma.adminUser, "count", async () => 0); // no OTHER active admins
  const update = stub(prisma.adminUser, "update", async () => {
    throw new Error("must never be called — lockout guard should reject first");
  });

  await assert.rejects(() => changeAdminUserRole("admin-1", UserRole.STAFF), (error: unknown) => error instanceof AdminUsersError && error.statusCode === 409);

  findUnique.restore();
  count.restore();
  update.restore();
});

test("changeAdminUserRole: demoting an ADMIN when another active ADMIN exists succeeds", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => adminRow());
  const count = stub(prisma.adminUser, "count", async () => 1); // one other active admin
  const update = stub(prisma.adminUser, "update", async (args: { data: Record<string, unknown> }) => adminRow({ role: args.data.role }));

  const result = await changeAdminUserRole("admin-1", UserRole.STAFF);
  assert.equal(result.role, UserRole.STAFF);

  findUnique.restore();
  count.restore();
  update.restore();
});

test("changeAdminUserRole: promoting a STAFF member to ADMIN never needs the lockout check", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => adminRow({ role: UserRole.STAFF }));
  const count = stub(prisma.adminUser, "count", async () => {
    throw new Error("must never be called — promotion can never cause a lockout");
  });
  const update = stub(prisma.adminUser, "update", async (args: { data: Record<string, unknown> }) => adminRow({ role: args.data.role }));

  const result = await changeAdminUserRole("admin-1", UserRole.ADMIN);
  assert.equal(result.role, UserRole.ADMIN);

  findUnique.restore();
  count.restore();
  update.restore();
});

test("setAdminUserActive: an unknown admin id is rejected", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => null);
  await assert.rejects(() => setAdminUserActive("missing", false), (error: unknown) => error instanceof AdminUsersError && error.statusCode === 404);
  findUnique.restore();
});

test("setAdminUserActive: deactivating the last active ADMIN is rejected", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => adminRow());
  const count = stub(prisma.adminUser, "count", async () => 0);
  const update = stub(prisma.adminUser, "update", async () => {
    throw new Error("must never be called — lockout guard should reject first");
  });

  await assert.rejects(() => setAdminUserActive("admin-1", false), (error: unknown) => error instanceof AdminUsersError && error.statusCode === 409);

  findUnique.restore();
  count.restore();
  update.restore();
});

test("setAdminUserActive: deactivating succeeds when another active ADMIN exists, and revokes every session for the deactivated account", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => adminRow());
  const count = stub(prisma.adminUser, "count", async () => 1);
  const update = stub(prisma.adminUser, "update", async (args: { data: Record<string, unknown> }) => adminRow({ isActive: args.data.isActive }));
  const sessionDeleteMany = stub(prisma.adminSession, "deleteMany", async (args: { where: Record<string, unknown> }) => {
    assert.equal(args.where.adminUserId, "admin-1");
    return { count: 2 };
  });

  const result = await setAdminUserActive("admin-1", false);
  assert.equal(result.isActive, false);
  assert.equal(sessionDeleteMany.fn.mock.callCount(), 1);

  findUnique.restore();
  count.restore();
  update.restore();
  sessionDeleteMany.restore();
});

test("setAdminUserActive: reactivating a STAFF account needs no lockout check and revokes no sessions", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => adminRow({ role: UserRole.STAFF, isActive: false }));
  const count = stub(prisma.adminUser, "count", async () => {
    throw new Error("must never be called — reactivation can never cause a lockout");
  });
  const update = stub(prisma.adminUser, "update", async (args: { data: Record<string, unknown> }) => adminRow({ role: UserRole.STAFF, isActive: args.data.isActive }));
  const sessionDeleteMany = stub(prisma.adminSession, "deleteMany", async () => {
    throw new Error("must never be called — reactivation never revokes sessions");
  });

  const result = await setAdminUserActive("admin-1", true);
  assert.equal(result.isActive, true);

  findUnique.restore();
  count.restore();
  update.restore();
  sessionDeleteMany.restore();
});
