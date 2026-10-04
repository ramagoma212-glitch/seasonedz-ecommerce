// Milestone 201: money precision for quotations. Every amount must be exact
// to the cent: no float rounding, no silently dropped decimals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { centsToDecimalString, formatRand, MoneyError, parseMoneyToCents } from "./quotationMoney.js";

test("parses whole and two-decimal amounts exactly into integer cents", () => {
  assert.equal(parseMoneyToCents("120", "Price"), 12000);
  assert.equal(parseMoneyToCents("120.5", "Price"), 12050);
  assert.equal(parseMoneyToCents("120.50", "Price"), 12050);
  assert.equal(parseMoneyToCents("0.01", "Price"), 1);
  assert.equal(parseMoneyToCents("  99.99 ", "Price"), 9999);
  assert.equal(parseMoneyToCents(19.99, "Price"), 1999);
});

test("rejects amounts with more than two decimals instead of rounding them", () => {
  assert.throws(() => parseMoneyToCents("10.005", "Price"), MoneyError);
  assert.throws(() => parseMoneyToCents(10.005, "Price"), MoneyError);
});

test("rejects negative, malformed, scientific and empty amounts", () => {
  for (const bad of ["-5", "abc", "1e3", "", "1,000", "R100", "1.2.3", ".5"]) {
    assert.throws(() => parseMoneyToCents(bad, "Price"), MoneyError, `expected ${JSON.stringify(bad)} to be rejected`);
  }
  assert.throws(() => parseMoneyToCents(-1, "Price"), MoneyError);
  assert.throws(() => parseMoneyToCents(undefined, "Price"), MoneyError);
  assert.throws(() => parseMoneyToCents(Number.NaN, "Price"), MoneyError);
});

test("rejects amounts beyond the Decimal(10,2) range", () => {
  assert.throws(() => parseMoneyToCents("123456789", "Price"), MoneyError);
});

test("formats Decimal(10,2) strings from integer cents with two decimals", () => {
  assert.equal(centsToDecimalString(0), "0.00");
  assert.equal(centsToDecimalString(5), "0.05");
  assert.equal(centsToDecimalString(12050), "120.50");
  assert.equal(centsToDecimalString(123456789), "1234567.89");
});

test("formats display amounts with thousands separators and no floating-point drift", () => {
  assert.equal(formatRand(0), "R0.00");
  assert.equal(formatRand(9950), "R99.50");
  assert.equal(formatRand(120000), "R1,200.00");
  assert.equal(formatRand(123456789), "R1,234,567.89");
});

test("summing many prices stays exact where float arithmetic drifts", () => {
  const prices = Array.from({ length: 1000 }, () => parseMoneyToCents("0.10", "Price"));
  assert.equal(prices.reduce((sum, value) => sum + value, 0), 10000);
});
