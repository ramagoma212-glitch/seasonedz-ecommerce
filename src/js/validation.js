// Generic form validation helpers, ready for the checkout form and any
// other forms (contact, newsletter) added in later milestones.

export function isRequired(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
