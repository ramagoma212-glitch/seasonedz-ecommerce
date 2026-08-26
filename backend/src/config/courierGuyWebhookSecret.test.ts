// Version 7, Milestone 173: same pattern as referralAttributionSecret.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCourierGuyWebhookSecret, COURIER_GUY_WEBHOOK_SECRET_MIN_LENGTH } from "./env.js";

const LONG_SECRET = "a".repeat(COURIER_GUY_WEBHOOK_SECRET_MIN_LENGTH);
const SHORT_SECRET = "too-short";

test("sync disabled: returns whatever is set, never validates", () => {
  assert.equal(resolveCourierGuyWebhookSecret({ statusSyncEnabled: false, rawSecret: undefined, minLength: COURIER_GUY_WEBHOOK_SECRET_MIN_LENGTH }), undefined);
  assert.equal(resolveCourierGuyWebhookSecret({ statusSyncEnabled: false, rawSecret: SHORT_SECRET, minLength: COURIER_GUY_WEBHOOK_SECRET_MIN_LENGTH }), SHORT_SECRET);
});

test("sync enabled, no secret set: throws a clear error", () => {
  assert.throws(
    () => resolveCourierGuyWebhookSecret({ statusSyncEnabled: true, rawSecret: undefined, minLength: COURIER_GUY_WEBHOOK_SECRET_MIN_LENGTH }),
    /COURIER_GUY_WEBHOOK_SECRET is not set/
  );
});

test("sync enabled, blank/whitespace-only secret: throws same as unset", () => {
  assert.throws(() => resolveCourierGuyWebhookSecret({ statusSyncEnabled: true, rawSecret: "   ", minLength: COURIER_GUY_WEBHOOK_SECRET_MIN_LENGTH }), /is not set/);
});

test("sync enabled, secret shorter than minimum: throws", () => {
  assert.throws(
    () => resolveCourierGuyWebhookSecret({ statusSyncEnabled: true, rawSecret: SHORT_SECRET, minLength: COURIER_GUY_WEBHOOK_SECRET_MIN_LENGTH }),
    /must be at least 24 characters/
  );
});

test("sync enabled, secret exactly at minimum length: accepted", () => {
  assert.equal(resolveCourierGuyWebhookSecret({ statusSyncEnabled: true, rawSecret: LONG_SECRET, minLength: COURIER_GUY_WEBHOOK_SECRET_MIN_LENGTH }), LONG_SECRET);
});

test("sync enabled, secret with surrounding whitespace: trimmed before validation and return", () => {
  const result = resolveCourierGuyWebhookSecret({ statusSyncEnabled: true, rawSecret: `  ${LONG_SECRET}  `, minLength: COURIER_GUY_WEBHOOK_SECRET_MIN_LENGTH });
  assert.equal(result, LONG_SECRET);
});
