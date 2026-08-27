import { test } from "node:test";
import assert from "node:assert/strict";
import { nameLikelyMatches, addressLikelyMatches, identityNumberLikelyMatches, normaliseForMatching } from "./affiliateTextMatching.util.js";

test("normaliseForMatching: lowercases, strips punctuation, collapses whitespace", () => {
  assert.equal(normaliseForMatching("  Jane-Anne  O'Brien!! "), "jane anne o brien");
});

test("nameLikelyMatches: exact first+last name match", () => {
  assert.equal(nameLikelyMatches("Jane Smith", "This is to certify that Jane Smith is the account holder."), "MATCH");
});

test("nameLikelyMatches: case-insensitive match", () => {
  assert.equal(nameLikelyMatches("JANE SMITH", "jane smith account holder"), "MATCH");
});

test("nameLikelyMatches: tolerates a middle name/initial the document doesn't repeat", () => {
  assert.equal(nameLikelyMatches("Jane A Smith", "Account holder: Jane Smith"), "MATCH");
});

test("nameLikelyMatches: an initial matches any word starting with that letter", () => {
  assert.equal(nameLikelyMatches("J Smith", "Account holder: Jane Smith"), "MATCH");
});

test("nameLikelyMatches: a clearly different person is a MISMATCH", () => {
  assert.equal(nameLikelyMatches("Jane Smith", "Account holder: Peter Jones, statement date 2026-01-01"), "MISMATCH");
});

test("nameLikelyMatches: too little document text is MANUAL_REVIEW, never a guess", () => {
  assert.equal(nameLikelyMatches("Jane Smith", "hi"), "MANUAL_REVIEW");
  assert.equal(nameLikelyMatches("Jane Smith", null), "MANUAL_REVIEW");
});

test("nameLikelyMatches: only one of first/last found is MANUAL_REVIEW, not an automatic mismatch", () => {
  assert.equal(nameLikelyMatches("Jane Smith", "Account holder: Jane Peterson, statement date 2026-01-01"), "MANUAL_REVIEW");
});

const ADDRESS = { addressLine1: "12 Oak Road", suburb: "Sunnyside", city: "Pretoria", postalCode: "0002" };

test("addressLikelyMatches: postal code present is enough for MATCH", () => {
  assert.equal(addressLikelyMatches(ADDRESS, "Statement for account holder, address on file, postal code 0002."), "MATCH");
});

test("addressLikelyMatches: suburb + city both present is a MATCH", () => {
  assert.equal(addressLikelyMatches(ADDRESS, "Municipal account for a property in Sunnyside, Pretoria."), "MATCH");
});

test("addressLikelyMatches: tolerates Road/Rd abbreviation differences", () => {
  const doc = "Property address: 12 Oak Rd, Sunnyside, Pretoria.";
  assert.equal(addressLikelyMatches(ADDRESS, doc), "MATCH");
});

test("addressLikelyMatches: a clearly different address is a MISMATCH", () => {
  assert.equal(addressLikelyMatches(ADDRESS, "Property address: 45 Baobab Avenue, Rivonia, Sandton, postal code 2196."), "MISMATCH");
});

test("addressLikelyMatches: insufficient document text is MANUAL_REVIEW", () => {
  assert.equal(addressLikelyMatches(ADDRESS, null), "MANUAL_REVIEW");
});

test("identityNumberLikelyMatches: digits found verbatim is a MATCH", () => {
  assert.equal(identityNumberLikelyMatches("9001015008088", "Identity Document RSA ID No: 900101 5008 088"), "MATCH");
});

test("identityNumberLikelyMatches: never returns MISMATCH — absence is MANUAL_REVIEW, not a guessed mismatch", () => {
  assert.equal(identityNumberLikelyMatches("9001015008088", "Identity Document RSA, no visible number here"), "MANUAL_REVIEW");
  assert.equal(identityNumberLikelyMatches("9001015008088", null), "MANUAL_REVIEW");
});
