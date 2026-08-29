// Content Studio Phase 3A, brief sections 27-28: the pipeline service
// architecture. Every stage below is independently callable — there is
// no orchestrating function that chains them, on purpose. Regenerating
// a caption calls generateCaptions() alone; it can never accidentally
// re-run generateStrategy()/generateScript() as a side effect, which
// is exactly what keeps a future regeneration cheap once a real
// provider is billed per call (brief section 28).
//
// Every function here takes an AIProvider as an explicit parameter —
// nothing in this file constructs or imports a specific provider.
// Tests and any local demonstration pass in `new
// DeterministicAIProvider()` themselves; no real provider exists to
// pass in yet.

import type { AIProvider, AIResult } from "./ai.types.js";
import type { ContentContext } from "./contentContext.service.js";
import { buildAIRequest } from "./promptBuilder.js";
import { PROMPT_VERSIONS } from "./promptVersions.js";
import { validateMarketingStrategy, type MarketingStrategy } from "./contracts/marketingStrategy.contract.js";
import { validateContentIdea, type ContentIdea } from "./contracts/contentIdea.contract.js";
import { validateVideoScript, validateVisualBrief, validateCaptionPackage, type VideoScript, type VisualBrief, type CaptionPackage } from "./contracts/creativeOutputs.contract.js";

export async function generateStrategy(provider: AIProvider, context: ContentContext): Promise<AIResult<MarketingStrategy>> {
  const request = buildAIRequest({
    purpose: "content-strategy",
    promptVersion: PROMPT_VERSIONS.CONTENT_STRATEGY,
    task: "Produce one marketing strategy for the given product, audience and content pillar.",
    outputSchema: "MarketingStrategy",
    context,
    temperaturePolicy: "factual",
  });
  const result = await provider.generateStructured<unknown>(request);
  return { ...result, data: validateMarketingStrategy(result.data) };
}

export async function generateIdeas(provider: AIProvider, context: ContentContext): Promise<AIResult<ContentIdea[]>> {
  const request = buildAIRequest({
    purpose: "content-idea-generation",
    promptVersion: PROMPT_VERSIONS.CONTENT_IDEA,
    task: "Produce a ranked list of content ideas for the given product, audience and content pillar.",
    outputSchema: "ContentIdeaList",
    context,
  });
  const result = await provider.generateStructured<unknown[]>(request);
  if (!Array.isArray(result.data)) {
    throw new Error("generateIdeas: expected an array of ContentIdea from the provider.");
  }
  return { ...result, data: result.data.map((item) => validateContentIdea(item)) };
}

export async function generateScript(provider: AIProvider, context: ContentContext): Promise<AIResult<VideoScript>> {
  const request = buildAIRequest({
    purpose: "video-script-generation",
    promptVersion: PROMPT_VERSIONS.VIDEO_SCRIPT,
    task: "Produce one short-form video script for the given product and content idea context.",
    outputSchema: "VideoScript",
    context,
  });
  const result = await provider.generateStructured<unknown>(request);
  return { ...result, data: validateVideoScript(result.data) };
}

export async function generateVisualBrief(provider: AIProvider, context: ContentContext): Promise<AIResult<VisualBrief>> {
  const request = buildAIRequest({
    purpose: "visual-brief-generation",
    promptVersion: PROMPT_VERSIONS.VISUAL_BRIEF,
    task: "Produce one detailed visual brief for the given product and content idea context.",
    outputSchema: "VisualBrief",
    context,
    temperaturePolicy: "factual",
  });
  const result = await provider.generateStructured<unknown>(request);
  return { ...result, data: validateVisualBrief(result.data) };
}

export async function generateCaptions(provider: AIProvider, context: ContentContext): Promise<AIResult<CaptionPackage>> {
  const request = buildAIRequest({
    purpose: "caption-generation",
    promptVersion: PROMPT_VERSIONS.CAPTION,
    task: "Produce a master caption and one adapted variant per requested platform.",
    outputSchema: "CaptionPackage",
    context,
  });
  const result = await provider.generateStructured<unknown>(request);
  return { ...result, data: validateCaptionPackage(result.data) };
}
