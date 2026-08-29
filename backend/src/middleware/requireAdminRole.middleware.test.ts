// Content Studio Phase 2: direct unit tests for requireAdminRole — the
// first role-gated middleware this backend has ever had. Tested the
// same way testDbGuard.ts's own pure functions are tested: call the
// function directly with minimal mock req/res/next objects, no real
// HTTP server, no database. contentStudioRouteWiring.test.ts (in
// routes/) separately proves this middleware is actually WIRED onto
// every write route; this file proves its own 401/403/next() logic is
// correct in isolation.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { requireAdminRole } from "./requireAdminRole.middleware.js";

function mockRes() {
  const res: { statusCode?: number; body?: unknown; status: (code: number) => typeof res; json: (body: unknown) => typeof res } = {
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}

test("rejects with 401 when req.adminUser is not set (a wiring mistake, not a real authenticated request)", () => {
  const req = {} as Request;
  const res = mockRes();
  const next = mock.fn();

  requireAdminRole(UserRole.ADMIN)(req, res as unknown as Response, next);

  assert.equal(res.statusCode, 401);
  assert.equal(next.mock.callCount(), 0);
});

test("rejects a STAFF admin with 403 on an ADMIN-only route, never calling next()", () => {
  const req = { adminUser: { id: "staff-1", name: "Staff Member", email: "staff@example.com", role: UserRole.STAFF } } as unknown as Request;
  const res = mockRes();
  const next = mock.fn();

  requireAdminRole(UserRole.ADMIN)(req, res as unknown as Response, next);

  assert.equal(res.statusCode, 403);
  assert.equal(next.mock.callCount(), 0);
});

test("allows an ADMIN admin through by calling next() with no error, and never writes a response itself", () => {
  const req = { adminUser: { id: "admin-1", name: "Admin", email: "admin@example.com", role: UserRole.ADMIN } } as unknown as Request;
  const res = mockRes();
  const next = mock.fn();

  requireAdminRole(UserRole.ADMIN)(req, res as unknown as Response, next);

  assert.equal(next.mock.callCount(), 1);
  assert.equal(next.mock.calls[0]!.arguments.length, 0);
  assert.equal(res.statusCode, undefined);
});
