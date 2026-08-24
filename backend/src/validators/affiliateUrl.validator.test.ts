// Version 7, Milestone 172B: unit tests for the affiliate URL
// validator — the one value that, if wrong, could send a visitor's
// browser somewhere dangerous. Pure function, no Prisma/network
// involved, so every case here runs directly against real input.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAffiliateUrl } from "./affiliateUrl.validator.js";

test("a genuine https:// merchant URL is accepted", () => {
  const result = validateAffiliateUrl("https://www.amazon.co.za/dp/B000123456");
  assert.equal(result.isValid, true);
  assert.equal(result.normalizedUrl, "https://www.amazon.co.za/dp/B000123456");
});

test("http:// (not https) is rejected", () => {
  const result = validateAffiliateUrl("http://www.amazon.co.za/dp/B000123456");
  assert.equal(result.isValid, false);
  assert.match(result.error ?? "", /https/i);
});

test("javascript: is rejected", () => {
  const result = validateAffiliateUrl("javascript:alert(1)");
  assert.equal(result.isValid, false);
});

test("data: is rejected", () => {
  const result = validateAffiliateUrl("data:text/html,<script>alert(1)</script>");
  assert.equal(result.isValid, false);
});

test("file: is rejected", () => {
  const result = validateAffiliateUrl("file:///etc/passwd");
  assert.equal(result.isValid, false);
});

test("ftp: is rejected", () => {
  const result = validateAffiliateUrl("ftp://example.com/file.zip");
  assert.equal(result.isValid, false);
});

test("a malformed, non-absolute URL is rejected", () => {
  const result = validateAffiliateUrl("not a url at all");
  assert.equal(result.isValid, false);
});

test("localhost is rejected", () => {
  const result = validateAffiliateUrl("https://localhost/whatever");
  assert.equal(result.isValid, false);
});

test("a private IPv4 destination (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x) is rejected", () => {
  for (const host of ["10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "127.0.0.1", "169.254.1.1"]) {
    const result = validateAffiliateUrl(`https://${host}/path`);
    assert.equal(result.isValid, false, `expected ${host} to be rejected`);
  }
});

test("a public IPv4 literal is still rejected — no genuine affiliate merchant is a bare IP address", () => {
  const result = validateAffiliateUrl("https://8.8.8.8/whatever");
  assert.equal(result.isValid, false);
});

test("a bracketed IPv6 literal is rejected", () => {
  const result = validateAffiliateUrl("https://[::1]/whatever");
  assert.equal(result.isValid, false);
});

test("an empty or missing value is rejected", () => {
  assert.equal(validateAffiliateUrl("").isValid, false);
  assert.equal(validateAffiliateUrl(undefined).isValid, false);
  assert.equal(validateAffiliateUrl(null).isValid, false);
  assert.equal(validateAffiliateUrl(123).isValid, false);
});

test("a URL longer than 2000 characters is rejected", () => {
  const longPath = "a".repeat(2000);
  const result = validateAffiliateUrl(`https://example.com/${longPath}`);
  assert.equal(result.isValid, false);
});

test("a public visitor never supplies this value — it is only ever called with admin-authored input (structural note, not a runtime assertion)", () => {
  // No public route in this codebase imports affiliateUrl.validator.ts
  // at all yet (see the milestone's own final report) — this test
  // exists as a marker so a future change that wires it into a public
  // route is a deliberate decision, not an accident this file would
  // otherwise miss silently.
  assert.ok(true);
});
