import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateUsage, checkGenerationBudget } from "./usageEstimator.service.js";
import type { AIRequest } from "./ai.types.js";

function baseRequest(overrides: Partial<AIRequest> = {}): AIRequest {
  return {
    purpose: "content-idea-generation",
    systemInstructions: "policy",
    context: { productName: "x" },
    task: "generate ideas",
    outputSchema: "ContentIdeaList",
    temperaturePolicy: "creative",
    metadata: {},
    ...overrides,
  };
}

test("estimateUsage: returns a positive token estimate and cost for a real request", () => {
  const estimate = estimateUsage(baseRequest());
  assert.ok(estimate.estimatedInputTokens > 0);
  assert.ok(estimate.estimatedMaxTokens > estimate.estimatedInputTokens);
  assert.ok(estimate.estimatedCostZARApprox >= 0);
  assert.equal(estimate.purpose, "content-idea-generation");
});

test("estimateUsage: a longer context produces a larger token estimate", () => {
  const short = estimateUsage(baseRequest({ context: { a: "x" } }));
  const long = estimateUsage(baseRequest({ context: { a: "x".repeat(5000) } }));
  assert.ok(long.estimatedInputTokens > short.estimatedInputTokens);
});

test("estimateUsage: the basis field explicitly states no real request has been priced", () => {
  const estimate = estimateUsage(baseRequest());
  assert.match(estimate.basis, /no real request has been priced/i);
});

test("checkGenerationBudget: always denies — Phase 3A ships no spending capability", () => {
  const estimate = estimateUsage(baseRequest());
  const check = checkGenerationBudget(estimate);
  assert.equal(check.allowed, false);
  assert.match(check.reason, /not yet enabled/i);
});

test("checkGenerationBudget: denies regardless of how small the estimate is", () => {
  const tinyRequest = baseRequest({ systemInstructions: "", task: "", context: {} });
  const estimate = estimateUsage(tinyRequest);
  const check = checkGenerationBudget(estimate);
  assert.equal(check.allowed, false);
});
