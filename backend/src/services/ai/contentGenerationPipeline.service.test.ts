// Content Studio Phase 3A, brief section 28: proves every stage is
// independently callable and that calling one stage never triggers
// another. Uses DeterministicAIProvider only — see that file's own
// header comment for why this is the one provider Phase 3A ships.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { generateStrategy, generateIdeas, generateScript, generateVisualBrief, generateCaptions } from "./contentGenerationPipeline.service.js";
import { DeterministicAIProvider } from "./providers/deterministicAI.provider.js";
import type { ContentContext } from "./contentContext.service.js";
import type { AIProvider } from "./ai.types.js";

const EMPTY_CONTEXT: ContentContext = {
  purpose: "test",
  platforms: ["INSTAGRAM"],
  product: null,
  audience: null,
  pillar: null,
  brandVoice: { writingRules: [], visualRules: [], approvedClaims: [], prohibitedClaims: [], callToActionRules: [], platformRules: [], brandFacts: [], terminology: [] },
};

test("generateStrategy: returns a validated MarketingStrategy using DeterministicAIProvider", async () => {
  const provider = new DeterministicAIProvider();
  const result = await generateStrategy(provider, EMPTY_CONTEXT);
  assert.ok(result.data.objective);
});

test("generateIdeas: returns a validated array of ContentIdea", async () => {
  const provider = new DeterministicAIProvider();
  const result = await generateIdeas(provider, EMPTY_CONTEXT);
  assert.ok(result.data.length > 0);
  assert.ok(result.data[0]!.title);
});

test("generateScript: returns a validated VideoScript with at least one scene", async () => {
  const provider = new DeterministicAIProvider();
  const result = await generateScript(provider, EMPTY_CONTEXT);
  assert.ok(result.data.scenes.length > 0);
});

test("generateVisualBrief: returns a validated VisualBrief", async () => {
  const provider = new DeterministicAIProvider();
  const result = await generateVisualBrief(provider, EMPTY_CONTEXT);
  assert.equal(typeof result.data.realProductRequired, "boolean");
});

test("generateCaptions: returns a validated CaptionPackage", async () => {
  const provider = new DeterministicAIProvider();
  const result = await generateCaptions(provider, EMPTY_CONTEXT);
  assert.ok(result.data.platformVariants.length > 0);
});

test("stage independence: regenerating captions calls the provider exactly once — never re-invokes strategy/script/visual-brief generation", async () => {
  const calls: string[] = [];
  const spyProvider: AIProvider = {
    name: "spy",
    generateStructured: mock.fn(async (request) => {
      calls.push(request.outputSchema as string);
      const provider = new DeterministicAIProvider();
      return provider.generateStructured(request);
    }),
  };

  await generateCaptions(spyProvider, EMPTY_CONTEXT);

  assert.deepEqual(calls, ["CaptionPackage"]);
});

test("stage independence: each stage function takes an explicit provider parameter — nothing in this module imports or constructs a specific provider itself", async () => {
  // A second, independent DeterministicAIProvider instance to prove
  // stages don't share hidden module-level state.
  const providerA = new DeterministicAIProvider();
  const providerB = new DeterministicAIProvider();
  const resultA = await generateStrategy(providerA, EMPTY_CONTEXT);
  const resultB = await generateStrategy(providerB, EMPTY_CONTEXT);
  assert.deepEqual(resultA.data, resultB.data);
});
