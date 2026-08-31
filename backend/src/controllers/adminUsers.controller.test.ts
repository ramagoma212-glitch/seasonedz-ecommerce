// Milestone 179, Part G: admin-user management controller. Role
// enforcement (ADMIN only) is applied at the router level
// (adminUsers.routes.ts, see its own wiring test) — these tests cover
// the handlers' own defense-in-depth req.adminUser guard (same pattern
// adminAffiliateApplication.controller.test.ts already established)
// plus the actual business behaviour with the underlying prisma calls
// stubbed.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import {
  changeAdminUserRoleHandler,
  inviteAdminUserHandler,
  reissueInvitationHandler,
  setAdminUserActiveHandler,
} from "./adminUsers.controller.js";

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

function fakeRes() {
  const res: { statusCode?: number; body?: unknown } & Partial<Response> = {};
  res.status = mock.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as unknown as Response["status"];
  res.json = mock.fn((body: unknown) => {
    res.body = body;
    return res as Response;
  }) as unknown as Response["json"];
  return res;
}

const ACTING_ADMIN = { id: "admin-1", name: "Owner", email: "owner@example.com", role: "ADMIN" };

function fakeReq(overrides: Record<string, unknown> = {}): Request {
  return {
    body: {},
    params: {},
    ip: "203.0.113.7",
    get: () => "TestAgent/1.0",
    adminUser: ACTING_ADMIN,
    ...overrides,
  } as unknown as Request;
}

test("inviteAdminUserHandler: rejects 401 with no req.adminUser", async () => {
  const res = fakeRes();
  await inviteAdminUserHandler(fakeReq({ adminUser: undefined, body: { name: "Nda", email: "nda@example.com" } }), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 401);
});

test("reissueInvitationHandler: rejects 401 with no req.adminUser", async () => {
  const res = fakeRes();
  await reissueInvitationHandler(fakeReq({ adminUser: undefined, params: { id: "admin-new" } }), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 401);
});

test("changeAdminUserRoleHandler: rejects 401 with no req.adminUser", async () => {
  const res = fakeRes();
  await changeAdminUserRoleHandler(fakeReq({ adminUser: undefined, params: { id: "admin-2" }, body: { role: "STAFF" } }), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 401);
});

test("setAdminUserActiveHandler: rejects 401 with no req.adminUser", async () => {
  const res = fakeRes();
  await setAdminUserActiveHandler(fakeReq({ adminUser: undefined, params: { id: "admin-2" }, body: { isActive: false } }), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 401);
});

test("inviteAdminUserHandler: defaults an unrecognised role to STAFF — never silently grants ADMIN", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => null);
  const create = stub(prisma.adminUser, "create", async (args: { data: Record<string, unknown> }) => ({ id: "admin-new", ...args.data }));
  const invitationCreate = stub(prisma.adminInvitation, "create", async () => ({ id: "inv-1" }));
  const eventCreate = stub(prisma.adminSecurityEvent, "create", async () => ({}));
  const transactionStub = stubTransaction();

  const res = fakeRes();
  await inviteAdminUserHandler(fakeReq({ body: { name: "Nda", email: "nda@example.com", role: "SUPERUSER" } }), res as Response, mock.fn() as unknown as NextFunction);

  assert.equal(res.statusCode, 201);
  const body = res.body as { data: { admin: { role: string } } };
  assert.equal(body.data.admin.role, UserRole.STAFF);

  await flushAsync();
  findUnique.restore();
  create.restore();
  invitationCreate.restore();
  eventCreate.restore();
  transactionStub.restore();
});

test("inviteAdminUserHandler: a duplicate email is rejected with 409", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => ({ id: "existing" }));
  const res = fakeRes();
  await inviteAdminUserHandler(fakeReq({ body: { name: "Nda", email: "existing@example.com", role: "STAFF" } }), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 409);
  findUnique.restore();
});

test("changeAdminUserRoleHandler: an invalid role value is rejected", async () => {
  const res = fakeRes();
  await changeAdminUserRoleHandler(fakeReq({ params: { id: "admin-2" }, body: { role: "OWNER" } }), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 400);
});

test("changeAdminUserRoleHandler: demoting the last active ADMIN surfaces the lockout error as 409", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => ({ id: "admin-2", role: UserRole.ADMIN, isActive: true }));
  const count = stub(prisma.adminUser, "count", async () => 0);

  const res = fakeRes();
  await changeAdminUserRoleHandler(fakeReq({ params: { id: "admin-2" }, body: { role: "STAFF" } }), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 409);

  findUnique.restore();
  count.restore();
});

test("setAdminUserActiveHandler: a non-boolean isActive is rejected", async () => {
  const res = fakeRes();
  await setAdminUserActiveHandler(fakeReq({ params: { id: "admin-2" }, body: { isActive: "no" } }), res as Response, mock.fn() as unknown as NextFunction);
  assert.equal(res.statusCode, 400);
});

test("setAdminUserActiveHandler: deactivating succeeds and revokes sessions", async () => {
  const findUnique = stub(prisma.adminUser, "findUnique", async () => ({ id: "admin-2", role: UserRole.STAFF, isActive: true, name: "Staff", email: "staff@example.com", lastLoginAt: null, createdAt: new Date(), invitation: null }));
  const update = stub(prisma.adminUser, "update", async (args: { data: Record<string, unknown> }) => ({ id: "admin-2", role: UserRole.STAFF, name: "Staff", email: "staff@example.com", lastLoginAt: null, createdAt: new Date(), invitation: null, isActive: args.data.isActive }));
  const sessionDeleteMany = stub(prisma.adminSession, "deleteMany", async () => ({ count: 1 }));
  const eventCreate = stub(prisma.adminSecurityEvent, "create", async () => ({}));

  const res = fakeRes();
  await setAdminUserActiveHandler(fakeReq({ params: { id: "admin-2" }, body: { isActive: false } }), res as Response, mock.fn() as unknown as NextFunction);

  assert.equal(res.statusCode, 200);
  assert.equal(sessionDeleteMany.fn.mock.callCount(), 1);

  await flushAsync();
  findUnique.restore();
  update.restore();
  sessionDeleteMany.restore();
  eventCreate.restore();
});
