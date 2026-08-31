// Milestone 179, Part B: secure admin account onboarding via a
// one-time activation link — never a generated/emailed password.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { UserRole } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AdminInvitationError, activateInvitation, createAdminInvitation, previewInvitation, reissueAdminInvitation } from "./adminInvitation.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

function hashValue(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

const STRONG_PASSWORD = "correct horse battery staple";

test("createAdminInvitation: rejects a missing name", async () => {
  await assert.rejects(() => createAdminInvitation({ name: "  ", email: "a@example.com", role: UserRole.STAFF }, "admin-1"), AdminInvitationError);
});

test("createAdminInvitation: rejects an invalid email", async () => {
  await assert.rejects(() => createAdminInvitation({ name: "Nda", email: "not-an-email", role: UserRole.STAFF }, "admin-1"), AdminInvitationError);
});

test("createAdminInvitation: rejects a role that is neither ADMIN nor STAFF", async () => {
  await assert.rejects(
    () => createAdminInvitation({ name: "Nda", email: "a@example.com", role: "OWNER" as UserRole }, "admin-1"),
    AdminInvitationError
  );
});

test("createAdminInvitation: rejects a duplicate email — server-side uniqueness, never trusted from the frontend alone", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => ({ id: "existing-1" }));

  await assert.rejects(
    () => createAdminInvitation({ name: "Nda", email: "existing@example.com", role: UserRole.STAFF }, "admin-1"),
    (error: unknown) => error instanceof AdminInvitationError && error.statusCode === 409
  );

  findUnique.restore();
});

test("createAdminInvitation: normalises the email (trim + lowercase) before the uniqueness check and the created row", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async (args: { where: Record<string, unknown> }) => {
    assert.equal(args.where.email, "nda@example.com");
    return null;
  });
  const create = stub(prisma.adminUser, "create", async (args: { data: Record<string, unknown> }) => ({ id: "admin-new", ...args.data }));
  const invitationCreate = stub(prisma.adminInvitation, "create", async () => ({ id: "inv-1" }));
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));

  const result = await createAdminInvitation({ name: "Nda", email: " Nda@Example.com ", role: UserRole.STAFF }, "admin-1");
  assert.equal(result.admin.email, "nda@example.com");

  findUnique.restore();
  create.restore();
  invitationCreate.restore();
  transactionStub.restore();
});

test("createAdminInvitation: creates the account with no password and isActive false — never a generated password", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => null);
  const create = stub(prisma.adminUser, "create", async (args: { data: Record<string, unknown> }) => {
    assert.equal(args.data.passwordHash, null);
    assert.equal(args.data.isActive, false);
    assert.equal(args.data.role, UserRole.STAFF);
    return { id: "admin-new", ...args.data };
  });
  const invitationCreate = stub(prisma.adminInvitation, "create", async (args: { data: Record<string, unknown> }) => {
    assert.equal(args.data.invitedByAdminUserId, "admin-1");
    assert.notEqual(args.data.tokenHash, undefined);
    return { id: "inv-1" };
  });
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));

  const result = await createAdminInvitation({ name: "Nda", email: "nda@example.com", role: UserRole.STAFF }, "admin-1");
  assert.ok(result.rawToken.length >= 32);
  assert.equal(result.admin.role, UserRole.STAFF);

  findUnique.restore();
  create.restore();
  invitationCreate.restore();
  transactionStub.restore();
});

test("previewInvitation: an unknown token gives the same generic error as an expired or used one", async () => {
  const findUnique = stub(prisma.adminInvitation, "findUnique", async () => null);
  await assert.rejects(() => previewInvitation("unknown-token"), AdminInvitationError);
  findUnique.restore();
});

test("previewInvitation: an already-used token is rejected", async () => {
  const findUnique = stub(prisma.adminInvitation, "findUnique", async () => ({
    usedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    adminUser: { name: "Nda", email: "nda@example.com" },
  }));
  await assert.rejects(() => previewInvitation("used-token"), AdminInvitationError);
  findUnique.restore();
});

test("previewInvitation: an expired token is rejected", async () => {
  const findUnique = stub(prisma.adminInvitation, "findUnique", async () => ({
    usedAt: null,
    expiresAt: new Date(Date.now() - 1000),
    adminUser: { name: "Nda", email: "nda@example.com" },
  }));
  await assert.rejects(() => previewInvitation("expired-token"), AdminInvitationError);
  findUnique.restore();
});

