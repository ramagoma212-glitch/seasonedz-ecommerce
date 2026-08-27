// Version 7, Milestone 176: normalisation/comparison helpers shared by
// affiliateDocumentClassification.service.ts's data-matching checks
// (brief sections 25-27). Deliberately conservative — every function
// here returns MANUAL_REVIEW rather than guessing whenever the input is
// too sparse to be confident either way; only a genuinely strong signal
// ever produces MATCH or MISMATCH. Never logs or persists the raw
// document text passed in — see documentTextExtraction.service.ts's own
// header comment.

export type AffiliateMatchResult = "MATCH" | "MISMATCH" | "MANUAL_REVIEW";

// Case-insensitive, whitespace-safe, punctuation-stripped — "Do not
// require exact punctuation" (brief sections 25/27).
export function normaliseForMatching(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents (café -> cafe)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(raw: string): string[] {
  return normaliseForMatching(raw)
    .split(" ")
    .filter((token) => token.length > 0);
}

// A name token counts as "found" if it appears as a whole word in the
// haystack, OR — for a single-letter token (an initial) — if any
// haystack word starts with that letter (brief section 25: "reasonable
// handling of middle names/initials").
function nameTokenFound(token: string, haystackWords: Set<string>, haystackWordList: string[]): boolean {
  if (token.length === 1) {
    return haystackWordList.some((word) => word.startsWith(token));
  }
  return haystackWords.has(token);
}

// MATCH: both the first and last name tokens are found in the document
// text. MISMATCH: neither is found at all (strong evidence of a
// different person). MANUAL_REVIEW: exactly one found, or too little
// document text to judge, or the applicant name has fewer than two
// tokens to compare.
export function nameLikelyMatches(applicantFullName: string, documentText: string | null): AffiliateMatchResult {
  if (!documentText || documentText.trim().length < 10) return "MANUAL_REVIEW";

  const nameTokens = tokenize(applicantFullName).filter((t) => t.length > 0);
  if (nameTokens.length < 2) return "MANUAL_REVIEW";

  const haystackWordList = tokenize(documentText);
  const haystackWords = new Set(haystackWordList);

  const first = nameTokens[0] as string;
  const last = nameTokens[nameTokens.length - 1] as string;
  const firstFound = nameTokenFound(first, haystackWords, haystackWordList);
  const lastFound = nameTokenFound(last, haystackWords, haystackWordList);

  if (firstFound && lastFound) return "MATCH";
  if (!firstFound && !lastFound) return "MISMATCH";
  return "MANUAL_REVIEW";
}

// Common South African address-abbreviation pairs — expanded before
// comparison so "Rd"/"Road", "St"/"Street" etc. never cause a false
// MISMATCH (brief section 27's own explicit examples).
const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  rd: "road",
  st: "street",
  str: "street",
  ave: "avenue",
  av: "avenue",
  dr: "drive",
  cres: "crescent",
  blvd: "boulevard",
  ext: "extension",
  ln: "lane",
  cl: "close",
};

function expandAddressAbbreviations(tokens: string[]): string[] {
  return tokens.map((token) => ADDRESS_ABBREVIATIONS[token] || token);
}

// MATCH requires the postal code, OR both the suburb and city, to
// appear in the document text — deliberately not full-string equality
// (brief section 27: "do not require exact formatting"). MISMATCH only
// when none of postal code/suburb/city appear at all. MANUAL_REVIEW
// otherwise (a partial signal is not strong enough either way).
export function addressLikelyMatches(
  address: { addressLine1: string; suburb: string; city: string; postalCode: string },
  documentText: string | null
): AffiliateMatchResult {
  if (!documentText || documentText.trim().length < 10) return "MANUAL_REVIEW";

  const haystackWords = new Set(expandAddressAbbreviations(tokenize(documentText)));

  const postalCode = address.postalCode.trim();
  const postalCodeFound = postalCode.length > 0 && documentText.includes(postalCode);

  const suburbTokens = expandAddressAbbreviations(tokenize(address.suburb));
  const cityTokens = expandAddressAbbreviations(tokenize(address.city));
  const suburbFound = suburbTokens.length > 0 && suburbTokens.every((t) => haystackWords.has(t));
  const cityFound = cityTokens.length > 0 && cityTokens.every((t) => haystackWords.has(t));

  if (postalCodeFound || (suburbFound && cityFound)) return "MATCH";

  const line1Tokens = expandAddressAbbreviations(tokenize(address.addressLine1));
  const anySignal = suburbFound || cityFound || line1Tokens.some((t) => t.length > 2 && haystackWords.has(t));
  return anySignal ? "MANUAL_REVIEW" : "MISMATCH";
}

// Conservative by design (see this file's own header comment): only
// ever returns MATCH (digits found verbatim) or MANUAL_REVIEW — never
// MISMATCH. A genuine SA ID/passport number is frequently only present
// as a photo/barcode on the physical document, so its literal absence
// from extracted text is weak, unreliable evidence of a real mismatch,
// unlike name/document-type signals which have much stronger textual
// presence when extraction succeeds at all.
export function identityNumberLikelyMatches(enteredNumber: string, documentText: string | null): AffiliateMatchResult {
  if (!documentText) return "MANUAL_REVIEW";
  const digits = enteredNumber.replace(/[^a-zA-Z0-9]/g, "");
  if (digits.length === 0) return "MANUAL_REVIEW";

  const haystackDigits = documentText.replace(/[^a-zA-Z0-9]/g, "");
  return haystackDigits.includes(digits) ? "MATCH" : "MANUAL_REVIEW";
}
