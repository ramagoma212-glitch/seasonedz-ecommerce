// Version 7, Milestone 176: LEVEL 2 (document-type classification) and
// LEVEL 3 (data matching) — brief section 17. LEVEL 1 (file validation:
// extension/MIME/magic bytes/size) lives in affiliateDocument.service.ts,
// run before a file is ever handed to this module. LEVEL 4 (document
// authenticity) does not exist anywhere in this codebase and never will
// without the owner explicitly approving a real verification provider
// (brief section 17/82) — nothing here or anywhere in this milestone
// ever claims "Identity Verified" or performs Home Affairs/bank
// verification.
//
// Classification is keyword/structure-based, not machine learning — a
// small set of independently-scored "categories" per document type
// (brief section 19: "use multiple characteristics rather than one
// keyword... do not require all possible fields"). Every function here
// is pure and synchronous over already-extracted text; nothing here
// touches the database, network, or filesystem, and nothing here logs
// or returns the raw text it was given (brief section 43) — only a
// short, safe, human-readable reason string ever leaves this module.

import { addressLikelyMatches, identityNumberLikelyMatches, nameLikelyMatches, normaliseForMatching, type AffiliateMatchResult } from "./affiliateTextMatching.util.js";

export type AffiliateDocumentTypeKey = "SA_ID" | "PASSPORT" | "BANK_STATEMENT" | "MUNICIPAL_ACCOUNT_OR_LETTER";

interface CategoryCheck {
  label: string;
  test: (normalisedText: string, rawText: string) => boolean;
}

const BANK_NAMES = ["absa", "fnb", "first national bank", "standard bank", "nedbank", "capitec", "african bank", "bidvest bank", "discovery bank", "tymebank", "investec", "bank zero", "sasfin"];

const BANK_STATEMENT_CATEGORIES: CategoryCheck[] = [
  { label: "a recognised South African bank name", test: (t) => BANK_NAMES.some((name) => t.includes(name)) },
  { label: "statement wording", test: (t) => /(statement|account summary|opening balance|closing balance|statement period)/.test(t) },
  { label: "account holder wording", test: (t) => /(account holder|account name|account number)/.test(t) },
  { label: "transaction/summary structure", test: (t) => /(transaction|debit|credit|balance brought forward)/.test(t) },
  { label: "bank registration/contact details", test: (t) => /(authorised financial services provider|registered bank|swift|branch code)/.test(t) },
];

const MUNICIPAL_CATEGORIES: CategoryCheck[] = [
  { label: "municipal wording", test: (t) => /(municipality|municipal)/.test(t) },
  { label: "rates/account wording", test: (t) => /(rates and taxes|account number|erf number|property valuation|consumer number)/.test(t) },
  { label: "an address", test: (t, raw) => /\b\d{4}\b/.test(raw) && /(street|road|avenue|suburb)/.test(t) },
  { label: "a document date", test: (_t, raw) => /\b(19|20)\d{2}\b/.test(raw) },
];

const SA_ID_CATEGORIES: CategoryCheck[] = [
  { label: "Republic of South Africa wording", test: (t) => /(republic of south africa|\brsa\b)/.test(t) },
  { label: "identity document wording", test: (t) => /(identity document|identity number|id number)/.test(t) },
  { label: "a 13-digit number", test: (_t, raw) => /\b\d{13}\b/.test(raw.replace(/\s+/g, "")) },
  { label: "Home Affairs wording", test: (t) => /department of home affairs/.test(t) },
  { label: "smart ID/green book wording", test: (t) => /(smart id card|identity card)/.test(t) },
];

const PASSPORT_CATEGORIES: CategoryCheck[] = [
  { label: "passport wording", test: (t) => /passport/.test(t) },
  { label: "a machine-readable zone pattern", test: (_t, raw) => /P<[A-Z<]{3,}/.test(raw) || /<{5,}/.test(raw) },
  { label: "issue/expiry/nationality wording", test: (t) => ["date of issue", "date of expiry", "nationality"].filter((w) => t.includes(w)).length >= 2 },
  { label: "passport number wording", test: (t) => /passport no|passport number/.test(t) },
  { label: "given names/surname wording", test: (t) => /(given names|surname)/.test(t) && t.includes("passport") },
];

const CATEGORY_SETS: Record<AffiliateDocumentTypeKey, CategoryCheck[]> = {
  SA_ID: SA_ID_CATEGORIES,
  PASSPORT: PASSPORT_CATEGORIES,
  BANK_STATEMENT: BANK_STATEMENT_CATEGORIES,
  MUNICIPAL_ACCOUNT_OR_LETTER: MUNICIPAL_CATEGORIES,
};

