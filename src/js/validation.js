// Generic form validation helpers, plus a checkout-specific validator
// that ties them together. Kept intentionally simple (plain functions,
// one error message per field) so new fields are easy to add later.

export function isRequired(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Accepts common South African phone formats once spaces/dashes are
// stripped: a local number starting with 0 (e.g. "082 123 4567") or an
// international number starting with +27 (e.g. "+27 82 123 4567").
export function isValidSAPhone(phone) {
  const cleaned = phone.replace(/[\s-]/g, "");
  return /^(0\d{9}|\+27\d{9})$/.test(cleaned);
}

// South African postal codes are 4 digits.
export function isValidPostalCode(postalCode) {
  return /^\d{4}$/.test(postalCode.trim());
}

// Validates the guest checkout form's data (a plain object read from
// the form via FormData). Returns { isValid, errors } where errors is
// a { fieldName: message } map — empty when the form is valid.
export function validateCheckoutForm(data) {
  const errors = {};

  if (!isRequired(data.firstName)) errors.firstName = "First name is required.";
  if (!isRequired(data.lastName)) errors.lastName = "Last name is required.";

  if (!isRequired(data.email)) {
    errors.email = "Email address is required.";
  } else if (!isValidEmail(data.email)) {
    errors.email = "Please enter a valid email address.";
  }

  if (!isRequired(data.phone)) {
    errors.phone = "Phone number is required.";
  } else if (!isValidSAPhone(data.phone)) {
    errors.phone = "Please enter a valid South African phone number, e.g. 082 123 4567.";
  }

  if (!isRequired(data.street)) errors.street = "Street address is required.";
  if (!isRequired(data.suburb)) errors.suburb = "Suburb is required.";
  if (!isRequired(data.city)) errors.city = "City is required.";
  if (!isRequired(data.province)) errors.province = "Please select a province.";

  if (!isRequired(data.postalCode)) {
    errors.postalCode = "Postal code is required.";
  } else if (!isValidPostalCode(data.postalCode)) {
    errors.postalCode = "Postal code must be 4 digits.";
  }

  if (!isRequired(data.paymentMethod)) errors.paymentMethod = "Please select a payment method.";

  return { isValid: Object.keys(errors).length === 0, errors };
}
