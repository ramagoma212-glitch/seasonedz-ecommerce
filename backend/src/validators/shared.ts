// Small validation primitives shared across every request-body
// validator in backend/src/validators/. Keeping them in one place
// means a rule change (e.g. the SA phone format, the province list)
// only ever has to happen once.

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export const SA_PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape",
] as const;

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// A local number starting with 0, or an international +27 number,
// once spaces/dashes are stripped — same rule as the frontend
// (src/js/validation.js).
export function isValidSAPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s-]/g, "");
  return /^(0\d{9}|\+27\d{9})$/.test(cleaned);
}

export function isValidPostalCode(postalCode: string): boolean {
  return /^\d{4}$/.test(postalCode.trim());
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
