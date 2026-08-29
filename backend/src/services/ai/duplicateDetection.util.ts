// Content Studio Phase 3A, brief section 25: simple deterministic
// comparison only — no embeddings, no semantic similarity. These
// utilities will later operate against real ContentItem history once
// Phase 3B+ starts persisting generated content; nothing calls them
// against real history yet, since no ContentItem exists.

export function normaliseForComparison(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isExactDuplicate(a: string, b: string): boolean {
  return a === b;
}

export function isNormalisedDuplicate(a: string, b: string): boolean {
  return normaliseForComparison(a) === normaliseForComparison(b);
}

// Returns every normalised value that appears more than once in the
// input list, each exactly once — useful for flagging a batch of newly
// generated captions/hooks/scripts against each other before any of
// them reach history.
export function findNormalisedDuplicates(values: string[]): string[] {
  const seen = new Map<string, number>();
  for (const value of values) {
    const normalised = normaliseForComparison(value);
    seen.set(normalised, (seen.get(normalised) ?? 0) + 1);
  }
  return Array.from(seen.entries())
    .filter(([, count]) => count > 1)
    .map(([normalised]) => normalised);
}

export function isCaptionDuplicate(a: string, b: string): boolean {
  return isNormalisedDuplicate(a, b);
}

export function isHookDuplicate(a: string, b: string): boolean {
  return isNormalisedDuplicate(a, b);
}

// Scripts are compared exactly, not normalised — two scripts differing
// only by whitespace/casing are still meaningfully different scripts,
// unlike a caption or a hook.
export function isScriptDuplicate(a: string, b: string): boolean {
  return isExactDuplicate(a, b);
}
