// Milestone 179, Part F: admin authentication security audit log.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import { hashIpAddress, listAdminSecurityEvents, recordAdminSecurityEvent } from "./adminSecurityEvent.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

test("hashIpAddress: same input always hashes the same, never returns the raw value", () => {
  const hash = hashIpAddress("203.0.113.7");
  assert.ok(hash);
  assert.notEqual(hash, "203.0.113.7");
  assert.equal(hash, hashIpAddress("203.0.113.7"));
});

test("hashIpAddress: null/undefined input hashes to null, never crashes", () => {
  assert.equal(hashIpAddress(null), null);
  assert.equal(hashIpAddress(undefined), null);
});

test("recordAdminSecurityEvent: writes eventType, a hashed IP (never the raw IP), and a truncated user agent", async () => {
  const create = stub(prisma.adminSecurityEvent, "create", async (args: { data: Record<string, unknown> }) => args.data);

  await recordAdminSecurityEvent({ adminUserId: "admin-1", eventType: "ADMIN_LOGIN_SUCCEEDED", ipAddress: "203.0.113.7", userAgent: "TestAgent/1.0" });

  assert.equal(create.fn.mock.callCount(), 1);
  const data = create.fn.mock.calls[0]!.arguments[0].data as Record<string, unknown>;
  assert.equal(data.adminUserId, "admin-1");
  assert.equal(data.eventType, "ADMIN_LOGIN_SUCCEEDED");
  assert.notEqual(data.ipHash, "203.0.113.7");
  assert.equal(data.userAgent, "TestAgent/1.0");

  create.restore();
});

test("recordAdminSecurityEvent: a long user agent is truncated to 255 characters, never stored unbounded", async () => {
  const create = stub(prisma.adminSecurityEvent, "create", async (args: { data: Record<string, unknown> }) => args.data);
  const longAgent = "A".repeat(500);

  await recordAdminSecurityEvent({ adminUserId: null, eventType: "ADMIN_LOGOUT", userAgent: longAgent });

  const data = create.fn.mock.calls[0]!.arguments[0].data as Record<string, unknown>;
  assert.equal((data.userAgent as string).length, 255);

  create.restore();
});

test("recordAdminSecurityEvent: never throws even when the database write itself fails — an audit-log failure must never break a real auth flow", async () => {
  const create = stub(prisma.adminSecurityEvent, "create", async () => {
    throw new Error("simulated database failure");
  });

  await assert.doesNotReject(() => recordAdminSecurityEvent({ adminUserId: "admin-1", eventType: "ADMIN_LOGIN_SUCCEEDED" }));

  create.restore();
});

test("listAdminSecurityEvents: returns only the safe narrow shape — never ipHash or a raw userAgent", async () => {
  const findMany = stub(prisma.adminSecurityEvent, "findMany", async () => [
    { id: "evt-1", adminUserId: "admin-1", eventType: "ADMIN_LOGIN_SUCCEEDED", summary: null, ipHash: "somehash", userAgent: "SomeAgent/1.0", createdAt: new Date() },
  ]);

  const result = await listAdminSecurityEvents("admin-1");
  assert.equal(result.length, 1);
  const event = result[0]! as unknown as Record<string, unknown>;
  assert.equal(event.ipHash, undefined);
  assert.equal(event.userAgent, undefined);
  assert.equal(event.id, "evt-1");

  findMany.restore();
});
