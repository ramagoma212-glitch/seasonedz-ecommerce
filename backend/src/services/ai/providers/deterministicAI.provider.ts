// Content Studio Phase 3A, brief section 7: a deterministic local
// provider for development, unit testing and the admin context
// preview. Returns structured, realistic fixtures built from the
// request's own context (so a preview against a real product still
// feels grounded), NEVER a random or uncontrolled response — the same
// AIRequest always produces the same AIResult.data, byte for byte
// (only `requestId` and `latencyMs` vary between calls, since those
// are call metadata, not content).
//
// This makes the complete generation pipeline testable end to end
// with zero API key and zero cost. It is called "Deterministic" in
// every internal identifier and log line — brief section 7's own rule
// against labelling it "fake AI" anywhere customer/admin visible
// applies to UI copy, not this file's own code identifiers, which
// exist to be searched and understood by engineers.
//
// No Anthropic/Gemini/OpenAI import exists anywhere in this file or
// this directory. This is the ONLY AIProvider implementation Phase 3A
// ships.

import { randomUUID } from "node:crypto";
import type { AIProvider, AIRequest, AIResult, OutputSchemaKind } from "../ai.types.js";
import { AIProviderError } from "../ai.types.js";
import type { MarketingStrategy } from "../contracts/marketingStrategy.contract.js";
import type { ContentIdea } from "../contracts/contentIdea.contract.js";
import type { CaptionPackage, VideoScript, VisualBrief } from "../contracts/creativeOutputs.contract.js";
import type { QualityCheckResult } from "../contracts/qualityCheck.contract.js";
import { PROMPT_VERSIONS } from "../promptVersions.js";

const PROVIDER_NAME = "deterministic";
const MODEL_NAME = "deterministic-fixture-v1";

