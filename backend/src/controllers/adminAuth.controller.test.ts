// Milestone 179: adminAuth.controller.ts had no dedicated test file
// before this milestone. These tests stub only the underlying prisma
// calls each service transitively makes (same low-level approach
// order.controller.test.ts already established) so the real service
// logic runs — the controller's own job (generic error messages,
// never creating a session before OTP, cookie handling, security-event
// recording) is what these tests actually verify.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { hashPassword } from "../services/adminAuth.service.js";
import {
  activateInvitationHandler,
  forgotPasswordHandler,
  loginHandler,
  logoutAllSessionsHandler,
  logoutHandler,
  meHandler,
  previewInvitationHandler,
  resendOtpHandler,
  resetPasswordHandler,
  verifyOtpHandler,
} from "./adminAuth.controller.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

function stubTransaction() {
  return stub(prisma, "$transaction", async (arg: unknown) => {
    if (typeof arg === "function") return (arg as (tx: typeof prisma) => unknown)(prisma);
    return Promise.all(arg as unknown[]);
  });
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function hashValue(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function fakeRes() {
  const res: { statusCode?: number; body?: unknown; cookies: Record<string, unknown>; clearedCookies: string[] } & Partial<Response> = {
    cookies: {},
    clearedCookies: [],
  };
  res.status = mock.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as unknown as Response["status"];
  res.json = mock.fn((body: unknown) => {
    res.body = body;
    return res as Response;
  }) as unknown as Response["json"];
  res.cookie = mock.fn((name: string, value: string) => {
    res.cookies[name] = value;
    return res as Response;
  }) as unknown as Response["cookie"];
  res.clearCookie = mock.fn((name: string) => {
    res.clearedCookies.push(name);
    return res as Response;
  }) as unknown as Response["clearCookie"];
  return res;
}

function fakeReq(overrides: Record<string, unknown> = {}): Request {
  return {
    body: {},
    query: {},
    params: {},
    signedCookies: {},
    ip: "203.0.113.7",
    get: () => "TestAgent/1.0",
    ...overrides,
  } as unknown as Request;
}

const STRONG_PASSWORD = "correct horse battery staple";

// ---------------------------------------------------------------------------
// loginHandler
// ---------------------------------------------------------------------------

test("loginHandler: missing email/password is rejected with the generic message", async () => {
  const res = fakeRes();
  await loginHandler(fakeReq({ body: { email: "", password: "" } }), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 400);
  assert.equal((res.body as { success: boolean }).success, false);
});

test("loginHandler: unknown email and wrong password both return the exact same generic message and status — never distinguishable", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => null);
  const eventCreate = stub(prisma.adminSecurityEvent, "create", async () => ({}));

  const res1 = fakeRes();
  await loginHandler(fakeReq({ body: { email: "nobody@example.com", password: STRONG_PASSWORD } }), res1 as Response, mock.fn() as unknown as NextFunction);

  findUnique.restore();
  const passwordHash = await hashPassword(STRONG_PASSWORD);
  const findUnique2 = stub(prisma.adminUser, "findUnique", async () => ({ id: "admin-1", isActive: true, passwordHash }));

  const res2 = fakeRes();
  await loginHandler(fakeReq({ body: { email: "owner@example.com", password: "totally wrong password" } }), res2 as Response, mock.fn() as unknown as NextFunction);

  assert.equal(res1.statusCode, res2.statusCode);
  assert.deepEqual(res1.body, res2.body);

  await flushAsync();
  findUnique2.restore();
  eventCreate.restore();
});

test("loginHandler: a correct password never creates a session — only issues an OTP challenge and never sets the session cookie", async () => {
  const passwordHash = await hashPassword(STRONG_PASSWORD);
  const findUnique = stub(prisma.adminUser, "findUnique", async () => ({ id: "admin-1", name: "Owner", email: "owner@example.com", role: "ADMIN", isActive: true, passwordHash }));
  const updateMany = stub(prisma.adminOtpChallenge, "updateMany", async () => ({ count: 0 }));
  const create = stub(prisma.adminOtpChallenge, "create", async (args: { data: Record<string, unknown> }) => ({ id: "challenge-1", ...args.data }));
  const eventCreate = stub(prisma.adminSecurityEvent, "create", async () => ({}));
  const transactionStub = stubTransaction();

  const res = fakeRes();
  await loginHandler(fakeReq({ body: { email: "owner@example.com", password: STRONG_PASSWORD } }), res as Response, mock.fn() as unknown as NextFunction);

  assert.equal(res.statusCode, 200);
  assert.equal(Object.keys(res.cookies).length, 0, "no session cookie until OTP also succeeds");
  const body = res.body as { data: { challengeToken: string; maskedEmail: string } };
  assert.ok(body.data.challengeToken);
  assert.ok(body.data.maskedEmail.includes("@example.com"));
  assert.ok(!body.data.maskedEmail.startsWith("owner"));

  await flushAsync();
  findUnique.restore();
  updateMany.restore();
  create.restore();
  eventCreate.restore();
  transactionStub.restore();
});

