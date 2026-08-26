// Version 7, Milestone 173: secret-path gating + always-200-past-the-gate
// behaviour. courierGuyConfig is a plain mutable object (safe to stub
// directly, same as every other config object in this codebase's
// tests); applyCourierStatusEvent itself is a real ES module export
// and cannot be monkey-patched (Node freezes module namespace objects)
// — so these tests exercise the REAL sync service underneath, stubbing
// prisma the same way courierStatusSync.service.test.ts does. Its own
// mapping/effects logic is fully covered there; this file is only
// about the HTTP boundary (the secret gate and the always-200 policy).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { courierGuyConfig } from "../config/courierGuy.js";
import { courierGuyTrackingWebhookHandler } from "./courierWebhook.controller.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, value: any) {
  const original = obj[key];
  obj[key] = value;
  return () => { obj[key] = original; };
}

function fakeRes() {
  const res: { statusCode?: number; body?: unknown; ended?: boolean } & Partial<Response> = {};
  res.status = mock.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as unknown as Response["status"];
  res.json = mock.fn((body: unknown) => {
    res.body = body;
    return res as Response;
  }) as unknown as Response["json"];
  res.end = mock.fn(() => {
    res.ended = true;
    return res as Response;
  }) as unknown as Response["end"];
  return res;
}

const REAL_SECRET = "a".repeat(32);

test("wrong secret path segment: 404, and the sync service never even queries the database", async () => {
  const restoreEnabled = stub(courierGuyConfig, "statusSyncEnabled", true);
  const restoreSecret = stub(courierGuyConfig, "webhookSecret", REAL_SECRET);
  const findMany = mock.fn(async () => {
    throw new Error("should never be called — the secret gate must reject first");
  });
  const restoreFindMany = stub(prisma.shipping, "findMany", findMany);

  const req = { params: { webhookSecret: "wrong-secret-value-not-matching" }, body: {} } as unknown as Request;
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(res.statusCode, 404);
    assert.equal(res.ended, true);
    assert.equal(findMany.mock.callCount(), 0);
    assert.equal(next.mock.callCount(), 0);
  } finally {
    restoreEnabled();
    restoreSecret();
    restoreFindMany();
  }
});

test("sync disabled entirely: 404 regardless of secret correctness, no database query", async () => {
  const restoreEnabled = stub(courierGuyConfig, "statusSyncEnabled", false);
  const restoreSecret = stub(courierGuyConfig, "webhookSecret", REAL_SECRET);
  const findMany = mock.fn(async () => {
    throw new Error("should never be called");
  });
  const restoreFindMany = stub(prisma.shipping, "findMany", findMany);

  const req = { params: { webhookSecret: REAL_SECRET }, body: {} } as unknown as Request;
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(res.statusCode, 404);
    assert.equal(findMany.mock.callCount(), 0);
  } finally {
    restoreEnabled();
    restoreSecret();
    restoreFindMany();
  }
});

test("no secret configured at all: 404, never crashes comparing against undefined", async () => {
  const restoreEnabled = stub(courierGuyConfig, "statusSyncEnabled", true);
  const restoreSecret = stub(courierGuyConfig, "webhookSecret", undefined);

  const req = { params: { webhookSecret: "anything" }, body: {} } as unknown as Request;
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(res.statusCode, 404);
    assert.equal(next.mock.callCount(), 0);
  } finally {
    restoreEnabled();
    restoreSecret();
  }
});

test("secret comparison is not fooled by a trivially different-length attempt (constant-time path used)", async () => {
  const restoreEnabled = stub(courierGuyConfig, "statusSyncEnabled", true);
  const restoreSecret = stub(courierGuyConfig, "webhookSecret", REAL_SECRET);

  const req = { params: { webhookSecret: "x" }, body: {} } as unknown as Request; // deliberately very short
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(res.statusCode, 404);
  } finally {
    restoreEnabled();
    restoreSecret();
  }
});

test("correct secret: real sync service is invoked and a 200 is returned even for an unresolved-shipment outcome", async () => {
  const restoreEnabled = stub(courierGuyConfig, "statusSyncEnabled", true);
  const restoreSecret = stub(courierGuyConfig, "webhookSecret", REAL_SECRET);
  // $transaction stubbed to run its callback against the plain prisma
  // object instead of opening a real transaction — same discipline as
  // courierStatusSync.service.test.ts; without this, the real sync
  // service would attempt a genuine transaction against the production
  // database (the transaction-scoped `tx` client is a distinct object
  // from `prisma.shipping`, so stubbing only the latter would silently
  // bypass the stub and hit the real DB).
  const restoreTransaction = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const findMany = mock.fn(async () => []); // genuinely unresolved — no matching Shipping row
  const restoreFindMany = stub(prisma.shipping, "findMany", findMany);

  const req = { params: { webhookSecret: REAL_SECRET }, body: { id: "ship-1", status: "delivered" } } as unknown as Request;
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(findMany.mock.callCount(), 1);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { received: true });
    assert.equal(next.mock.callCount(), 0);
  } finally {
    restoreEnabled();
    restoreSecret();
    restoreTransaction();
    restoreFindMany();
  }
});

test("correct secret, an unexpected internal error from the sync service: passed to next(), never a raw 500 leak or a crash", async () => {
  const restoreEnabled = stub(courierGuyConfig, "statusSyncEnabled", true);
  const restoreSecret = stub(courierGuyConfig, "webhookSecret", REAL_SECRET);
  const boom = new Error("unexpected database failure");
  // Stub $transaction itself to throw — same reasoning as above (never
  // let a real transaction open against production in this test), and
  // simpler than stubbing the transaction wrapper plus a findMany that
  // throws inside it.
  const restoreTransaction = stub(prisma, "$transaction", async () => {
    throw boom;
  });

  const req = { params: { webhookSecret: REAL_SECRET }, body: {} } as unknown as Request;
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(next.mock.callCount(), 1);
    assert.equal(next.mock.calls[0]!.arguments[0], boom);
    assert.equal(res.statusCode, undefined, "no response sent — next() owns the error response");
  } finally {
    restoreEnabled();
    restoreSecret();
    restoreTransaction();
  }
});
