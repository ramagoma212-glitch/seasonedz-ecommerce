// Pure request-shape validation for POST /api/enquiries. Backs all
// four frontend demo forms (Contact, Schools, Wholesale, Distributor)
// — `type` picks which one and drives the extra type-specific checks
// below. No database access here (that's enquiry.service.ts).

import { EnquiryType } from "@prisma/client";
import { asRecord, isNonEmptyString, isValidEmail, isValidSAPhone, SA_PROVINCES, type ValidationErrorDetail } from "./shared.js";

export type { ValidationErrorDetail } from "./shared.js";

const ENQUIRY_TYPE_VALUES: EnquiryType[] = [
  EnquiryType.CONTACT,
  EnquiryType.SCHOOL,
  EnquiryType.WHOLESALE,
  EnquiryType.DISTRIBUTOR,
];

export interface ValidatedEnquiryInput {
  type: EnquiryType;
  name: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  organisationType: string | null;
  subject: string | null;
  message: string;
  province: string | null;
  city: string | null;
  // Validated as a positive integer here; the schema's
  // Enquiry.estimatedQuantity is deliberately a free-text String
  // (see schema.prisma) so the service layer stores this as a string.
  estimatedQuantity: number | null;
}

export interface EnquiryValidationResult {
  isValid: boolean;
  errors: ValidationErrorDetail[];
  value: ValidatedEnquiryInput | null;
}

function isProvided(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateEnquiryRequest(body: unknown): EnquiryValidationResult {
  const errors: ValidationErrorDetail[] = [];
  const root = asRecord(body);

  let type: EnquiryType | null = null;
  if (!isNonEmptyString(root.type)) {
    errors.push({ field: "type", message: "Enquiry type is required." });
  } else if (!(ENQUIRY_TYPE_VALUES as string[]).includes(root.type)) {
    errors.push({ field: "type", message: `type must be one of: ${ENQUIRY_TYPE_VALUES.join(", ")}.` });
  } else {
    type = root.type as EnquiryType;
  }

  if (!isNonEmptyString(root.name)) {
    errors.push({ field: "name", message: "Name is required." });
  }

  if (!isNonEmptyString(root.email)) {
    errors.push({ field: "email", message: "Email address is required." });
  } else if (!isValidEmail(root.email)) {
    errors.push({ field: "email", message: "Please provide a valid email address." });
  }

  if (!isNonEmptyString(root.message)) {
    errors.push({ field: "message", message: "Message is required." });
  }

  if (isProvided(root.phone) && (!isNonEmptyString(root.phone) || !isValidSAPhone(root.phone))) {
    errors.push({ field: "phone", message: "Please provide a valid South African phone number, e.g. 082 123 4567." });
  }

  if (isProvided(root.province) && (!isNonEmptyString(root.province) || !(SA_PROVINCES as readonly string[]).includes(root.province))) {
    errors.push({ field: "province", message: `Province must be one of: ${SA_PROVINCES.join(", ")}.` });
  }

  const estimatedQuantityProvided = isProvided(root.estimatedQuantity);
  let estimatedQuantity: number | null = null;
  if (estimatedQuantityProvided) {
    if (isPositiveInteger(root.estimatedQuantity)) {
      estimatedQuantity = root.estimatedQuantity;
    } else {
      errors.push({ field: "estimatedQuantity", message: "Estimated quantity must be a positive whole number." });
    }
  }

  // Type-specific rules, deliberately light — see Milestone 15 spec:
  // wholesale/distributor enquiries need enough to act on, but nothing
  // here should make the forms annoying to fill in.
  if (type === EnquiryType.WHOLESALE) {
    if (!isNonEmptyString(root.companyName)) {
      errors.push({ field: "companyName", message: "Company name is required for wholesale enquiries." });
    }
    if (!estimatedQuantityProvided) {
      errors.push({ field: "estimatedQuantity", message: "Estimated quantity is required for wholesale enquiries." });
    }
  }

  if (type === EnquiryType.DISTRIBUTOR && !isNonEmptyString(root.companyName)) {
    errors.push({ field: "companyName", message: "Company name is required for distributor enquiries." });
  }

  // SCHOOL: organisationType/companyName and estimatedQuantity are
  // genuinely optional (just recommended) — no extra checks.
  // CONTACT: the base rules above are already everything required.

  if (errors.length > 0) {
    return { isValid: false, errors, value: null };
  }

  return {
    isValid: true,
    errors: [],
    value: {
      type: type as EnquiryType,
      name: (root.name as string).trim(),
      email: (root.email as string).trim(),
      phone: isNonEmptyString(root.phone) ? root.phone.trim() : null,
      companyName: isNonEmptyString(root.companyName) ? root.companyName.trim() : null,
      organisationType: isNonEmptyString(root.organisationType) ? root.organisationType.trim() : null,
      subject: isNonEmptyString(root.subject) ? root.subject.trim() : null,
      message: (root.message as string).trim(),
      province: isNonEmptyString(root.province) ? root.province : null,
      city: isNonEmptyString(root.city) ? root.city.trim() : null,
      estimatedQuantity,
    },
  };
}
