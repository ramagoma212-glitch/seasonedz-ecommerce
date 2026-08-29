// Content Studio Phase 3A, brief sections 10-11.
import { asObject, optionalString, requireEnum, requireString, requireStringArray } from "./contractValidation.util.js";

const IDEA_CONTRACT = "ContentIdea";
const HOOK_CONTRACT = "ContentHook";

export const HOOK_TYPES = ["QUESTION", "STATEMENT", "PROBLEM_SOLUTION", "CURIOSITY", "DIRECT_BENEFIT", "STORY"] as const;
export type HookType = (typeof HOOK_TYPES)[number];

export interface ContentHook {
  spokenHook: string;
  visualHook: string;
  textOverlayHook: string | null;
  hookType: HookType;
  targetAudience: string;
  reason: string;
}

// Brief section 11's own explicit examples of formulas not to lean on
// repeatedly. Checked case-insensitively against spokenHook/
// textOverlayHook by qualityCheck.service.ts's checkHookVariety(), not
// here — a single hook using one of these isn't invalid on its own
// (this contract still accepts it), only REPEATED use across a set of
// ideas is what quality control flags. See that file's own comment.
export const OVERUSED_HOOK_FORMULAS = ["stop scrolling", "pov", "you won't believe"] as const;

export function validateContentHook(raw: unknown): ContentHook {
  const obj = asObject(raw, HOOK_CONTRACT);
  return {
    spokenHook: requireString(obj, "spokenHook", HOOK_CONTRACT),
    visualHook: requireString(obj, "visualHook", HOOK_CONTRACT),
    textOverlayHook: optionalString(obj, "textOverlayHook", HOOK_CONTRACT),
    hookType: requireEnum(obj, "hookType", HOOK_TYPES, HOOK_CONTRACT),
    targetAudience: requireString(obj, "targetAudience", HOOK_CONTRACT),
    reason: requireString(obj, "reason", HOOK_CONTRACT),
  };
}

export interface ContentIdea {
  title: string;
  concept: string;
  hook: ContentHook;
  pillar: string;
  targetAudience: string;
  // Never trusted as-is — see this file's own header comment.
  // Existence against a real Product row is checked by
  // contentContext.service.ts's validateProductReference(), which has
  // database access this contract module deliberately does not.
  productId: string | null;
  contentType: string;
  platformSuitability: string[];
  marketingAngle: string;
  callToAction: string;
  whyThisIdea: string;
  noveltySignals: string[];
}

// A provider must never be trusted to invent a real Product's
// identity — this contract only checks that productId, if present, is
// a plausible string. The actual "does this product exist" check
// happens one layer up, with real database access (brief section 10:
// "Do not allow the provider to invent Product IDs. Product
// references must be validated against real Product records.").
export function validateContentIdea(raw: unknown): ContentIdea {
  const obj = asObject(raw, IDEA_CONTRACT);
  return {
    title: requireString(obj, "title", IDEA_CONTRACT),
    concept: requireString(obj, "concept", IDEA_CONTRACT),
    hook: validateContentHook(obj.hook),
    pillar: requireString(obj, "pillar", IDEA_CONTRACT),
    targetAudience: requireString(obj, "targetAudience", IDEA_CONTRACT),
    productId: optionalString(obj, "productId", IDEA_CONTRACT),
    contentType: requireString(obj, "contentType", IDEA_CONTRACT),
    platformSuitability: requireStringArray(obj, "platformSuitability", IDEA_CONTRACT),
    marketingAngle: requireString(obj, "marketingAngle", IDEA_CONTRACT),
    callToAction: requireString(obj, "callToAction", IDEA_CONTRACT),
    whyThisIdea: requireString(obj, "whyThisIdea", IDEA_CONTRACT),
    noveltySignals: requireStringArray(obj, "noveltySignals", IDEA_CONTRACT),
  };
}
