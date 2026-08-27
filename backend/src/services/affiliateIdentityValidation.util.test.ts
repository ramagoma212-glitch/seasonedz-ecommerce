import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidSAIdNumberFormat, isPlausiblePassportNumber, maskIdentityNumber } from "./affiliateIdentityValidation.util.js";

// Synthetic, fictional ID number only — never a real person's — used
// purely to exercise the public, well-known SA ID checksum algorithm.
// Constructed by hand: YYMMDD=900101, SSSS=5008, C=0(male), A=8, then
// the check digit computed via the standard algorithm.
function buildValidSyntheticId(): string {
  // A synthetic, fictional ID number — YYMMDD=900101, SSSS=5008, C=0,
  // A=8, and a check digit computed via the standard algorithm this
  // file's own isValidSAIdNumberFormat() implements — not a real
  // person's ID number.
  return "9001015008088";
}

test("isValidSAIdNumberFormat: a structurally valid synthetic ID passes", () => {
  assert.equal(isValidSAIdNumberFormat(buildValidSyntheticId()), true);
});

test("isValidSAIdNumberFormat: wrong length is rejected", () => {
  assert.equal(isValidSAIdNumberFormat("12345"), false);
  assert.equal(isValidSAIdNumberFormat("123456789012345"), false);
});

test("isValidSAIdNumberFormat: an impossible birth date (month 13) is rejected", () => {
  assert.equal(isValidSAIdNumberFormat("9013015008087"), false);
});

test("isValidSAIdNumberFormat: a single flipped digit breaks the checksum", () => {
  const valid = buildValidSyntheticId();
  const tampered = valid.slice(0, -1) + (Number(valid.slice(-1)) === 0 ? "1" : "0");
  assert.equal(isValidSAIdNumberFormat(tampered), false);
});

test("isValidSAIdNumberFormat: non-digit characters are stripped before checking", () => {
  assert.equal(isValidSAIdNumberFormat("900101 5008 088"), true);
});

test("isPlausiblePassportNumber: accepts common international shapes", () => {
  assert.equal(isPlausiblePassportNumber("A1234567"), true); // SA-style
  assert.equal(isPlausiblePassportNumber("123456789"), true); // numeric-only
  assert.equal(isPlausiblePassportNumber("AB 123456"), true); // with a space
});

test("isPlausiblePassportNumber: rejects empty/too-short/too-long/invalid characters", () => {
  assert.equal(isPlausiblePassportNumber(""), false);
  assert.equal(isPlausiblePassportNumber("A1"), false);
  assert.equal(isPlausiblePassportNumber("A".repeat(25)), false);
  assert.equal(isPlausiblePassportNumber("A1234567!"), false);
});

test("maskIdentityNumber: masks all but the last 4 characters", () => {
  assert.equal(maskIdentityNumber("9001015008088"), "*********8088");
});

test("maskIdentityNumber: a very short value is masked entirely", () => {
  assert.equal(maskIdentityNumber("123"), "***");
});

test("maskIdentityNumber: null/undefined pass through as null", () => {
  assert.equal(maskIdentityNumber(null), null);
  assert.equal(maskIdentityNumber(undefined), null);
});