// ---------------------------------------------------------------------------
// verifyOtpHandler
// ---------------------------------------------------------------------------

test("verifyOtpHandler: a malformed code is rejected without any database lookup", async () => {
  const findUnique = stub(prisma.adminOtpChallenge, "findUnique", async () => {
    throw new Error("must never be called");
  });
  const res = fakeRes();
  await verifyOtpHandler(fakeReq({ body: { challengeToken: "token", code: "abc" } }), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 400);
  findUnique.restore();
});

test("verifyOtpHandler: the correct code creates a session, sets the cookie, and records completed-login events", async () => {
  const rawChallengeToken = "a".repeat(64);
  const challengeRow = {
    id: "challenge-1",
    adminUserId: "admin-1",
    challengeTokenHash: hashValue(rawChallengeToken),
    codeHash: hashValue("123456"),
    expiresAt: new Date(Date.now() + 60_000),
    attemptCount: 0,
    usedAt: null,
  };
  const otpFindUnique = stub(prisma.adminOtpChallenge, "findUnique", async () => challengeRow);
  const otpUpdate = stub(prisma.adminOtpChallenge, "update", async () => ({ ...challengeRow, usedAt: new Date() }));
  const userFindUnique = stub(prisma.adminUser, "findUnique", async () => ({ id: "admin-1", name: "Owner", email: "owner@example.com", role: "ADMIN", isActive: true }));
  const userUpdate = stub(prisma.adminUser, "update", async () => ({}));
  const sessionCreate = stub(prisma.adminSession, "create", async () => ({}));
  const eventCreate = stub(prisma.adminSecurityEvent, "create", async () => ({}));

  const res = fakeRes();
  await verifyOtpHandler(fakeReq({ body: { challengeToken: rawChallengeToken, code: "123456" } }), res as Response, mock.fn() as unknown as NextFunction);

  assert.equal(res.statusCode, 200);
  assert.ok(res.cookies.admin_session, "session cookie must be set only now, after OTP success");
  assert.equal(userUpdate.fn.mock.callCount(), 1, "recordCompletedLogin must run");

  await flushAsync();
  otpFindUnique.restore();
  otpUpdate.restore();
  userFindUnique.restore();
  userUpdate.restore();
  sessionCreate.restore();
  eventCreate.restore();
});

test("verifyOtpHandler: a wrong code never sets a session cookie", async () => {
  const rawChallengeToken = "b".repeat(64);
  const challengeRow = {
    id: "challenge-1",
    adminUserId: "admin-1",
    challengeTokenHash: hashValue(rawChallengeToken),
    codeHash: hashValue("123456"),
    expiresAt: new Date(Date.now() + 60_000),
    attemptCount: 0,
    usedAt: null,
  };
  const otpFindUnique = stub(prisma.adminOtpChallenge, "findUnique", async () => challengeRow);
  const otpUpdate = stub(prisma.adminOtpChallenge, "update", async () => ({ ...challengeRow, attemptCount: 1 }));
  const eventCreate = stub(prisma.adminSecurityEvent, "create", async () => ({}));
  const sessionCreate = stub(prisma.adminSession, "create", async () => {
    throw new Error("must never be called for a wrong code");
  });

  const res = fakeRes();
  await verifyOtpHandler(fakeReq({ body: { challengeToken: rawChallengeToken, code: "000000" } }), res as Response, mock.fn() as unknown as NextFunction);

  assert.equal(res.statusCode, 400);
  assert.equal(Object.keys(res.cookies).length, 0);

  await flushAsync();
  otpFindUnique.restore();
  otpUpdate.restore();
  eventCreate.restore();
  sessionCreate.restore();
});

// ---------------------------------------------------------------------------
// resendOtpHandler
// ---------------------------------------------------------------------------

test("resendOtpHandler: an unrecognised challenge token is rejected", async () => {
  const otpFindUnique = stub(prisma.adminOtpChallenge, "findUnique", async () => null);
  const res = fakeRes();
  await resendOtpHandler(fakeReq({ body: { challengeToken: "unknown" } }), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 400);
  otpFindUnique.restore();
});

