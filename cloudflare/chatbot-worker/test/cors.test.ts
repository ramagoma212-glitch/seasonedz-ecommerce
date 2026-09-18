import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin } from "../src/cors";

test("allows the real production www origin", () => {
  assert.equal(isAllowedOrigin("https://www.seasonedzgroup.co.za", "production"), true);
});

test("allows the real production apex origin", () => {
  assert.equal(isAllowedOrigin("https://seasonedzgroup.co.za", "production"), true);
});

test("rejects an unapproved origin in production", () => {
  assert.equal(isAllowedOrigin("https://evil.example.com", "production"), false);
});

test("rejects localhost in production", () => {
  assert.equal(isAllowedOrigin("http://localhost:5173", "production"), false);
});

test("allows localhost outside production", () => {
  assert.equal(isAllowedOrigin("http://localhost:5173", "development"), true);
});

test("rejects a missing origin", () => {
  assert.equal(isAllowedOrigin(null, "production"), false);
});

test("rejects a plausible-looking but wrong subdomain", () => {
  assert.equal(isAllowedOrigin("https://admin.seasonedzgroup.co.za", "production"), false);
  assert.equal(isAllowedOrigin("https://seasonedzgroup.co.za.evil.com", "production"), false);
});
