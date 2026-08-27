// Version 7, Milestone 176: identity-number format validation. Brief
// section 6 is explicit — "reasonable format/checksum validation if
// appropriate" for a South African ID, and "do NOT claim the system
// confirms that the ID was issued by Home Affairs." Nothing here (or
// anywhere in this milestone) ever asserts a document is genuinely
// government-issued — only that its digits are structurally consistent
// with a real SA ID number, which is a much weaker, honestly-described
// claim.

// Standard, publicly documented SA ID number checksum (Luhn-style,
// digits 1-13: YYMMDDSSSSCAZ). Never claims Home Affairs verification —
// see this file's own header comment.
export function isValidSAIdNumberChecksum(idNumber: string): boolean {
  const digits = idNumber.replace(/\D/g, "");
  if (digits.length !== 13) return false;

  const nums = digits.split("").map(Number);
  let oddSum = 0;
  for (let i = 0; i < 12; i += 2) oddSum += nums[i] as number;

  let evenConcat = "";
  for (let i = 1; i < 12; i += 2) evenConcat += String(nums[i]);
  const evenDoubled = String(Number(evenConcat) * 2);
  const evenSum = evenDoubled.split("").reduce((sum, d) => sum + Number(d), 0);

  const total = oddSum + evenSum;
  const checkDigit = (10 - (total % 10)) % 10;
  return checkDigit === nums[12];
}

function isPlausibleBirthDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day >= 1 && day <= daysInMonth;
}

// SA ID numbers encode a birth date as YYMMDD with no century digit —
// this only checks the calendar date is *plausible* (e.g. not
// "023200"), never resolves which century (that ambiguity is inherent
// to the format itself, not a gap in this check).
export function isValidSAIdNumberFormat(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 13) return false;

  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  if (!isPlausibleBirthDate(2000, month, day)) return false;

  return isValidSAIdNumberChecksum(digits);
}

const MIN_PASSPORT_LENGTH = 4;
const MAX_PASSPORT_LENGTH = 20;
// Deliberately permissive — passport number formats vary widely by
// issuing country (letters, digits, and sometimes spaces/hyphens; see
// brief section 6: "do not impose an unsafe South-African-only number
// format"). This only rejects something structurally impossible (empty,
// absurdly short/long, or containing characters no real passport number
// uses), never a specific country's exact pattern.
export function isPlausiblePassportNumber(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < MIN_PASSPORT_LENGTH || trimmed.length > MAX_PASSPORT_LENGTH) return false;
  return /^[A-Za-z0-9](?:[A-Za-z0-9 -]*[A-Za-z0-9])?$/.test(trimmed);
}

// Masks all but the last 4 characters — brief section 26: "mask by
// default where practical... e.g. *********1234." Used by every admin
// list/detail response; the one dedicated "reveal" endpoint is the only
// place a full value is ever returned (affiliateApplication.service.ts's
// revealIdentityNumber()).
export function maskIdentityNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length <= 4) return "*".repeat(trimmed.length);
  return "*".repeat(trimmed.length - 4) + trimmed.slice(-4);
}