test("resendOtpHandler: within the 60 second cooldown is rejected with 429", async () => {
  const otpFindUnique = stub(prisma.adminOtpChallenge, "findUnique", async () => ({ adminUserId: "admin-1" }));
  const otpFindFirst = stub(prisma.adminOtpChallenge, "findFirst", async () => ({ createdAt: new Date(Date.now() - 5000) }));

  const res = fakeRes();
  await resendOtpHandler(fakeReq({ body: { challengeToken: "some-token" } }), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 429);

  otpFindUnique.restore();
  otpFindFirst.restore();
});

test("resendOtpHandler: past the cooldown, issues a fresh challenge and never reuses the old code", async () => {
  const otpFindUnique = stub(prisma.adminOtpChallenge, "findUnique", async () => ({ adminUserId: "admin-1" }));
  const otpFindFirst = stub(prisma.adminOtpChallenge, "findFirst", async () => ({ createdAt: new Date(Date.now() - 120_000) }));
  const userFindUnique = stub(prisma.adminUser, "findUnique", async () => ({ id: "admin-1", name: "Owner", email: "owner@example.com", isActive: true }));
  const updateMany = stub(prisma.adminOtpChallenge, "updateMany", async () => ({ count: 1 }));
  const create = stub(prisma.adminOtpChallenge, "create", async (args: { data: Record<string, unknown> }) => ({ id: "challenge-2", ...args.data }));
  const eventCreate = stub(prisma.adminSecurityEvent, "create", async () => ({}));
  const transactionStub = stubTransaction();

  const res = fakeRes();
  await resendOtpHandler(fakeReq({ body: { challengeToken: "some-token" } }), res as Response, mock.fn() as unknown as NextFunction);

  assert.equal(res.statusCode, 200);
  const body = res.body as { data: { challengeToken: string } };
  assert.notEqual(body.data.challengeToken, "some-token");

  await flushAsync();
  otpFindUnique.restore();
  otpFindFirst.restore();
  userFindUnique.restore();
  updateMany.restore();
  create.restore();
  eventCreate.restore();
  transactionStub.restore();
});

// ---------------------------------------------------------------------------
// logout / logout-all / me
// ---------------------------------------------------------------------------

test("logoutHandler: clears the session cookie even with no cookie present — idempotent", async () => {
  const res = fakeRes();
  await logoutHandler(fakeReq(), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 200);
  assert.ok(res.clearedCookies.includes("admin_session"));
});

test("logoutAllSessionsHandler: rejects 401 with no req.adminUser", async () => {
  const res = fakeRes();
  await logoutAllSessionsHandler(fakeReq(), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 401);
});

test("logoutAllSessionsHandler: revokes every session for the authenticated admin and clears the cookie", async () => {
  const deleteMany = stub(prisma.adminSession, "deleteMany", async () => ({ count: 3 }));
  const eventCreate = stub(prisma.adminSecurityEvent, "create", async () => ({}));

  const res = fakeRes();
  await logoutAllSessionsHandler(fakeReq({ adminUser: { id: "admin-1", name: "Owner", email: "owner@example.com", role: "ADMIN" } }), res as Response, mock.fn() as unknown as NextFunction);

  assert.equal(res.statusCode, 200);
  assert.ok(res.clearedCookies.includes("admin_session"));

  await flushAsync();
  deleteMany.restore();
  eventCreate.restore();
});

test("meHandler: returns req.adminUser as-is", () => {
  const res = fakeRes();
  meHandler(fakeReq({ adminUser: { id: "admin-1" } }), res as Response);
  assert.equal(res.statusCode, 200);
  assert.equal((res.body as { data: { admin: { id: string } } }).data.admin.id, "admin-1");
});

// ---------------------------------------------------------------------------
// forgot / reset password
// ---------------------------------------------------------------------------

test("forgotPasswordHandler: returns the exact same generic message for an unknown email and a real one", async () => {
  const findUnique1 = stub(prisma.adminUser, "findUnique", async () => null);
  const res1 = fakeRes();
  await forgotPasswordHandler(fakeReq({ body: { email: "nobody@example.com" } }), res1 as Response, mock.fn() as unknown as NextFunction);
  findUnique1.restore();

  const findUnique2 = stub(prisma.adminUser, "findUnique", async () => ({ id: "admin-1", name: "Owner", email: "owner@example.com", role: "ADMIN", isActive: true, passwordHash: "hash" }));
  const updateMany = stub(prisma.adminPasswordResetToken, "updateMany", async () => ({ count: 0 }));
  const create = stub(prisma.adminPasswordResetToken, "create", async () => ({ id: "token-1" }));
  const eventCreate = stub(prisma.adminSecurityEvent, "create", async () => ({}));
  const transactionStub = stubTransaction();

  const res2 = fakeRes();
  await forgotPasswordHandler(fakeReq({ body: { email: "owner@example.com" } }), res2 as Response, mock.fn() as unknown as NextFunction);

  assert.equal(res1.statusCode, res2.statusCode);
  assert.deepEqual(res1.body, res2.body);

  await flushAsync();
  findUnique2.restore();
  updateMany.restore();
  create.restore();
  eventCreate.restore();
  transactionStub.restore();
});

