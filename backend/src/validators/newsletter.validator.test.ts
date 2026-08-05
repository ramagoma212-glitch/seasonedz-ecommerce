// Pure-function unit tests, no Prisma/database connection. Run with:
// npx tsx --test src/validators/newsletter.validator.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNewsletterSubscribeRequest } from "./newsletter.validator.js";

test("accepts a valid name and email", () => {
  const result = validateNewsletterSubscribeRequest({ name: "Thandiwe Nkosi", email: "thandiwe@example.com" });
  assert.equal(result.isValid, true);
  assert.equal(result.value?.name, "Thandiwe Nkosi");
  assert.equal(result.value?.email, "thandiwe@example.com");
  assert.equal(result.value?.isSpam, false);
});

test("trims whitespace from name and email", () => {
  const result = validateNewsletterSubscribeRequest({ name: "  Thandiwe Nkosi  ", email: "  thandiwe@example.com  " });
  assert.equal(result.isValid, true);
  assert.equal(result.value?.name, "Thandiwe Nkosi");
  assert.equal(result.value?.email, "thandiwe@example.com");
});

test("normalises email to lowercase for duplicate detection", () => {
  const result = validateNewsletterSubscribeRequest({ name: "Thandiwe", email: "Thandiwe@Example.COM" });
  assert.equal(result.isValid, true);
  assert.equal(result.value?.email, "thandiwe@example.com");
});

test("rejects a missing name", () => {
  const result = validateNewsletterSubscribeRequest({ email: "thandiwe@example.com" });
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.field === "name"));
});

test("rejects a blank/whitespace-only name", () => {
  const result = validateNewsletterSubscribeRequest({ name: "   ", email: "thandiwe@example.com" });
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.field === "name"));
});

test("rejects a name over 100 characters", () => {
  const result = validateNewsletterSubscribeRequest({ name: "A".repeat(101), email: "thandiwe@example.com" });
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.field === "name"));
});

test("rejects a missing email", () => {
  const result = validateNewsletterSubscribeRequest({ name: "Thandiwe" });
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.field === "email"));
});

test("rejects an invalid email", () => {
  const result = validateNewsletterSubscribeRequest({ name: "Thandiwe", email: "not-an-email" });
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.field === "email"));
});

test("rejects an email over 254 characters", () => {
  const longEmail = `${"a".repeat(250)}@example.com`;
  const result = validateNewsletterSubscribeRequest({ name: "Thandiwe", email: longEmail });
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.field === "email"));
});

test("reports both errors when name and email are both missing", () => {
  const result = validateNewsletterSubscribeRequest({});
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.field === "name"));
  assert.ok(result.errors.some((e) => e.field === "email"));
});

test("a filled honeypot field is treated as spam and bypasses name/email validation entirely", () => {
  const result = validateNewsletterSubscribeRequest({ website: "http://spam.example" });
  assert.equal(result.isValid, true);
  assert.equal(result.value?.isSpam, true);
});

test("an empty honeypot field is not treated as spam", () => {
  const result = validateNewsletterSubscribeRequest({ name: "Thandiwe", email: "thandiwe@example.com", website: "" });
  assert.equal(result.isValid, true);
  assert.equal(result.value?.isSpam, false);
});
