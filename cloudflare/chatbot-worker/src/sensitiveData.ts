// Milestone 187, Part L: detects obvious sensitive information in a
// customer's message BEFORE it is ever sent to Workers AI. Deliberately
// pattern-based and conservative — this can never catch every possible
// form of sensitive data, but it exists to stop the *obvious* cases
// (a pasted email, phone number, card number, OTP, ID number, or a
// password statement) reaching the model or being logged anywhere.
//
// A detected match is never logged, echoed back, or stored — see
// index.ts's own handling: on a match, the rejection message below is
// returned immediately and nothing else happens with the original text.

const PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "email", regex: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
  // South African mobile/landline shapes: 0XX XXX XXXX / +27XX XXX XXXX,
  // with optional spaces/dashes — deliberately requires a leading 0 or
  // +27 rather than "any 9+ digit run", to avoid flagging an ordinary
  // product price or quantity as a phone number.
  { name: "phone", regex: /(\+?27|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/ },
  // A 13-19 digit run (with optional spaces/dashes every 4), the shape
  // of a real card number — never matches a short product/order
  // reference, which this catalogue never uses double-digit-grouped
  // numbers for anyway.
  { name: "card", regex: /\b(?:\d[ -]?){13,19}\b/ },
  { name: "otp", regex: /\b(?:otp|one[\s-]?time[\s-]?pin|verification code)\b.{0,20}\d{4,8}\b/i },
  { name: "otpDigits", regex: /\b\d{4,8}\b.{0,20}\b(?:otp|one[\s-]?time[\s-]?pin)\b/i },
  // A South African 13-digit ID number shape (YYMMDD SSSS C A Z).
  { name: "saId", regex: /\b\d{6}[\s-]?\d{4}[\s-]?\d{2,3}\b/ },
  { name: "passwordStatement", regex: /\b(my\s+)?(password|banking pin|pin number)\s*(is|:)\s*\S+/i },
];

export function containsSensitiveInfo(text: string): boolean {
  return PATTERNS.some((p) => p.regex.test(text));
}
