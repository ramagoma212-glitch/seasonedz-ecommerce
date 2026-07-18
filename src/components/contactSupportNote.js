// Reusable "how to reach us" snippet used across every support-relevant
// page (checkout, FAQ, product pages, Shipping, Returns, Schools,
// Wholesale, Distributor) so all of them show the same real email and
// WhatsApp details, worded consistently. `lead` is the one sentence
// that varies per page context; the email/WhatsApp lines never change.
// The WhatsApp link opens in a new tab safely (rel="noopener noreferrer").

import { businessInfo } from "../data/businessInfo.js";

export function renderContactSupportNote(lead) {
  return `
    <p class="contact-support-note">
      ${lead}
      <br />
      Email: <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a>
      <br />
      WhatsApp: <a href="${businessInfo.whatsappUrl}" target="_blank" rel="noopener noreferrer">${businessInfo.phoneDisplay}</a>
    </p>
  `;
}
