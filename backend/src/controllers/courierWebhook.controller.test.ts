// Version 7, Milestone 173A: bearer-token webhook authentication.
// courierGuyConfig is a plain mutable object (safe to stub directly,
// same as every other config object in this codebase's tests);
// applyCourierStatusEvent itself is a real ES module export and cannot
// be monkey-patched (Node freezes module namespace objects) — so these
// tests exercise the REAL sync service underneath, stubbing prisma the
// same way courierStatusSync.service.test.ts does. Its own
// mapping/effects logic is fully covered there (idempotency, delivered
// mapping, unknown-status safety, Collection/digital exclusion,
// affiliate DELIVERED integration — none of it touched by this
// milestone); this file is only about the HTTP/auth boundary.
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

function fakeReq(overrides: { headers?: Record<string, string>; query?: Record<string, string>; params?: Record<string, string>; body?: unknown } = {}) {
  return {
    headers: overrides.headers ?? {},
    query: overrides.query ?? {},
    params: overrides.params ?? {},
    body: overrides.body ?? {},
  } as unknown as Request;
}

const REAL_SECRET = "a".repeat(32);

function withSyncEnabled() {
  const restoreEnabled = stub(courierGuyConfig, "statusSyncEnabled", true);
  const restoreSecret = stub(courierGuyConfig, "webhookSecret", REAL_SECRET);
  return () => {
    restoreEnabled();
    restoreSecret();
  };
}

test("sync disabled entirely: 404 regardless of any header, no database query", async () => {
  const restoreEnabled = stub(courierGuyConfig, "statusSyncEnabled", false);
  const restoreSecret = stub(courierGuyConfig, "webhookSecret", REAL_SECRET);
  const findMany = mock.fn(async () => {
    throw new Error("should never be called");
  });
  const restoreFindMany = stub(prisma.shipping, "findMany", findMany);

  const req = fakeReq({ headers: { authorization: `Bearer ${REAL_SECRET}` } });
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

  const req = fakeReq({ headers: { authorization: "Bearer anything" } });
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

test("missing Authorization header: 401, no database query", async () => {
  const restore = withSyncEnabled();
  const findMany = mock.fn(async () => {
    throw new Error("should never be called — auth must reject first");
  });
  const restoreFindMany = stub(prisma.shipping, "findMany", findMany);

  const req = fakeReq({ headers: {} });
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(res.statusCode, 401);
    assert.equal(findMany.mock.callCount(), 0);
  } finally {
    restore();
    restoreFindMany();
  }
});

test("wrong bearer token: 401, no database query", async () => {
  const restore = withSyncEnabled();
  const findMany = mock.fn(async () => {
    throw new Error("should never be called");
  });
  const restoreFindMany = stub(prisma.shipping, "findMany", findMany);

  const req = fakeReq({ headers: { authorization: "Bearer wrong-token-entirely" } });
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(res.statusCode, 401);
    assert.equal(findMany.mock.callCount(), 0);
  } finally {
    restore();
    restoreFindMany();
  }
});

test("empty bearer token (\"Bearer \" with nothing after): 401", async () => {
  const restore = withSyncEnabled();
  const req = fakeReq({ headers: { authorization: "Bearer " } });
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(res.statusCode, 401);
  } finally {
    restore();
  }
});

test("empty bearer token (whitespace only after Bearer): 401", async () => {
  const restore = withSyncEnabled();
  const req = fakeReq({ headers: { authorization: "Bearer    " } });
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(res.statusCode, 401);
  } finally {
    restore();
  }
});

test("Basic auth scheme: rejected with 401, never accepted as an alternative", async () => {
  const restore = withSyncEnabled();
  const req = fakeReq({ headers: { authorization: `Basic ${Buffer.from(`user:${REAL_SECRET}`).toString("base64")}` } });
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(res.statusCode, 401);
  } finally {
    restore();
  }
});

test("malformed Authorization header (no scheme, just the raw token): 401", async () => {
  const restore = withSyncEnabled();
  const req = fakeReq({ headers: { authorization: REAL_SECRET } });
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(res.statusCode, 401);
  } finally {
    restore();
  }
});

