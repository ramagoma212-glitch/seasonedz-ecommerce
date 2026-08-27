// Version 7, Milestone 176: admin affiliate application controller —
// auth-gating coverage (brief section 49). requireAdminAuth itself is
// applied at the router level (adminAffiliateApplications.routes.ts);
// these handlers' own req.adminUser guard is the second, defense-in-
// depth layer already used by every other admin controller in this
// backend.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { approveApplicationHandler, requestCorrectionHandler, revealIdentityNumberHandler } from "./adminAffiliateApplication.controller.js";

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

test("approveApplicationHandler: rejects 401 with no req.adminUser", async () => {
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;
  await approveApplicationHandler({ params: { id: "app-1" } } as unknown as Request, res as Response, next);
  assert.equal(res.statusCode, 401);
});

test("requestCorrectionHandler: rejects 401 with no req.adminUser", async () => {
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;
  await requestCorrectionHandler({ params: { id: "app-1" }, body: { reason: "x" } } as unknown as Request, res as Response, next);
  assert.equal(res.statusCode, 401);
});

test("revealIdentityNumberHandler: rejects 401 with no req.adminUser — the full identity number is never returned to an unauthenticated caller", async () => {
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;
  await revealIdentityNumberHandler({ params: { id: "app-1" } } as unknown as Request, res as Response, next);
  assert.equal(res.statusCode, 401);
});
