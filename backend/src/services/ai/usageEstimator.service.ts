// Content Studio Phase 3A, brief sections 29-30: usage estimation and
// a spending-safety boundary, designed now, deliberately inert now.
//
// No ProviderUsageRecord table exists — brief section 29 explicitly
// says persistence isn't required yet, and nothing has spent anything
// to record.

import type { AIRequest } from "./ai.types.js";

// A rough, clearly-labelled approximation only — brief section 29:
// "do not claim exact future provider cost where the provider has not
// been called." ~4 characters per token is a commonly used English-text
// approximation, not any specific tokenizer's real behaviour. The rate
// below is drawn from the Phase 1 architecture audit's own researched
// Claude Sonnet 5 standard pricing ($3 input / $15 output per million
// tokens) purely as a planning placeholder — no provider or model has
// actually been chosen or activated. Update both the moment Phase 3B
// picks a real provider and model.
const APPROX_CHARACTERS_PER_TOKEN = 4;
const APPROX_OUTPUT_TOKEN_ALLOWANCE = 1000;
const PLACEHOLDER_USD_PER_MILLION_INPUT_TOKENS = 3;
const PLACEHOLDER_USD_PER_MILLION_OUTPUT_TOKENS = 15;
// Also an approximation, not a live exchange rate — see the same
// caveat above.
const APPROX_USD_TO_ZAR = 18;

export interface UsageEstimate {
  purpose: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedMaxTokens: number;
  // Explicitly named "Approx" — never read as a committed or exact
  // figure anywhere this is displayed.
  estimatedCostZARApprox: number;
  basis: string;
}

export function estimateUsage(request: AIRequest): UsageEstimate {
  const inputCharacters = request.systemInstructions.length + request.task.length + JSON.stringify(request.context).length;
  const estimatedInputTokens = Math.ceil(inputCharacters / APPROX_CHARACTERS_PER_TOKEN);
  const estimatedOutputTokens = APPROX_OUTPUT_TOKEN_ALLOWANCE;
  const estimatedMaxTokens = estimatedInputTokens + estimatedOutputTokens;

  const inputCostUsd = (estimatedInputTokens / 1_000_000) * PLACEHOLDER_USD_PER_MILLION_INPUT_TOKENS;
  const outputCostUsd = (estimatedOutputTokens / 1_000_000) * PLACEHOLDER_USD_PER_MILLION_OUTPUT_TOKENS;
  const estimatedCostZARApprox = Math.round((inputCostUsd + outputCostUsd) * APPROX_USD_TO_ZAR * 100) / 100;

  return {
    purpose: request.purpose,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedMaxTokens,
    estimatedCostZARApprox,
    basis: "Rough planning estimate only. No AI provider is active; no real request has been priced.",
  };
}

// ---------------------------------------------------------------------------
// Spending safety boundary (brief section 30). A future paid call is
// required to pass this check before executing — designed now,
// deliberately hard-blocked now. Flipping this on is real provider
// activation work, explicitly out of scope for this phase.
// ---------------------------------------------------------------------------

export interface GenerationBudgetCheck {
  allowed: boolean;
  reason: string;
}

export function checkGenerationBudget(_estimate: UsageEstimate): GenerationBudgetCheck {
  return {
    allowed: false,
    reason: "Paid AI generation is not yet enabled. This is a Phase 3A design boundary — real budget persistence and provider activation belong to a later, separately approved phase.",
  };
}