test("resetPasswordHandler: mismatched confirmPassword is rejected before any token lookup", async () => {
  const findUnique = stub(prisma.adminPasswordResetToken, "findUnique", async () => {
    throw new Error("must never be called");
  });
  const res = fakeRes();
  await resetPasswordHandler(fakeReq({ body: { token: "token", password: STRONG_PASSWORD, confirmPassword: "different" } }), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 400);
  findUnique.restore();
});

test("resetPasswordHandler: a valid token and password succeed and revoke sessions", async () => {
  const findUnique = stub(prisma.adminPasswordResetToken, "findUnique", async () => ({
    id: "token-1",
    adminUserId: "admin-1",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    adminUser: { id: "admin-1", name: "Owner", email: "owner@example.com", role: "ADMIN", isActive: true },
  }));
  const userUpdate = stub(prisma.adminUser, "update", async () => ({ id: "admin-1", name: "Owner", email: "owner@example.com", role: "ADMIN" }));
  const tokenUpdate = stub(prisma.adminPasswordResetToken, "update", async () => ({}));
  const sessionDeleteMany = stub(prisma.adminSession, "deleteMany", async () => ({ count: 2 }));
  const eventCreate = stub(prisma.adminSecurityEvent, "create", async () => ({}));
  const transactionStub = stubTransaction();

  const res = fakeRes();
  await resetPasswordHandler(fakeReq({ body: { token: "valid-token", password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD } }), res as Response, mock.fn() as unknown as NextFunction);

  assert.equal(res.statusCode, 200);
  assert.equal(sessionDeleteMany.fn.mock.callCount(), 1);

  await flushAsync();
  findUnique.restore();
  userUpdate.restore();
  tokenUpdate.restore();
  sessionDeleteMany.restore();
  eventCreate.restore();
  transactionStub.restore();
});

// ---------------------------------------------------------------------------
// invitation preview / activate
// ---------------------------------------------------------------------------

test("previewInvitationHandler: a missing token is rejected", async () => {
  const res = fakeRes();
  await previewInvitationHandler(fakeReq({ query: {} }), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 400);
});

test("previewInvitationHandler: a valid token returns the invitee name and a masked email", async () => {
  const findUnique = stub(prisma.adminInvitation, "findUnique", async () => ({
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    adminUser: { name: "Ndamulelo", email: "ndamulelo@example.com" },
  }));
  const res = fakeRes();
  await previewInvitationHandler(fakeReq({ query: { token: "valid-token" } }), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 200);
  assert.equal((res.body as { data: { name: string } }).data.name, "Ndamulelo");
  findUnique.restore();
});

test("activateInvitationHandler: mismatched confirmPassword is rejected before any token lookup", async () => {
  const findUnique = stub(prisma.adminInvitation, "findUnique", async () => {
    throw new Error("must never be called");
  });
  const res = fakeRes();
  await activateInvitationHandler(fakeReq({ body: { token: "token", password: STRONG_PASSWORD, confirmPassword: "different" } }), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 400);
  findUnique.restore();
});

test("activateInvitationHandler: a valid token and strong password activate the account", async () => {
  const findUnique = stub(prisma.adminInvitation, "findUnique", async () => ({
    id: "inv-1",
    adminUserId: "admin-new",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    adminUser: { id: "admin-new", name: "Nda", email: "nda@example.com", role: "STAFF" },
  }));
  const userUpdate = stub(prisma.adminUser, "update", async () => ({ id: "admin-new", name: "Nda", email: "nda@example.com", role: "STAFF" }));
  const invitationUpdate = stub(prisma.adminInvitation, "update", async () => ({}));
  const eventCreate = stub(prisma.adminSecurityEvent, "create", async () => ({}));
  const transactionStub = stubTransaction();

  const res = fakeRes();
  await activateInvitationHandler(fakeReq({ body: { token: "valid-token", password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD } }), res as Response, mock.fn() as unknown as NextFunction);

  assert.equal(res.statusCode, 200);

  await flushAsync();
  findUnique.restore();
  userUpdate.restore();
  invitationUpdate.restore();
  eventCreate.restore();
  transactionStub.restore();
});
