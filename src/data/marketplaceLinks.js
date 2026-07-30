// Version 7, Milestone 144: where Seasonedz Group products can also be
// bought, outside this website. Real, owner-supplied marketplace URLs
// — never invented or guessed. Shared by the homepage marketplace
// section, the footer, and the product detail page's small
// marketplace block (see components/marketplaceLinks.js), so there is
// exactly one place to update a URL.
//
// `logo` is the expected path of a real logo asset (not present yet —
// see components/marketplaceLinks.js for the text-fallback this uses
// until a real file exists at that path) and `alt` is the alt text to
// use once it does.
export const marketplaceLinks = [
  {
    id: "takealot",
    name: "Takealot.com",
    url: "https://www.takealot.com/seller/?sellers=29890451",
    // Version 7, Milestone 152B: owner replaced the logo file directly
    // (old takealot-logo.png removed, new takealot-logo-new.jpeg
    // added) — updated here to match.
    logo: "/images/marketplaces/takealot-logo-new.jpeg",
    alt: "Takealot.com logo",
  },
  {
    id: "amazon-co-za",
    name: "Amazon.co.za",
    url: "https://www.amazon.co.za/s?i=stripbooks&rh=p_27%3ASeasonedz%2Bgroup&ref=dp_byline_sr_book_1",
    logo: "/images/marketplaces/amazon-logo.png",
    alt: "Amazon.co.za logo",
  },
  // Version 7, Milestone 151: owner-verified, genuinely distinct
  // Amazon.com author storefront link (was null through Milestone 150
  // — an earlier "Amazon.com" URL supplied then was byte-identical to
  // the Amazon.co.za entry above and was correctly left unwired).
  // Reuses the same Amazon logo as Amazon.co.za (same brand mark, no
  // separate Amazon.com-specific asset exists or is needed).
  {
    id: "amazon-com",
    name: "Amazon.com",
    url: "https://www.amazon.com/stores/Rolivhuwa-Nedzamba/author/B0H5FP3Q83/allbooks?ccs_id=25465565-47b2-487c-aed4-0b7d92dce4c9",
    logo: "/images/marketplaces/amazon-logo.png",
    alt: "Amazon.com logo",
  },
];
