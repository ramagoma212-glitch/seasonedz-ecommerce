// Milestone 188A: South Africa's 11 official WRITTEN languages — mirrors
// backend/src/utils/southAfricanLanguages.ts exactly (same order, same
// codes, same deliberate exclusion of South African Sign Language).
// Frontend/backend are separate deployables with no shared code, so
// this small, stable list is intentionally duplicated rather than
// fetched over the network just to fill in a comma-separated text
// field. Codes verified against ISO 639-1 (and ISO 639-2 for Sepedi,
// which has no 639-1 code) before implementation.
export const SOUTH_AFRICAN_LANGUAGES = [
  "English",
  "Afrikaans",
  "isiNdebele",
  "isiXhosa",
  "isiZulu",
  "Sepedi",
  "Sesotho",
  "Setswana",
  "siSwati",
  "Tshivenda",
  "Xitsonga",
];
