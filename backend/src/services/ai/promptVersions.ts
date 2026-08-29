// Content Studio Phase 3A, brief section 20: every future generated
// item must be traceable to the prompt/template version that produced
// it. This is intentionally a flat set of string constants, not a
// visual prompt editor or a database table — nothing is persisted yet
// (nothing is generated yet), so there is nothing for a table to
// track. When Phase 3B+ starts writing real ContentItem rows, each one
// stores the exact version string used, taken from here.
//
// Bump a constant's value (never mutate what an existing version
// string means) whenever its corresponding task instructions or
// output contract changes in a way that would make old and new output
// meaningfully different.

export const PROMPT_VERSIONS = {
  CONTENT_STRATEGY: "CONTENT_STRATEGY_V1",
  CONTENT_IDEA: "CONTENT_IDEA_V1",
  VIDEO_SCRIPT: "VIDEO_SCRIPT_V1",
  VISUAL_BRIEF: "VISUAL_BRIEF_V1",
  CAPTION: "CAPTION_V1",
  QUALITY_CHECK: "QUALITY_CHECK_V1",
} as const;

export type PromptVersionKey = keyof typeof PROMPT_VERSIONS;
export type PromptVersion = (typeof PROMPT_VERSIONS)[PromptVersionKey];

export function isKnownPromptVersion(value: string): value is PromptVersion {
  return (Object.values(PROMPT_VERSIONS) as string[]).includes(value);
}
