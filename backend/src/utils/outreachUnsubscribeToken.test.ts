// Milestone 198, Part 26 (UNSUBSCRIBE): the signed-token mechanics —
// same style as referralAttributionToken.test.ts's own coverage for the
// sibling HMAC utility.
import { test } from "node:test";
import assert from "node:assert/strict";
import { signOutreachUnsubscribeToken, verifyOutreachUnsubscribeToken } from "./outreachUnsubscribeToken.js";

test("a genuinely signed token round-trips back to the same contact id", () => {
  const token = signOutreachUnsubscribeToken("contact-123");
  assert.equal(verifyOutreachUnsubscribeToken(token), "contact-123");
});

test("a tampered contact id (same signature, different id) is rejected", () => {
  const token = signOutreachUnsubscribeToken("contact-123");
  const [, signature] = token.split(".");
  const tampered = `contact-999.${signature}`;
  assert.equal(verifyOutreachUnsubscribeToken(tampered), null);
});

test("a forged signature is rejected", () => {
  assert.equal(verifyOutreachUnsubscribeToken("contact-123.notarealsignature"), null);
});

test("a malformed token is rejected, never throws", () => {
  assert.equal(verifyOutreachUnsubscribeToken(""), null);
  assert.equal(verifyOutreachUnsubscribeToken("no-dot-separator"), null);
  assert.equal(verifyOutreachUnsubscribeToken(undefined), null);
  assert.equal(verifyOutreachUnsubscribeToken(12345), null);
});

test("two different contact ids never produce the same token", () => {
  assert.notEqual(signOutreachUnsubscribeToken("contact-1"), signOutreachUnsubscribeToken("contact-2"));
});
