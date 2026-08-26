// Version 7, Milestone 173: defensive webhook payload parsing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCourierWebhookPayload, safeShapeSummary } from "./courierWebhook.service.js";

test("flat shipment-shaped payload: identifier and status extracted", () => {
  const result = parseCourierWebhookPayload({ id: "ship-123", tracking_reference: "TRK-999", status: "in-transit" });
  assert.ok(result.candidateIdentifiers.includes("ship-123"));
  assert.ok(result.candidateIdentifiers.includes("TRK-999"));
  assert.equal(result.rawStatus, "in-transit");
});

test("wrapped envelope payload ({ data: {...} }): unwrapped one level", () => {
  const result = parseCourierWebhookPayload({ topic: "tracking-event", data: { shipment_id: "ship-abc", status: "delivered" } });
  assert.ok(result.candidateIdentifiers.includes("ship-abc"));
  assert.equal(result.rawStatus, "delivered");
});

test("nested tracking_status.status shape: found via dot-path candidate", () => {
  const result = parseCourierWebhookPayload({ id: "ship-1", tracking_status: { status: "out-for-delivery", timestamp: "2026-08-20T10:00:00Z" } });
  assert.equal(result.rawStatus, "out-for-delivery");
  assert.ok(result.providerEventAt instanceof Date);
  assert.equal(result.providerEventAt?.toISOString(), "2026-08-20T10:00:00.000Z");
});

test("completely unrecognisable payload shape: never throws, returns empty/null", () => {
  const result = parseCourierWebhookPayload({ some_field: "unrelated", nested: { other: 1 } });
  assert.deepEqual(result.candidateIdentifiers, []);
  assert.equal(result.rawStatus, null);
  assert.equal(result.providerEventAt, null);
});

test("non-object payload (string, number, null, array): never throws, safe empty result", () => {
  for (const bad of ["a string", 42, null, undefined, [1, 2, 3]]) {
    const result = parseCourierWebhookPayload(bad);
    assert.deepEqual(result.candidateIdentifiers, []);
    assert.equal(result.rawStatus, null);
    assert.equal(result.providerEventAt, null);
  }
});

test("implausible timestamp (far future, far past, garbage string): rejected, providerEventAt stays null", () => {
  const farFuture = parseCourierWebhookPayload({ id: "s1", status: "in-transit", timestamp: "2099-01-01T00:00:00Z" });
  assert.equal(farFuture.providerEventAt, null);

  const farPast = parseCourierWebhookPayload({ id: "s1", status: "in-transit", timestamp: "1999-01-01T00:00:00Z" });
  assert.equal(farPast.providerEventAt, null);

  const garbage = parseCourierWebhookPayload({ id: "s1", status: "in-transit", timestamp: "not-a-date" });
  assert.equal(garbage.providerEventAt, null);
});

test("no timestamp field present at all: providerEventAt is null, never fabricated", () => {
  const result = parseCourierWebhookPayload({ id: "s1", status: "delivered" });
  assert.equal(result.providerEventAt, null);
});

test("numeric identifier/status-adjacent fields: coerced to string safely", () => {
  const result = parseCourierWebhookPayload({ id: 12345, status: "collected" });
  assert.ok(result.candidateIdentifiers.includes("12345"));
});

test("safeShapeSummary: only top-level key names, never values (no PII)", () => {
  const summary = safeShapeSummary({ id: "s1", customer_name: "Thandiwe Nkosi", address: "123 Real Street" });
  assert.ok(summary.includes("customer_name"));
  assert.ok(!summary.includes("Thandiwe"));
  assert.ok(!summary.includes("123 Real Street"));
});

test("safeShapeSummary on a non-object payload: returns a safe type label, never throws", () => {
  assert.equal(safeShapeSummary("just a string"), "string");
  assert.equal(safeShapeSummary(null), "object");
});
