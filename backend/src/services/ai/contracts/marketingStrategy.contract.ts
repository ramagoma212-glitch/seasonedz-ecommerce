// Content Studio Phase 3A, brief section 9.
import { asObject, optionalString, requireEnum, requireString, requireStringArray } from "./contractValidation.util.js";

const CONTRACT_NAME = "MarketingStrategy";

export const CUSTOMER_JOURNEY_STAGES = ["AWARENESS", "CONSIDERATION", "DECISION", "RETENTION"] as const;
export type CustomerJourneyStage = (typeof CUSTOMER_JOURNEY_STAGES)[number];

export interface MarketingStrategy {
  objective: string;
  primaryAudience: string;
  // null, never omitted — every strategy explicitly states whether a
  // secondary audience was considered.
  secondaryAudience: string | null;
  product: string;
  contentPillar: string;
  customerJourneyStage: CustomerJourneyStage;
  marketingAngle: string;
  keyMessage: string;
  approvedBenefits: string[];
  prohibitedClaims: string[];
  recommendedContentTypes: string[];
  callToAction: string;
  // A concise BUSINESS explanation, e.g. "This concept targets parents
  // looking for screen free activities..." — never a place for hidden
  // model chain-of-thought. See this file's own validator: it is
  // capped at a sane length precisely so nothing resembling a raw
  // reasoning transcript can pass validation unnoticed (brief section
  // 9's own "do not store or request hidden model reasoning" rule).
  reasoningSummary: string;
}

const MAX_REASONING_SUMMARY_LENGTH = 600;

export function validateMarketingStrategy(raw: unknown): MarketingStrategy {
  const obj = asObject(raw, CONTRACT_NAME);
  const reasoningSummary = requireString(obj, "reasoningSummary", CONTRACT_NAME);
  if (reasoningSummary.length > MAX_REASONING_SUMMARY_LENGTH) {
    throw new Error(`${CONTRACT_NAME}.reasoningSummary: must be a concise business explanation (max ${MAX_REASONING_SUMMARY_LENGTH} characters), not a raw reasoning transcript.`);
  }

  return {
    objective: requireString(obj, "objective", CONTRACT_NAME),
    primaryAudience: requireString(obj, "primaryAudience", CONTRACT_NAME),
    secondaryAudience: optionalString(obj, "secondaryAudience", CONTRACT_NAME),
    product: requireString(obj, "product", CONTRACT_NAME),
    contentPillar: requireString(obj, "contentPillar", CONTRACT_NAME),
    customerJourneyStage: requireEnum(obj, "customerJourneyStage", CUSTOMER_JOURNEY_STAGES, CONTRACT_NAME),
    marketingAngle: requireString(obj, "marketingAngle", CONTRACT_NAME),
    keyMessage: requireString(obj, "keyMessage", CONTRACT_NAME),
    approvedBenefits: requireStringArray(obj, "approvedBenefits", CONTRACT_NAME),
    prohibitedClaims: requireStringArray(obj, "prohibitedClaims", CONTRACT_NAME),
    recommendedContentTypes: requireStringArray(obj, "recommendedContentTypes", CONTRACT_NAME),
    callToAction: requireString(obj, "callToAction", CONTRACT_NAME),
    reasoningSummary,
  };
}
