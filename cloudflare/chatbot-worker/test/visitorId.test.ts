import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidVisitorId } from "../src/visitorId";

test("accepts a real crypto.randomUUID() shape", () => {
  assert.equal(isValidVisitorId("d3b07384-d9a0-4e8b-8b3a-3f1c2d4e5f6a"), true);
});

test("accepts an uppercase UUID too", () => {
  assert.equal(isValidVisitorId("D3B07384-D9A0-4E8B-8B3A-3F1C2D4E5F6A"), true);
});

test("rejects a malformed short value", () => {
  assert.equal(isValidVisitorId("not-a-uuid"), false);
});

test("rejects a very long/oversized value", () => {
  assert.equal(isValidVisitorId("a".repeat(500)), false);
});

test("rejects a missing/non-string value", () => {
  assert.equal(isValidVisitorId(undefined), false);
  assert.equal(isValidVisitorId(null), false);
  assert.equal(isValidVisitorId(12345), false);
  assert.equal(isValidVisitorId({}), false);
});
