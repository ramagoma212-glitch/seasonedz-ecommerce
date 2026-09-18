import { test } from "node:test";
import assert from "node:assert/strict";
import { containsSensitiveInfo } from "../src/sensitiveData";

test("detects an email address", () => {
  assert.equal(containsSensitiveInfo("my email is jane.doe@example.com"), true);
});

test("detects a South African phone number", () => {
  assert.equal(containsSensitiveInfo("call me on 082 345 6789"), true);
  assert.equal(containsSensitiveInfo("+27 82 345 6789"), true);
});

test("detects a card-like number", () => {
  assert.equal(containsSensitiveInfo("my card number is 4111 1111 1111 1111"), true);
});

test("detects an OTP statement", () => {
  assert.equal(containsSensitiveInfo("my OTP is 483920"), true);
});

test("detects an SA ID number shape", () => {
  assert.equal(containsSensitiveInfo("my id number is 9001015800086"), true);
});

test("detects a password statement", () => {
  assert.equal(containsSensitiveInfo("my password is hunter2"), true);
});

test("does not flag an ordinary Seasonedz product question", () => {
  assert.equal(containsSensitiveInfo("Do you have colouring books for adults?"), false);
  assert.equal(containsSensitiveInfo("How much is delivery to Cape Town?"), false);
  assert.equal(containsSensitiveInfo("What's the price of the ABC colouring book?"), false);
});