test("malformed Authorization header (\"Bearer\" with no space/token at all): 401", async () => {
  const restore = withSyncEnabled();
  const req = fakeReq({ headers: { authorization: "Bearer" } });
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(res.statusCode, 401);
  } finally {
    restore();
  }
});

test("the old Milestone 173 pattern — secret as a URL path param — no longer authenticates anything", async () => {
  const restore = withSyncEnabled();
  // Simulates a stale/misremembered caller still trying the old
  // /courier-guy/:webhookSecret/tracking-event shape — even if a
  // caller populated req.params this way, the handler must never read
  // req.params at all for authentication any more.
  const req = fakeReq({ params: { webhookSecret: REAL_SECRET }, headers: {} });
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(res.statusCode, 401);
  } finally {
    restore();
  }
});

test("the secret supplied as a query string parameter does not authenticate", async () => {
  const restore = withSyncEnabled();
  const req = fakeReq({ query: { secret: REAL_SECRET, webhookSecret: REAL_SECRET, token: REAL_SECRET }, headers: {} });
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(res.statusCode, 401);
  } finally {
    restore();
  }
});

test("the secret supplied in the request body does not authenticate", async () => {
  const restore = withSyncEnabled();
  const req = fakeReq({ body: { webhookSecret: REAL_SECRET, secret: REAL_SECRET }, headers: {} });
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(res.statusCode, 401);
  } finally {
    restore();
  }
});

test("correct bearer token: real sync service is invoked and a 200 is returned even for an unresolved-shipment outcome", async () => {
  const restore = withSyncEnabled();
  // $transaction stubbed to run its callback against the plain prisma
  // object instead of opening a real transaction — see
  // courierStatusSync.service.test.ts for why this is required.
  const restoreTransaction = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const findMany = mock.fn(async () => []); // genuinely unresolved — no matching Shipping row
  const restoreFindMany = stub(prisma.shipping, "findMany", findMany);

  const req = fakeReq({ headers: { authorization: `Bearer ${REAL_SECRET}` }, body: { id: "ship-1", status: "delivered" } });
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(findMany.mock.callCount(), 1, "payload processing proceeded unchanged after valid authentication");
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { received: true });
    assert.equal(next.mock.callCount(), 0);
  } finally {
    restore();
    restoreTransaction();
    restoreFindMany();
  }
});

test("bearer scheme is case-insensitive (\"bearer\"/\"BEARER\"), matching RFC 7235", async () => {
  const restore = withSyncEnabled();
  const restoreTransaction = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const restoreFindMany = stub(prisma.shipping, "findMany", async () => []);

  try {
    for (const scheme of ["bearer", "BEARER", "Bearer"]) {
      const req = fakeReq({ headers: { authorization: `${scheme} ${REAL_SECRET}` } });
      const res = fakeRes();
      const next = mock.fn();
      await courierGuyTrackingWebhookHandler(req, res as Response, next);
      assert.equal(res.statusCode, 200, `scheme "${scheme}" should authenticate`);
    }
  } finally {
    restore();
    restoreTransaction();
    restoreFindMany();
  }
});

test("correct secret, an unexpected internal error from the sync service: passed to next(), never a raw 500 leak or a crash", async () => {
  const restore = withSyncEnabled();
  const boom = new Error("unexpected database failure");
  const restoreTransaction = stub(prisma, "$transaction", async () => {
    throw boom;
  });

  const req = fakeReq({ headers: { authorization: `Bearer ${REAL_SECRET}` } });
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(next.mock.callCount(), 1);
    assert.equal(next.mock.calls[0]!.arguments[0], boom);
    assert.equal(res.statusCode, undefined, "no response sent — next() owns the error response");
  } finally {
    restore();
    restoreTransaction();
  }
});

test("Authorization header value is never echoed back in any response", async () => {
  const restore = withSyncEnabled();
  const req = fakeReq({ headers: { authorization: "Bearer wrong-token-value-should-never-appear-anywhere" } });
  const res = fakeRes();
  const next = mock.fn();

  try {
    await courierGuyTrackingWebhookHandler(req, res as Response, next);
    assert.equal(res.statusCode, 401);
    assert.ok(!JSON.stringify(res.body ?? {}).includes("wrong-token-value-should-never-appear-anywhere"));
  } finally {
    restore();
  }
});
