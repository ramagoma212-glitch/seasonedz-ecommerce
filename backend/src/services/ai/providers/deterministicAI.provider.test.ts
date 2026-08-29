import { test } from "node:test";
import assert from "node:assert/strict";
import { DeterministicAIProvider } from "./deterministicAI.provider.js";
import { AIProviderError, type AIRequest } from "../ai.types.js";
import { validateMarketingStrategy } from "../contracts/marketingStrategy.contract.js";
import { validateContentIdea } from "../contracts/contentIdea.contract.js";
import { validateVideoScript, validateVisualBrief, validateCaptionPackage } from "../contracts/creativeOutputs.contract.js";
import { validateQualityCheckResult } from "../contracts/qualityCheck.contract.js";

function baseRequest(overrides: Partial<AIRequest> = {}): AIRequest {
  return {
    purpose: "test",
    systemInstructions: "system policy",
    context: { productName: "Colouring Book" },
    task: "do the thing",
    outputSchema: "MarketingStrategy",
    temperaturePolicy: "creative",
    metadata: {},
    ...overrides,
  };
}

test("generateStructured: MarketingStrategy output passes its own contract validator", async () => {
  const provider = new DeterministicAIProvider();
  const result = await provider.generateStructured(baseRequest({ outputSchema: "MarketingStrategy" }));
  const strategy = validateMarketingStrategy(result.data);
  assert.equal(strategy.product, "Colouring Book");
  assert.equal(result.provider, "deterministic");
});

test("generateStructured: ContentIdeaList output is an array whose every item passes ContentIdea validation", async () => {
  const provider = new DeterministicAIProvider();
  const result = await provider.generateStructured<unknown[]>(baseRequest({ outputSchema: "ContentIdeaList" }));
  assert.ok(Array.isArray(result.data));
  assert.ok(result.data.length > 0);
  for (const item of result.data) validateContentIdea(item);
});

test("generateStructured: VideoScript output passes its own contract validator", async () => {
  const provider = new DeterministicAIProvider();
  const result = await provider.generateStructured(baseRequest({ outputSchema: "VideoScript" }));
  const script = validateVideoScript(result.data);
  assert.ok(script.scenes.length > 0);
});

test("generateStructured: VisualBrief output passes its own contract validator", async () => {
  const provider = new DeterministicAIProvider();
  const result = await provider.generateStructured(baseRequest({ outputSchema: "VisualBrief" }));
  validateVisualBrief(result.data);
});

test("generateStructured: CaptionPackage output passes its own contract validator", async () => {
  const provider = new DeterministicAIProvider();
  const result = await provider.generateStructured(baseRequest({ outputSchema: "CaptionPackage" }));
  const captions = validateCaptionPackage(result.data);
  assert.equal(captions.platformVariants.length, 3);
});

test("generateStructured: QualityCheckResult output passes its own contract validator", async () => {
  const provider = new DeterministicAIProvider();
  const result = await provider.generateStructured(baseRequest({ outputSchema: "QualityCheckResult" }));
  validateQualityCheckResult(result.data);
});

test("generateStructured: deterministic — identical input produces byte-identical data on every call", async () => {
  const provider = new DeterministicAIProvider();
  const request = baseRequest({ outputSchema: "MarketingStrategy" });
  const first = await provider.generateStructured(request);
  const second = await provider.generateStructured(request);
  assert.deepEqual(first.data, second.data);
  // Only call metadata is allowed to differ.
  assert.notEqual(first.requestId, second.requestId);
});

test("generateStructured: output reflects the request's own context, not a fixed generic string", async () => {
  const provider = new DeterministicAIProvider();
  const result = await provider.generateStructured(baseRequest({ outputSchema: "MarketingStrategy", context: { productName: "Bible Colouring Set", audienceName: "Churches" } }));
  const strategy = validateMarketingStrategy(result.data);
  assert.equal(strategy.product, "Bible Colouring Set");
  assert.equal(strategy.primaryAudience, "Churches");
});

test("generateStructured: an unrecognised outputSchema is rejected with AIProviderError, never a silent empty result", async () => {
  const provider = new DeterministicAIProvider();
  await assert.rejects(
    () => provider.generateStructured(baseRequest({ outputSchema: "NotARealSchema" as never })),
    (error: unknown) => error instanceof AIProviderError
  );
});

test("generateStructured: usage counts are real, non-zero character counts, never a placeholder", async () => {
  const provider = new DeterministicAIProvider();
  const result = await provider.generateStructured(baseRequest({ outputSchema: "MarketingStrategy" }));
  assert.ok(result.usage.inputCharacters > 0);
  assert.ok(result.usage.outputCharacters > 0);
});
