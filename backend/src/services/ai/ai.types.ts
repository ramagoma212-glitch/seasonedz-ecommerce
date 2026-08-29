// Content Studio Phase 3A: provider-neutral AI abstraction. No file
// outside services/ai/providers/ may import an Anthropic, Gemini, or
// any other vendor SDK — every business service (context builder,
// pipeline, quality check) talks to this interface only, the same
// "one shared abstraction, swap the implementation" shape already
// proven by services/email/email.types.ts + providers/brevo.provider.ts.
//
// Phase 3A ships exactly one implementation: DeterministicAIProvider
// (providers/deterministicAI.provider.ts). No real provider (Claude or
// otherwise) is registered or called anywhere in this phase — see that
// file's own header comment.

// Which structured contract a request expects back — see
// contracts/*.ts for the actual shape/validator each name corresponds
// to. DeterministicAIProvider switches on this to pick a fixture
// family; a real future provider would use it to request matching
// structured output from the underlying model.
export const OUTPUT_SCHEMA_KINDS = ["MarketingStrategy", "ContentIdeaList", "VideoScript", "VisualBrief", "CaptionPackage", "QualityCheckResult"] as const;
export type OutputSchemaKind = (typeof OUTPUT_SCHEMA_KINDS)[number];

// A request's `systemInstructions` is the one field that must always
// come from trusted, hard-coded application code, never from a
// database value or user input. `context`/`task` carry retrieved data
// (Brand Knowledge, product facts, admin-entered text) and must be
// treated as DATA by any real provider implementation, never as
// authority that can redefine `systemInstructions` — see
// contentContext.service.ts's own prompt-injection-defence comment and
// its test for the concrete proof this separation holds even when
// retrieved data contains adversarial text.
export interface AIRequest<TOutputSchema = OutputSchemaKind> {
  // What this call is for, e.g. "content-idea-generation" — used for
  // usage estimation/logging, never sent to a provider as free text
  // instruction.
  purpose: string;
  // Trusted, hard-coded policy text only. Never interpolate a
  // database value or admin/user input directly into this field.
  systemInstructions: string;
  // Retrieved, structured business data (Brand Knowledge entries,
  // product facts, audience/pillar guidance) — always DATA, never
  // capable of overriding systemInstructions.
  context: Record<string, unknown>;
  // The specific task instruction for this call, e.g. "Generate 5
  // content ideas for the given product and audience."
  task: string;
  // Machine-readable description of the expected output shape — a
  // real provider implementation would use this to request structured
  // output; DeterministicAIProvider uses it only to pick which fixture
  // family to return.
  outputSchema: TOutputSchema;
  // "creative" allows more variation; "factual" should stay closer to
  // the literal source data. DeterministicAIProvider ignores this (its
  // output is always the same fixture for a given input), but the
  // field exists so a real provider has somewhere to receive the
  // instruction from Phase 3B onward.
  temperaturePolicy: "creative" | "factual";
  // Free-form, non-secret metadata for logging/debugging only (e.g.
  // productId, promptVersion) — never a place for a credential.
  metadata: Record<string, string | number | boolean | null>;
}

export interface AIUsage {
  // Character counts, not real provider token counts — this project
  // has never sent a request to a token-billed provider, so an exact
  // token count would be a fabricated precision. See
  // usageEstimator.service.ts for the explicit, honestly-labelled
  // estimate this project actually uses instead.
  inputCharacters: number;
  outputCharacters: number;
}

export interface AIResult<TData = unknown> {
  data: TData;
  provider: string;
  model: string;
  usage: AIUsage;
  latencyMs: number;
  // A stable id for this specific call, for future provenance/audit
  // trails — not persisted anywhere in Phase 3A (nothing generated
  // yet needs a provenance record), but every result carries one so
  // Phase 3B can start persisting it without an interface change.
  requestId: string;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

// generateStructured<T> is the ONLY method this interface exposes —
// deliberately narrow. There is no generateText()/chat()-style escape
// hatch that would let a caller receive unstructured prose and have to
// parse it itself (brief section 8's own "do not make later services
// parse arbitrary AI prose" rule).
export interface AIProvider {
  readonly name: string;
  generateStructured<T>(request: AIRequest): Promise<AIResult<T>>;
}
