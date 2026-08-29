import { test } from "node:test";
import assert from "node:assert/strict";
import { validateQualityCheckResult } from "./qualityCheck.contract.js";

function valid(overrides: Record<string, unknown> = {}) {
  return {
    passed: true,
    issues: [],
    checkedAt: new Date().toISOString(),
    checkVersion: "QUALITY_CHECK_V1",
    ...overrides,
  };
}

test("accepts a passing result with no issues", () => {
  const result = validateQualityCheckResult(valid());
  assert.equal(result.passed, true);
});

test("accepts a failing result with a well-formed issue", () => {
  const result = validateQualityCheckResult(
    valid({ passed: false, issues: [{ code: "MISSING_CTA", severity: "ERROR", message: "No CTA.", field: "callToAction" }] })
  );
  assert.equal(result.issues.length, 1);
});

test("rejects an issue with an unknown severity", () => {
  assert.throws(() => validateQualityCheckResult(valid({ issues: [{ code: "X", severity: "CRITICAL", message: "m", field: null }] })));
});

test("rejects a passed field that isn't a boolean", () => {
  assert.throws(() => validateQualityCheckResult(valid({ passed: "yes" })));
});
