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
    logo: "/images/marketplaces/takealot-logo.png",
    alt: "Takealot.com logo",
  },
  {
    id: "amazon",
    name: "Amazon.co.za",
    url: "https://www.amazon.co.za/s?i=stripbooks&rh=p_27%3ASeasonedz%2Bgroup&ref=dp_byline_sr_book_1",
    logo: "/images/marketplaces/amazon-logo.png",
    alt: "Amazon.co.za logo",
  },
];
