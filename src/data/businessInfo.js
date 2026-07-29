// Official Seasonedz Group public contact details, shared across every
// customer-facing support/contact area on the site (footer, Contact
// page, checkout, FAQ, product pages, Shipping, Returns, Schools,
// Wholesale, Distributor). These are the business's own public
// contact details — safe to display anywhere. No passwords, API keys
// or private credentials belong in this file.

export const businessInfo = {
  businessName: "Seasonedz Group",
  // Version 7, Milestone 134 correction: stays on seasonedzgroup@outlook.com
  // for now — info@seasonedzgroup.co.za has no mailbox yet (email hosting
  // is planned via Afrihost). Update once that mailbox exists and is tested.
  email: "seasonedzgroup@outlook.com",
  phoneDisplay: "069 526 9941",
  phoneE164: "+27695269941",
  whatsappUrl: "https://wa.me/27695269941",
  mailtoUrl: "mailto:seasonedzgroup@outlook.com",
  telUrl: "tel:+27695269941",
  // Version 7, Milestone 150: no verified Google Business Profile /
  // reviews link has ever been supplied. The homepage's Google
  // Reviews section reads this value and renders nothing at all
  // (never a fabricated rating, review, or placeholder link) while
  // it's null — see components/googleReviews.js.
  googleReviewsUrl: null,
};
