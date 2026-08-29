import { test } from "node:test";
import assert from "node:assert/strict";
import { validateContentIdea, validateContentHook } from "./contentIdea.contract.js";

function validHook(overrides: Record<string, unknown> = {}) {
  return {
    spokenHook: "Here's how families use this.",
    visualHook: "Product in use, natural light.",
    textOverlayHook: null,
    hookType: "STORY",
    targetAudience: "Parents",
    reason: "Grounded in a real use case.",
    ...overrides,
  };
}

function validIdea(overrides: Record<string, unknown> = {}) {
  return {
    title: "A calm afternoon",
    concept: "Show real use at home.",
    hook: validHook(),
    pillar: "Educational Colouring",
    targetAudience: "Parents",
    productId: null,
    contentType: "Instagram Reel",
    platformSuitability: ["INSTAGRAM"],
    marketingAngle: "Everyday use",
    callToAction: "Shop now",
    whyThisIdea: "Relevant and grounded",
    noveltySignals: ["angle-1"],
    ...overrides,
  };
}

test("ContentHook: accepts a fully valid hook", () => {
  const hook = validateContentHook(validHook());
  assert.equal(hook.hookType, "STORY");
});

test("ContentHook: rejects an unknown hookType", () => {
  assert.throws(() => validateContentHook(validHook({ hookType: "CLICKBAIT" })));
});

test("ContentIdea: accepts a fully valid idea, including its nested hook", () => {
  const idea = validateContentIdea(validIdea());
  assert.equal(idea.hook.hookType, "STORY");
  assert.equal(idea.productId, null);
});

test("ContentIdea: accepts an explicit productId string without validating it exists (that happens one layer up, with real database access)", () => {
  const idea = validateContentIdea(validIdea({ productId: "some-id" }));
  assert.equal(idea.productId, "some-id");
});

test("ContentIdea: rejects a missing title", () => {
  const input = validIdea();
  delete (input as Record<string, unknown>).title;
  assert.throws(() => validateContentIdea(input));
});

test("ContentIdea: rejects a malformed nested hook", () => {
  assert.throws(() => validateContentIdea(validIdea({ hook: { spokenHook: "only this field" } })));
});

test("ContentIdea: rejects platformSuitability that isn't an array of strings", () => {
  assert.throws(() => validateContentIdea(validIdea({ platformSuitability: "INSTAGRAM" })));
});
