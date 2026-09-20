// Milestone 188A: South Africa's 11 official WRITTEN languages —
// deliberately excludes South African Sign Language (the brief's own
// explicit instruction; SASL has no ISO 639-1/2 code in this list and
// isn't a written-book edition in the sense this milestone covers).
// Codes verified against ISO 639-1 (and ISO 639-2 for Sepedi, which has
// no 639-1 code) before implementation — every code below matches the
// authoritative standard, not a guess. Order matches the sequence the
// brief itself lists them in.
export interface SouthAfricanLanguage {
  label: string;
  code: string;
}

export const SOUTH_AFRICAN_LANGUAGES: SouthAfricanLanguage[] = [
  { label: "English", code: "en" },
  { label: "Afrikaans", code: "af" },
  { label: "isiNdebele", code: "nr" },
  { label: "isiXhosa", code: "xh" },
  { label: "isiZulu", code: "zu" },
  // ISO 639-2 (no 639-1 code exists for Northern Sotho/Sepedi).
  { label: "Sepedi", code: "nso" },
  { label: "Sesotho", code: "st" },
  { label: "Setswana", code: "tn" },
  { label: "siSwati", code: "ss" },
  { label: "Tshivenda", code: "ve" },
  { label: "Xitsonga", code: "ts" },
];

// Case/whitespace-tolerant label -> code lookup, used to auto-derive
// ProductVariant.languageCode whenever a variant's own "Language"
// option value matches one of these 11 known labels exactly (trimmed,
// case-insensitive) — never applied to a custom/unrecognised language
// value, which simply keeps languageCode null (Part B: language
// metadata is optional, never forced).
const LABEL_TO_CODE = new Map(SOUTH_AFRICAN_LANGUAGES.map((lang) => [lang.label.toLowerCase(), lang.code]));

export function lookupSouthAfricanLanguageCode(label: string): string | null {
  return LABEL_TO_CODE.get(label.trim().toLowerCase()) ?? null;
}
