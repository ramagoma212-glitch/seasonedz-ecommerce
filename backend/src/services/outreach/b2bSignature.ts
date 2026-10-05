// Milestone 202: the one signature block for outgoing B2B email. Plain text,
// deliberately short, and built only from verified business contact details.
// Contains no awards, registrations, funding or endorsement claims.

import { BUSINESS_CONTACT } from "../../config/businessContact.js";

export function buildB2bSignature(): string {
  return [
    "Kind regards",
    "",
    BUSINESS_CONTACT.businessName,
    `Call / WhatsApp: ${BUSINESS_CONTACT.phone}`,
    `Email: ${BUSINESS_CONTACT.email}`,
    `Website: ${BUSINESS_CONTACT.website}`,
  ].join("\n");
}

// Used so the campaign path never signs a message twice when an admin has
// already written the official number into the body.
export function bodyAlreadyHasSignature(body: string): boolean {
  return body.includes(BUSINESS_CONTACT.phone);
}
