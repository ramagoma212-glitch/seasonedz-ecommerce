// Pure request-shape validation for POST /api/newsletter/subscribe.
// Backs the homepage "Free Pages and Fresh Updates" form (see
// components/newsletterSignup.js). No database access here (that's
// newsletter.service.ts).

import { asRecord, isNonEmptyString, isValidEmail, type ValidationErrorDetail } from "./shared.js";

export type { ValidationErrorDetail } from "./shared.js";

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;

export interface ValidatedNewsletterInput {
  name: string;
  email: string;
  isSpam: boolean;
}

export interface NewsletterValidationResult {
  isValid: boolean;
  errors: ValidationErrorDetail[];
  value: ValidatedNewsletterInput | null;
}

export function validateNewsletterSubscribeRequest(body: unknown): NewsletterValidationResult {
  const root = asRecord(body);

  // Honeypot: a field real customers never see or fill in (hidden
  // off-screen in the form markup, see newsletterSignup.js). A bot
  // that fills every field trips this — checked first, before the
  // name/email rules below, so a spam submission never even reaches
  // real validation. The controller responds with the same success
  // message a genuine subscriber gets, without ever writing a row.
  if (isNonEmptyString(root.website)) {
    return { isValid: true, errors: [], value: { name: "", email: "", isSpam: true } };
  }

  const errors: ValidationErrorDetail[] = [];

  if (!isNonEmptyString(root.name)) {
    errors.push({ field: "name", message: "Please enter your name." });
  } else if (root.name.trim().length > MAX_NAME_LENGTH) {
    errors.push({ field: "name", message: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` });
  }

  if (!isNonEmptyString(root.email)) {
    errors.push({ field: "email", message: "Please enter your email address." });
  } else if (root.email.trim().length > MAX_EMAIL_LENGTH || !isValidEmail(root.email.trim())) {
    errors.push({ field: "email", message: "Please enter a valid email address." });
  }

  if (errors.length > 0) {
    return { isValid: false, errors, value: null };
  }

  return {
    isValid: true,
    errors: [],
    value: {
      name: (root.name as string).trim(),
      // Normalised to lowercase so "Jane@Example.com" and
      // "jane@example.com" are recognised as the same subscriber —
      // the unique index on NewsletterSubscriber.email is
      // case-sensitive at the database level, so this normalisation
      // has to happen here, before it ever reaches a query.
      email: (root.email as string).trim().toLowerCase(),
      isSpam: false,
    },
  };
}
