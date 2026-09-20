import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAndNormalizeIsbn, validateAndNormalizeGtin, normalizeIdentifierDigits, ProductIdentifierError } from "./productIdentifiers.js";

test("normalizeIdentifierDigits strips hyphens and spaces without touching the digits", () => {
  assert.equal(normalizeIdentifierDigits("978-0-306-40615-7"), "9780306406157");
  assert.equal(normalizeIdentifierDigits("978 0 306 40615 7"), "9780306406157");
  assert.equal(normalizeIdentifierDigits("9780306406157"), "9780306406157");
});

// A well-known, widely-cited valid ISBN-13 (Wikipedia's own ISBN check-digit example).
test("validateAndNormalizeIsbn accepts a genuine, correctly-checksummed ISBN-13", () => {
  assert.equal(validateAndNormalizeIsbn("978-0-306-40615-7"), "9780306406157");
});

test("validateAndNormalizeIsbn accepts a 979-prefixed ISBN-13", () => {
  // 9791234567896 — a 979-prefixed 13-digit number with a valid check digit.
  assert.equal(validateAndNormalizeIsbn("979-1-234-56789-6"), "9791234567896");
});

test("validateAndNormalizeIsbn rejects a wrong check digit — never silently accepts a typo", () => {
  assert.throws(() => validateAndNormalizeIsbn("978-0-306-40615-8"), ProductIdentifierError);
});

test("validateAndNormalizeIsbn rejects a non-13-digit value", () => {
  assert.throws(() => validateAndNormalizeIsbn("12345"), ProductIdentifierError);
});

test("validateAndNormalizeIsbn rejects a 13-digit number that doesn't start with 978/979", () => {
  assert.throws(() => validateAndNormalizeIsbn("1234567890128"), ProductIdentifierError);
});

test("validateAndNormalizeIsbn never fabricates or repairs a check digit — only ever validates what was entered", () => {
  assert.throws(() => validateAndNormalizeIsbn("978-0-306-40615-0"), ProductIdentifierError);
});

// EAN-13 (Wikipedia's own worked example).
test("validateAndNormalizeGtin accepts a genuine EAN-13/GTIN-13", () => {
  assert.equal(validateAndNormalizeGtin("4006381333931"), "4006381333931");
});

// UPC-A / GTIN-12 (Wikipedia's own worked example).
test("validateAndNormalizeGtin accepts a genuine UPC-A/GTIN-12", () => {
  assert.equal(validateAndNormalizeGtin("036000291452"), "036000291452");
});

// EAN-8 / GTIN-8 (Wikipedia's own worked example).
test("validateAndNormalizeGtin accepts a genuine EAN-8/GTIN-8", () => {
  assert.equal(validateAndNormalizeGtin("96385074"), "96385074");
});

test("validateAndNormalizeGtin accepts a book's own ISBN-13 as its barcode — never assumes gtin must differ from isbn", () => {
  assert.equal(validateAndNormalizeGtin("978-0-306-40615-7"), "9780306406157");
});

test("validateAndNormalizeGtin rejects an invalid length (e.g. 10 digits)", () => {
  assert.throws(() => validateAndNormalizeGtin("1234567890"), ProductIdentifierError);
});

test("validateAndNormalizeGtin rejects a wrong check digit", () => {
  assert.throws(() => validateAndNormalizeGtin("4006381333930"), ProductIdentifierError);
});

test("validateAndNormalizeGtin rejects non-digit characters other than hyphens/spaces", () => {
  assert.throws(() => validateAndNormalizeGtin("4006381333X31"), ProductIdentifierError);
});
