import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMarketingStrategy } from "./marketingStrategy.contract.js";

function valid(overrides: Record<string, unknown> = {}) {
  return {
    objective: "Grow awareness",
    primaryAudience: "Parents",
    secondaryAudience: null,
    product: "Colouring Book",
    contentPillar: "Educational Colouring",
    customerJourneyStage: "AWARENESS",
    marketingAngle: "Everyday use",
    keyMessage: "Simple and useful",
    approvedBenefits: ["Easy to use"],
    prohibitedClaims: ["No medical claim"],
    recommendedContentTypes: ["Instagram Reel"],
    callToAction: "Shop now",
    reasoningSummary: "Targets parents interested in early learning.",
    ...overrides,
  };
}

test("accepts a fully valid strategy", () => {
  const result = validateMarketingStrategy(valid());
  assert.equal(result.product, "Colouring Book");
  assert.equal(result.secondaryAudience, null);
});

test("rejects a non-object", () => {
  assert.throws(() => validateMarketingStrategy("not an object"));
});

test("rejects a missing required field", () => {
  const input = valid();
  delete (input as Record<string, unknown>).objective;
  assert.throws(() => validateMarketingStrategy(input));
});

test("rejects an invalid customerJourneyStage", () => {
  assert.throws(() => validateMarketingStrategy(valid({ customerJourneyStage: "NOT_A_REAL_STAGE" })));
});

test("rejects approvedBenefits that isn't an array of strings", () => {
  assert.throws(() => validateMarketingStrategy(valid({ approvedBenefits: "not an array" })));
});

test("rejects a reasoningSummary that reads like a raw reasoning transcript (too long to be a concise business explanation)", () => {
  assert.throws(() => validateMarketingStrategy(valid({ reasoningSummary: "x".repeat(1000) })));
});

test("accepts an explicit secondaryAudience string", () => {
  const result = validateMarketingStrategy(valid({ secondaryAudience: "Teachers" }));
  assert.equal(result.secondaryAudience, "Teachers");
});
