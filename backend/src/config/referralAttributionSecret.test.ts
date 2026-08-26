// Version 7, Milestone 172B.4.2: resolveReferralAttributionSecret() is a
// pure function (see config/env.ts), so this exercises it directly with
// every production/development combination — no module-reload/process-
// spawning tricks needed, same pattern as this file's own sibling
// oauthCallbackBaseUrl.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveReferralAttributionSecret, REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH } from "./env.js";
import { signReferralCapture, verifyReferralCapture } from "../utils/referralAttributionToken.js";

const VALID_SECRET = "a".repeat(REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH);

// ---------------------------------------------------------------------------
// Production: must be explicitly configured, never falls back.
// ---------------------------------------------------------------------------

test("production + configured valid secret -> resolves to that exact (trimmed) value", () => {
  const result = resolveReferralAttributionSecret({ isProduction: true, rawSecret: VALID_SECRET, minLength: REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH });
  assert.equal(result, VALID_SECRET);
});

test("production + a secret with surrounding whitespace -> trimmed before use and before length-checking", () => {
  const result = resolveReferralAttributionSecret({ isProduction: true, rawSecret: `  ${VALID_SECRET}  `, minLength: REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH });
  assert.equal(result, VALID_SECRET);
});

test("production + missing secret (undefined) -> throws a clear, non-secret startup error", () => {
  assert.throws(
    () => resolveReferralAttributionSecret({ isProduction: true, rawSecret: undefined, minLength: REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH }),
    (error: unknown) => error instanceof Error && /REFERRAL_ATTRIBUTION_SECRET is required in production/.test(error.message)
  );
});

test("production + empty string secret -> throws the same 'required' error as missing", () => {
  assert.throws(
    () => resolveReferralAttributionSecret({ isProduction: true, rawSecret: "", minLength: REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH }),
    (error: unknown) => error instanceof Error && /REFERRAL_ATTRIBUTION_SECRET is required in production/.test(error.message)
  );
});

test("production + whitespace-only secret -> throws the same 'required' error as missing", () => {
  assert.throws(
    () => resolveReferralAttributionSecret({ isProduction: true, rawSecret: "    ", minLength: REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH }),
    (error: unknown) => error instanceof Error && /REFERRAL_ATTRIBUTION_SECRET is required in production/.test(error.message)
  );
});

test("production + a real but too-short secret -> throws a distinct 'must be at least N characters' error, not the missing-value error", () => {
  assert.throws(
    () => resolveReferralAttributionSecret({ isProduction: true, rawSecret: "short-secret", minLength: REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH }),
    (error: unknown) => error instanceof Error && /must be at least 32 characters/.test(error.message)
  );
});

test("production + a secret exactly at the minimum length boundary -> accepted (never off-by-one rejected)", () => {
  const exactLength = "b".repeat(REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH);
  const result = resolveReferralAttributionSecret({ isProduction: true, rawSecret: exactLength, minLength: REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH });
  assert.equal(result, exactLength);
});

test("production + a secret one character below the minimum -> rejected", () => {
  const tooShort = "b".repeat(REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH - 1);
  assert.throws(
    () => resolveReferralAttributionSecret({ isProduction: true, rawSecret: tooShort, minLength: REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH }),
    (error: unknown) => error instanceof Error && /must be at least 32 characters/.test(error.message)
  );
});

test("no unnecessary character restrictions: a securely-generated hex/base64-shaped secret is accepted as-is", () => {
  const hexSecret = "f".repeat(64); // e.g. crypto.randomBytes(32).toString("hex")
  const base64ishSecret = "aB3-_dEf9+/Kx==".repeat(3); // base64url/base64-shaped, 45+ chars
  assert.equal(resolveReferralAttributionSecret({ isProduction: true, rawSecret: hexSecret, minLength: REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH }), hexSecret);
  assert.equal(
    resolveReferralAttributionSecret({ isProduction: true, rawSecret: base64ishSecret, minLength: REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH }),
    base64ishSecret
  );
});

// ---------------------------------------------------------------------------
// Development/test: existing permissive behaviour is preserved.
// ---------------------------------------------------------------------------

test("non-production (test/development) + missing secret -> resolves to null (never throws) so the caller can fall back to a random secret", () => {
  const result = resolveReferralAttributionSecret({ isProduction: false, rawSecret: undefined, minLength: REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH });
  assert.equal(result, null);
});

test("non-production + an explicitly configured secret -> used as-is, regardless of length (no production-only length gate applied)", () => {
  const shortDevSecret = "dev-only";
  const result = resolveReferralAttributionSecret({ isProduction: false, rawSecret: shortDevSecret, minLength: REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH });
  assert.equal(result, shortDevSecret);
});

test("non-production + empty/whitespace secret -> resolves to null, same as missing (never throws)", () => {
  assert.equal(resolveReferralAttributionSecret({ isProduction: false, rawSecret: "", minLength: REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH }), null);
  assert.equal(resolveReferralAttributionSecret({ isProduction: false, rawSecret: "   ", minLength: REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH }), null);
});

// ---------------------------------------------------------------------------
// The secret itself must never leak into a thrown error message.
// ---------------------------------------------------------------------------

test("a too-short secret's own value never appears in the thrown error message", () => {
  const secretLikeValue = "super-secret-value-do-not-leak";
  try {
    resolveReferralAttributionSecret({ isProduction: true, rawSecret: secretLikeValue, minLength: REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH });
    assert.fail("expected this too-short secret to be rejected");
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, new RegExp(secretLikeValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

// ---------------------------------------------------------------------------
// Signing behaviour itself is completely untouched by this milestone —
// canary regression against the currently-active resolved secret
// (whatever this test process resolved at startup).
// ---------------------------------------------------------------------------

test("regression canary: sign/verify still round-trips correctly, and a tampered signature is still rejected", () => {
  const signed = signReferralCapture("canary-code-172b42");
  const verified = verifyReferralCapture(signed);
  assert.ok(verified);
  assert.equal(verified!.code, "canary-code-172b42");

  const tampered = { ...signed, signature: "0".repeat(signed.signature.length) };
  assert.equal(verifyReferralCapture(tampered), null);
});
