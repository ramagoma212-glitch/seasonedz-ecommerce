// Version 7, Milestone 172B.4: tests the actual tamper-evidence
// guarantee this module exists for — a signature must verify for
// exactly the (code, capturedAt) pair it was issued for, and must
// reject any attempt to substitute a different capturedAt (the whole
// point: a client can carry the token, but cannot edit its age).
import { test } from "node:test";
import assert from "node:assert/strict";
import { signReferralCapture, verifyReferralCapture, captureAgeInDays } from "./referralAttributionToken.js";

test("a freshly signed capture verifies successfully", () => {
  const signed = signReferralCapture("alice-1");
  const verified = verifyReferralCapture(signed);
  assert.ok(verified);
  assert.equal(verified!.code, "alice-1");
  assert.equal(verified!.capturedAt, signed.capturedAt);
});

test("editing capturedAt after signing invalidates the signature — the tamper this module exists to prevent", () => {
  const signed = signReferralCapture("alice-1", new Date("2026-01-01T00:00:00.000Z"));
  const tampered = { ...signed, capturedAt: new Date().toISOString() };
  assert.equal(verifyReferralCapture(tampered), null);
});

test("editing the code after signing invalidates the signature", () => {
  const signed = signReferralCapture("alice-1");
  const tampered = { ...signed, code: "bob-2" };
  assert.equal(verifyReferralCapture(tampered), null);
});

test("a garbage/forged signature is rejected, never throws", () => {
  assert.equal(verifyReferralCapture({ code: "alice-1", capturedAt: new Date().toISOString(), signature: "not-real-hex" }), null);
  assert.equal(verifyReferralCapture({ code: "alice-1", capturedAt: new Date().toISOString(), signature: "" }), null);
});

test("a malformed shape (missing fields, wrong types, null) is rejected without throwing", () => {
  assert.equal(verifyReferralCapture(null), null);
  assert.equal(verifyReferralCapture("just a string"), null);
  assert.equal(verifyReferralCapture({ code: "alice-1" }), null);
  assert.equal(verifyReferralCapture({ code: 123, capturedAt: "x", signature: "y" }), null);
});

test("captureAgeInDays measures elapsed days correctly", () => {
  const capturedAt = new Date("2026-01-01T00:00:00.000Z").toISOString();
  const now = new Date("2026-01-31T00:00:00.000Z");
  assert.equal(captureAgeInDays(capturedAt, now), 30);
});