function contextString(context: Record<string, unknown>, key: string, fallback: string): string {
  const value = context[key];
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function buildMarketingStrategy(context: Record<string, unknown>): MarketingStrategy {
  const product = contextString(context, "productName", "a Seasonedz product");
  const audience = contextString(context, "audienceName", "Seasonedz customers");
  const pillar = contextString(context, "pillarName", "General");

  return {
    objective: `Grow awareness of ${product} among ${audience}.`,
    primaryAudience: audience,
    secondaryAudience: null,
    product,
    contentPillar: pillar,
    customerJourneyStage: "AWARENESS",
    marketingAngle: `Show how ${product} fits naturally into ${audience.toLowerCase()}'s everyday routine.`,
    keyMessage: `${product} makes screen-free creative time simple.`,
    approvedBenefits: [`${product} is easy to use at home`, "Encourages screen-free creative time"],
    prohibitedClaims: ["Do not claim a medical or educational guarantee.", "Do not invent a rating, award or certification."],
    recommendedContentTypes: ["Instagram Reel", "Instagram post"],
    callToAction: "Shop now at Seasonedz Group.",
    reasoningSummary: `This concept targets ${audience.toLowerCase()} interested in ${pillar.toLowerCase()}, and shows how ${product} fits their routine.`,
  };
}

function buildContentIdeaList(context: Record<string, unknown>): ContentIdea[] {
  const product = contextString(context, "productName", "a Seasonedz product");
  const audience = contextString(context, "audienceName", "Seasonedz customers");
  const pillar = contextString(context, "pillarName", "General");
  const productId = typeof context.productId === "string" ? context.productId : null;

  const angles = [
    { title: `A calm afternoon with ${product}`, hookType: "STORY" as const },
    { title: `Why ${audience} choose ${product}`, hookType: "DIRECT_BENEFIT" as const },
    { title: `Three ways to use ${product} this week`, hookType: "CURIOSITY" as const },
  ];

  return angles.map((angle, index) => ({
    title: angle.title,
    concept: `Show ${product} being used in a real, everyday moment relevant to ${audience.toLowerCase()}.`,
    hook: {
      spokenHook: `Here's how ${audience.toLowerCase()} are using ${product}.`,
      visualHook: `${product} in use, natural lighting, no crowded scene.`,
      textOverlayHook: null,
      hookType: angle.hookType,
      targetAudience: audience,
      reason: "Grounded in a real use case rather than a formula.",
    },
    pillar,
    targetAudience: audience,
    productId,
    contentType: index === 0 ? "Instagram Reel" : "Instagram post",
    platformSuitability: index === 0 ? ["INSTAGRAM", "TIKTOK"] : ["INSTAGRAM", "FACEBOOK"],
    marketingAngle: "Everyday, practical use, not an aspirational claim.",
    callToAction: "Shop now at Seasonedz Group.",
    whyThisIdea: `Directly relevant to ${audience.toLowerCase()} and grounded in ${pillar.toLowerCase()}.`,
    noveltySignals: [`angle-${index + 1}`],
  }));
}

function buildVideoScript(context: Record<string, unknown>): VideoScript {
  const product = contextString(context, "productName", "a Seasonedz product");
  const productId = typeof context.productId === "string" ? context.productId : null;

  return {
    title: `A calm afternoon with ${product}`,
    duration: 24,
    hook: {
      spokenHook: `Here's how families are using ${product}.`,
      visualHook: `${product} in use on a table, natural light.`,
      textOverlayHook: null,
      hookType: "STORY",
      targetAudience: "Families",
      reason: "Grounded in a real use case rather than a formula.",
    },
    scenes: [
      { sceneNumber: 1, durationSeconds: 3, visual: `${product} on a table`, action: "Hands open the product.", cameraDirection: "Overhead, static", voiceover: `Here's how families are using ${product}.`, onScreenText: null },
      { sceneNumber: 2, durationSeconds: 15, visual: "A child colouring at the table", action: "Colouring in progress, natural movement.", cameraDirection: "Eye level, slow pan", voiceover: "A few quiet minutes, screen free.", onScreenText: null },
      { sceneNumber: 3, durationSeconds: 6, visual: `${product} packaging beside the finished page`, action: "Camera settles on the product.", cameraDirection: "Static, close up", voiceover: "Shop now at Seasonedz Group.", onScreenText: "Shop now" },
    ],
    voiceover: `Here's how families are using ${product}. A few quiet minutes, screen free. Shop now at Seasonedz Group.`,
    onScreenText: "Shop now",
    productReference: productId,
    callToAction: "Shop now at Seasonedz Group.",
  };
}

function buildVisualBrief(context: Record<string, unknown>): VisualBrief {
  const product = contextString(context, "productName", "a Seasonedz product");
  const productAssetIds = Array.isArray(context.productAssetIds) ? (context.productAssetIds as string[]) : [];

  return {
    subject: `${product}, in genuine use`,
    environment: "A real home setting, a table with natural light.",
    composition: "Clean, spacious, product clearly visible, not crowded.",
    cameraPosition: "Eye level or slightly above.",
    cameraMovement: "Slow, minimal movement only.",
    lighting: "Realistic, natural lighting with natural shadows.",
    visualStyle: "Warm, calm, true to Seasonedz's own brand direction.",
    action: "A person genuinely using the product, unscripted-feeling.",
    emotion: "Calm, focused, quietly content.",
    pacing: "Slow and unhurried.",
    aspectRatio: "9:16",
    duration: 24,
    brandDirection: "Andika font where any text overlay is required; real Seasonedz logo only, unmodified.",
    realProductRequired: true,
    productAssetIds,
    textOverlayRequirements: "Minimal text, only the closing call to action.",
    continuityRequirements: "The product must look identical in every shot.",
    negativeInstructions: "No invented packaging, no invented book covers or pages, no crowded scene, no fabricated logo.",
    safetyRequirements: "No claim beyond what is in the approved benefits list.",
  };
}

function buildCaptionPackage(context: Record<string, unknown>): CaptionPackage {
  const product = contextString(context, "productName", "a Seasonedz product");
  const master = `A few quiet minutes with ${product}. Screen free, easy to start, made for real family time.`;

  return {
    masterCaption: master,
    platformVariants: [
      { platform: "INSTAGRAM", caption: master, hashtags: ["#SeasonedzGroup", "#ScreenFreeTime"], callToAction: "Shop now, link in bio." },
      { platform: "FACEBOOK", caption: `${master} See the full range at Seasonedz Group.`, hashtags: [], callToAction: "Shop now at Seasonedz Group." },
      { platform: "TIKTOK", caption: `A few quiet minutes with ${product}.`, hashtags: ["#SeasonedzGroup"], callToAction: "Shop now, link in bio." },
    ],
    callToAction: "Shop now at Seasonedz Group.",
    hashtags: ["#SeasonedzGroup"],
    destinationUrl: null,
  };
}

function buildQualityCheckResult(): QualityCheckResult {
  return {
    passed: true,
    issues: [],
    checkedAt: new Date(0).toISOString(),
    checkVersion: PROMPT_VERSIONS.QUALITY_CHECK,
  };
}

const FIXTURE_BUILDERS: Record<OutputSchemaKind, (context: Record<string, unknown>) => unknown> = {
  MarketingStrategy: buildMarketingStrategy,
  ContentIdeaList: buildContentIdeaList,
  VideoScript: buildVideoScript,
  VisualBrief: buildVisualBrief,
  CaptionPackage: buildCaptionPackage,
  QualityCheckResult: buildQualityCheckResult,
};

export class DeterministicAIProvider implements AIProvider {
  readonly name = PROVIDER_NAME;

  async generateStructured<T>(request: AIRequest): Promise<AIResult<T>> {
    const startedAt = Date.now();
    const builder = FIXTURE_BUILDERS[request.outputSchema as OutputSchemaKind];
    if (!builder) {
      throw new AIProviderError(`No deterministic fixture registered for outputSchema "${String(request.outputSchema)}".`, PROVIDER_NAME);
    }

    const data = builder(request.context) as T;
    const inputCharacters = request.systemInstructions.length + request.task.length + JSON.stringify(request.context).length;
    const outputCharacters = JSON.stringify(data).length;

    return {
      data,
      provider: this.name,
      model: MODEL_NAME,
      usage: { inputCharacters, outputCharacters },
      latencyMs: Date.now() - startedAt,
      requestId: randomUUID(),
    };
  }
}
