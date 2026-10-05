// Milestone 202: the one authoritative source for the contact details Seasonedz
// gives organisations in outgoing B2B communication (outreach, follow-ups,
// quotation emails and quotation PDFs). The Call / WhatsApp number here is the
// owner's instruction for B2B callbacks. It is not the email sender identity.
// The public website keeps its own values in src/data/businessInfo.js, which
// this file does not change.

export const BUSINESS_CONTACT = {
  businessName: "Seasonedz Group",
  email: "seasonedzgroup@outlook.com",
  phone: "+27 72 844 5644",
  website: "www.seasonedzgroup.co.za",
  websiteUrl: "https://www.seasonedzgroup.co.za",
} as const;
