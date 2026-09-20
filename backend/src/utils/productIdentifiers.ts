// Milestone 188A: ISBN/GTIN normalisation and checksum validation for
// book language edition variants (ProductVariant.isbn/gtin). Verified
// against real standards before implementation, not guessed:
//
// - ISBN-13 became, since 2007 (ISO 2108), numerically identical to an
//   EAN-13/GTIN-13 barcode — every real ISBN-13 starts with the GS1
//   "Bookland" prefix 978 or 979 and uses the exact same check-digit
//   algorithm as any other GTIN.
// - GS1's own check-digit rule (General Specifications): counting
//   digits from the RIGHT (the digit immediately left of the check
//   digit gets weight 3, the next weight 1, alternating 3/1/3/1...
//   regardless of total code length), sum the weighted digits, then
//   check digit = (10 - (sum mod 10)) mod 10. This one rule correctly
//   validates every real-world GTIN length (8/12/13/14) and ISBN-13 —
//   no separate formula is needed per length.
//
// Never invents or auto-assigns an identifier — these functions only
// ever validate/normalise a value the admin has actually typed in.

export class ProductIdentifierError extends Error {}

// Strips human-entered separators (hyphens, spaces) only — never alters
// the actual digits. "978-0-306-40615-7" -> "9780306406157".
export function normalizeIdentifierDigits(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

// GS1's own weighting rule, counted from the right — see this file's
// header comment. `digitsWithoutCheck` is every digit except the final
// (check) digit.
function computeGtinCheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  const len = digitsWithoutCheck.length;
  for (let i = 0; i < len; i++) {
    const digit = Number(digitsWithoutCheck[i]);
    const distanceFromRight = len - i; // 1 = the digit immediately left of the check digit
    const weight = distanceFromRight % 2 === 1 ? 3 : 1;
    sum += digit * weight;
  }
  return (10 - (sum % 10)) % 10;
}

function isValidGtinChecksum(digits: string): boolean {
  const dataDigits = digits.slice(0, -1);
  const checkDigit = Number(digits[digits.length - 1]);
  return computeGtinCheckDigit(dataDigits) === checkDigit;
}

// Real-world GTIN lengths, per GS1: GTIN-8 (EAN-8), GTIN-12 (UPC-A),
// GTIN-13 (EAN-13), GTIN-14 (ITF-14) — all one checksum family.
const VALID_GTIN_LENGTHS = [8, 12, 13, 14];

// Validates and normalises an ISBN — must be a genuine ISBN-13 (every
// ISBN has been 13 digits, prefixed 978 or 979, since ISO 2108's 2007
// revision) with a correct GS1 check digit. Hyphens/spaces in the raw
// input are accepted and stripped; the digits themselves are never
// altered, generated, or guessed. Returns the normalised, digits-only
// value, or throws ProductIdentifierError with a clear message.
export function validateAndNormalizeIsbn(raw: string): string {
  const normalized = normalizeIdentifierDigits(raw);
  if (!/^\d{13}$/.test(normalized)) {
    throw new ProductIdentifierError("ISBN must be 13 digits (hyphens are fine, e.g. 978-0-306-40615-7).");
  }
  if (!normalized.startsWith("978") && !normalized.startsWith("979")) {
    throw new ProductIdentifierError("ISBN must start with 978 or 979 (the ISBN-13 GS1 prefix).");
  }
  if (!isValidGtinChecksum(normalized)) {
    throw new ProductIdentifierError("ISBN check digit is invalid — please re-check the number for a typo.");
  }
  return normalized;
}

// Validates and normalises a barcode/GTIN. Deliberately more permissive
// than ISBN validation (Part G: "validate format reasonably without
// blocking legitimate existing identifiers") — accepts any of the four
// real GTIN lengths, no Bookland-prefix requirement (a book's barcode
// commonly IS its ISBN-13, but this field is never assumed to equal
// isbn — see adminProductVariant.service.ts).
export function validateAndNormalizeGtin(raw: string): string {
  const normalized = normalizeIdentifierDigits(raw);
  if (!/^\d+$/.test(normalized) || !VALID_GTIN_LENGTHS.includes(normalized.length)) {
    throw new ProductIdentifierError("Barcode/GTIN must be 8, 12, 13 or 14 digits (hyphens are fine).");
  }
  if (!isValidGtinChecksum(normalized)) {
    throw new ProductIdentifierError("Barcode/GTIN check digit is invalid — please re-check the number for a typo.");
  }
  return normalized;
}
