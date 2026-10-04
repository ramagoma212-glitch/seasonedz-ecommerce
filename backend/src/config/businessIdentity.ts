// Milestone 201: the verified business identity printed on quotation PDFs.
// Mirrors the owner-verified values in src/data/businessInfo.js. A test in
// services/outreach/b2bQuotationPdf.test.ts fails if the two copies drift
// apart. Contains no VAT number, bank details or payment terms: none of
// those is verified in this repository, so none is ever printed.

export const BUSINESS_IDENTITY = {
  registeredName: "SEASONEDZ GROUP",
  registrationNumber: "2024/618215/07",
  registeredOfficeLines: ["99 Proclamation Hill", "Pretoria West", "Pretoria", "Gauteng", "0183", "South Africa"],
  email: "seasonedzgroup@outlook.com",
  phoneDisplay: "069 526 9941",
  websiteDisplay: "www.seasonedzgroup.co.za",
} as const;
