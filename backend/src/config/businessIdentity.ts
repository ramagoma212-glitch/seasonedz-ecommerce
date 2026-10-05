// Milestone 201: the verified business identity printed on quotation PDFs.
// Registration details mirror src/data/businessInfo.js (checked by
// services/outreach/b2bQuotationPdf.test.ts). Contact details come from
// config/businessContact.ts, the single source for outgoing B2B communication.
// Contains no VAT number, bank details or payment terms, since none is verified
// in this repository.

import { BUSINESS_CONTACT } from "./businessContact.js";

export const BUSINESS_IDENTITY = {
  registeredName: "SEASONEDZ GROUP",
  registrationNumber: "2024/618215/07",
  registeredOfficeLines: ["99 Proclamation Hill", "Pretoria West", "Pretoria", "Gauteng", "0183", "South Africa"],
  email: BUSINESS_CONTACT.email,
  phoneDisplay: BUSINESS_CONTACT.phone,
  websiteDisplay: BUSINESS_CONTACT.website,
} as const;