const TYPE_LABELS: Record<AffiliateDocumentTypeKey, string> = {
  SA_ID: "a South African ID",
  PASSPORT: "a passport",
  BANK_STATEMENT: "a bank statement",
  MUNICIPAL_ACCOUNT_OR_LETTER: "a municipal account or letter",
};

function scoreType(type: AffiliateDocumentTypeKey, normalisedText: string, rawText: string): { score: number; matched: string[] } {
  const matched = CATEGORY_SETS[type].filter((c) => c.test(normalisedText, rawText)).map((c) => c.label);
  return { score: matched.length, matched };
}

const MATCH_THRESHOLD = 2;

export interface DocumentTypeClassificationResult {
  result: AffiliateMatchResult;
  reason: string;
}

// Compares the SELECTED type's score against every other type's score.
// See this file's own header comment and the Milestone 176 final
// report's own reasoning for why an inconclusive (all-low-score)
// document — e.g. a plain invoice or an unrelated photo — is honestly
// MANUAL_REVIEW rather than MISMATCH: MISMATCH is reserved for genuinely
// strong, confident evidence of a *specific different* document type
// (brief section 24's "avoid false rejection").
export function classifyDocumentType(selectedType: AffiliateDocumentTypeKey, extractedText: string | null): DocumentTypeClassificationResult {
  if (!extractedText || extractedText.trim().length < 10) {
    return {
      result: "MANUAL_REVIEW",
      reason: "Automated text extraction was not available for this file — flagged for manual review.",
    };
  }

  const normalisedText = normaliseForMatching(extractedText);
  const scores = (Object.keys(CATEGORY_SETS) as AffiliateDocumentTypeKey[]).map((type) => ({ type, ...scoreType(type, normalisedText, extractedText) }));
  const selected = scores.find((s) => s.type === selectedType);
  const bestOther = scores.filter((s) => s.type !== selectedType).sort((a, b) => b.score - a.score)[0];

  if (!selected) {
    return { result: "MANUAL_REVIEW", reason: "Could not classify this document — flagged for manual review." };
  }

  // MATCH: the selected type clears the minimum bar AND is at least as
  // strong a fit as any other type.
  if (selected.score >= MATCH_THRESHOLD && (!bestOther || selected.score >= bestOther.score)) {
    return {
      result: "MATCH",
      reason: `Document type confirmed — detected ${selected.matched.join(", ")}.`,
    };
  }

  // MISMATCH: a different type clears the minimum bar and confidently,
  // clearly outscores the selected type — strong positive evidence of a
  // specific *other* document, not merely "the selected type scored
  // low" (brief section 24's own false-rejection caution; see this
  // file's own header comment and the Milestone 176 final report for
  // the worked reasoning).
  if (bestOther && bestOther.score >= MATCH_THRESHOLD && bestOther.score - selected.score >= 2) {
    return {
      result: "MISMATCH",
      reason: `This document does not appear to be ${TYPE_LABELS[selectedType]} — it more closely resembles ${TYPE_LABELS[bestOther.type]}. Please upload the correct document type.`,
    };
  }

  return {
    result: "MANUAL_REVIEW",
    reason: "This document could not be confidently classified — flagged for manual review.",
  };
}

export interface AffiliatePersonalMatchInputs {
  fullName: string;
  idOrPassportNumber?: string;
  address?: { addressLine1: string; suburb: string; city: string; postalCode: string };
}

export interface DataMatchResults {
  nameMatchResult: AffiliateMatchResult;
  idNumberMatchResult: AffiliateMatchResult | null;
  addressMatchResult: AffiliateMatchResult | null;
}

// LEVEL 3 — brief sections 25-27. Only ever compares against the
// document this call is FOR (an identity document checks name + id
// number; a proof-of-residence document checks name + address) — never
// mixes fields across an unrelated document.
export function matchExtractedData(inputs: AffiliatePersonalMatchInputs, extractedText: string | null): DataMatchResults {
  return {
    nameMatchResult: nameLikelyMatches(inputs.fullName, extractedText),
    idNumberMatchResult: inputs.idOrPassportNumber ? identityNumberLikelyMatches(inputs.idOrPassportNumber, extractedText) : null,
    addressMatchResult: inputs.address ? addressLikelyMatches(inputs.address, extractedText) : null,
  };
}