test("previewInvitation: a valid token returns the invitee's name and a masked email, never the full address", async () => {
  const findUnique = stub(prisma.adminInvitation, "findUnique", async () => ({
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    adminUser: { name: "Ndamulelo", email: "ndamulelo@example.com" },
  }));

  const preview = await previewInvitation("valid-token");
  assert.equal(preview.name, "Ndamulelo");
  assert.ok(!preview.maskedEmail.includes("damulelo"));
  assert.ok(preview.maskedEmail.includes("@example.com"));

  findUnique.restore();
});

test("activateInvitation: rejects a password shorter than the admin minimum", async () => {
  await assert.rejects(() => activateInvitation("token", "short"), AdminInvitationError);
});

test("activateInvitation: rejects an unknown/expired/used token", async () => {
  const findUnique = stub(prisma.adminInvitation, "findUnique", async () => null);
  await assert.rejects(() => activateInvitation("token", STRONG_PASSWORD), AdminInvitationError);
  findUnique.restore();
});

test("activateInvitation: rejects a password equal to the invitee's own email", async () => {
  const findUnique = stub(prisma.adminInvitation, "findUnique", async () => ({
    id: "inv-1",
    adminUserId: "admin-new",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    adminUser: { email: "nda@example.com" },
  }));
  await assert.rejects(() => activateInvitation("token", "nda@example.com"), AdminInvitationError);
  findUnique.restore();
});

test("activateInvitation: on success, sets the password, activates the account, and marks the invitation used — all in one transaction", async () => {
  const findUnique = stub(prisma.adminInvitation, "findUnique", async () => ({
    id: "inv-1",
    adminUserId: "admin-new",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    adminUser: { id: "admin-new", name: "Nda", email: "nda@example.com", role: UserRole.STAFF },
  }));
  const userUpdate = stub(prisma.adminUser, "update", async (args: { data: Record<string, unknown> }) => {
    assert.equal(args.data.isActive, true);
    assert.notEqual(args.data.passwordHash, STRONG_PASSWORD, "must be hashed, never stored in plaintext");
    return { id: "admin-new", name: "Nda", email: "nda@example.com", role: UserRole.STAFF };
  });
  const invitationUpdate = stub(prisma.adminInvitation, "update", async (args: { data: Record<string, unknown> }) => {
    assert.ok((args.data.usedAt as Date) instanceof Date);
    return { id: "inv-1" };
  });
  const transactionStub = stub(prisma, "$transaction", async (ops: unknown[]) => Promise.all(ops));

  const result = await activateInvitation("token", STRONG_PASSWORD);
  assert.equal(result.id, "admin-new");
  assert.equal(userUpdate.fn.mock.callCount(), 1);
  assert.equal(invitationUpdate.fn.mock.callCount(), 1);

  findUnique.restore();
  userUpdate.restore();
  invitationUpdate.restore();
  transactionStub.restore();
});

test("reissueAdminInvitation: an unknown admin id is rejected", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => null);
  await assert.rejects(() => reissueAdminInvitation("missing", "admin-1"), (error: unknown) => error instanceof AdminInvitationError && error.statusCode === 404);
  findUnique.restore();
});

test("reissueAdminInvitation: an already-activated account is rejected — re-invite only applies to pending accounts", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => ({ id: "admin-new", isActive: true }));
  await assert.rejects(() => reissueAdminInvitation("admin-new", "admin-1"), (error: unknown) => error instanceof AdminInvitationError && error.statusCode === 409);
  findUnique.restore();
});

test("reissueAdminInvitation: issues a fresh token that immediately invalidates any previously issued one (upsert on the unique adminUserId)", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => ({ id: "admin-new", isActive: false, name: "Nda", email: "nda@example.com", role: UserRole.STAFF }));
  const upsert = stub(prisma.adminInvitation, "upsert", async (args: { where: Record<string, unknown>; update: Record<string, unknown> }) => {
    assert.equal(args.where.adminUserId, "admin-new");
    assert.equal(args.update.usedAt, null);
    return { id: "inv-1" };
  });

  const result = await reissueAdminInvitation("admin-new", "admin-1");
  assert.ok(result.rawToken.length >= 32);
  assert.equal(upsert.fn.mock.callCount(), 1);

  findUnique.restore();
  upsert.restore();
});
