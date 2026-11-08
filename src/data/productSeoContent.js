// Milestone 196B: optional, per-product SEO-only overrides, keyed by
// slug. Deliberately narrower than categorySeoContent.js's own
// pageTitle pattern — a product's `pageTitle` here ONLY ever replaces
// the page <title>/og:title/twitter:title (client-side setPageMeta()
// and the static build's own route title). It is NEVER used for the
// H1, the Product JSON-LD `name`, cart, checkout, order/email
// snapshots, or the Merchant feed title — every one of those keeps
// reading the real Product.name directly, completely unchanged,
// exactly as before this milestone. This is intentional: those other
// surfaces are load-bearing (an order/email/cart line must always
// show the same name a customer actually bought), so only the
// search-result-facing title is ever allowed to differ from the real
// product name — never the reverse.
//
// `metaDescription` is a third, independent optional override, added
// Milestone 204 after real Search Console data showed specific
// product pages ranking well (top-10 position) but getting almost no
// clicks — mirrors `pageTitle`'s own narrow scope exactly: ONLY ever
// replaces <meta name="description">/og:description/twitter:description
// (client-side setPageMeta() and the static build's own route
// description). The on-page short description paragraph
// (product-details__short-desc), Product JSON-LD, cart/checkout/
// order/email snapshots and the Merchant feed description all keep
// reading product.shortDescription directly, completely unchanged —
// never this override. Every fact in an override below already
// appears in that same product's real shortDescription or elsewhere
// in this site's own existing copy; nothing here is invented.
//
// `relatedSlugs` is a second, independent optional override: an
// explicit, hand-curated list of other real product slugs to show in
// "You May Also Like" instead of the default same-category logic
// (productDetails.js's renderRelatedProducts()). Only used for a
// product whose own category has no other real product to recommend
// (a single-product category) — every other product keeps the
// existing same-category behaviour completely unchanged. Every slug
// listed here is a real, currently live product/bundle, checked
// against the live catalogue before writing this.
export const productSeoContent = {
  "little-hands-big-faith-new-testament-bible-colouring-book": {
    pageTitle: "New Testament Bible Colouring Book for Kids",
  },
  "little-hands-big-faith-old-testament-bible-colouring-book": {
    pageTitle: "Old Testament Bible Colouring Book for Kids",
  },
  "mindfulness-colouring-book-for-adults": {
    pageTitle: "Mindfulness Colouring Book for Adults",
    // Milestone 204: real Search Console data showed this page at
    // average position 4.37 (top of page 1) across 75 impressions but
    // only 1 click (1.33% CTR) over the last 3 months — well below
    // what a page-1 position typically earns. The real shortDescription
    // this replaces, for comparison: "Enjoy mindful creativity with
    // the Seasonedz Mindfulness Colouring Book for Adults, an A4 book
    // of 45 designs across 92 single sided pages for quiet, screen
    // free creative time." Same facts, reordered to lead with the
    // concrete specifics (A4, 45 designs, 92 pages) and the real
    // "ships countrywide in South Africa" claim already used elsewhere
    // on this site (see categorySeoContent.js's own bundles copy and
    // llms.txt) — not a guaranteed fix, since the exact query driving
    // these impressions isn't in this export, but a reasonable,
    // evidence-backed thing to try.
    metaDescription:
      "An A4 adult colouring book with 45 designs across 92 pages, for quiet, screen free time. Ships countrywide in South Africa from Seasonedz Group.",
    // Milestone 196B, Part 9: this product is the only one in the
    // Mindfulness Colouring category, so the default same-category
    // related-products logic always returns nothing. These are the
    // two products a shopper looking at this book would genuinely
    // consider next: the acrylic markers it's explicitly paired with
    // in its own description/category copy, and the ready-made bundle
    // combining the two.
    relatedSlugs: ["acrylic-marker-set-24-colours", "mindfulness-book-and-markers-bundle"],
  },
  // Milestone 196B, Part 9: ABC has the same single-product-category
  // gap as Mindfulness (Kids Colouring Books currently has only this
  // one product), and Rotating Crayons/the ABC bundle would be
  // genuinely sensible related picks — but this exact product is also
  // this test suite's own widely-shared "generic simple physical
  // product" fixture (PHYSICAL_SLUG, independently defined in 7
  // unrelated smoke spec files: analyticsDisabled/analyticsEnabled/
  // cookieConsent/deliveryMethods/giftWrap/referralProgramme/
  // stockAndDelivery). Adding related-product cards here introduces
  // extra [data-action="add-to-cart"] buttons on its page, which broke
  // 36 of those unrelated tests' strict single-button locators when
  // tried — confirmed via a full smoke run, not assumed. Deferred
  // (relatedSlugs deliberately left unset here) rather than fixed by
  // touching 7 unrelated test files for a same-category gap this
  // milestone didn't explicitly require closing (only Mindfulness's
  // was) — see the milestone's own final report for this reasoning.
  "abc-colouring-book-for-kids-with-fun-facts": {
    pageTitle: "ABC Colouring Book for Kids with Fun Facts",
  },
  "new-testament-bible-colouring-book-and-24-acrylic-markers-bundle-for-kids-ages-6-to-10": {
    pageTitle: "New Testament Bible Colouring Book & Markers Bundle",
  },
  "school-starter-colouring-pack": {
    pageTitle: "Old Testament Bible Colouring Book & Markers Bundle",
  },
  // Milestone 200: the one product among the audited core 5 that had
  // no SEO title override at all — fell back entirely to the real
  // Product.name ("Seasonedz Creative Acrylic Paint Marker Set, Non-
  // Bleed"), which is accurate but leads with the brand name rather
  // than the long-tail search intent (markers-and-crayons' own
  // keyword ownership: "colouring markers", "acrylic markers").
  // Dropping only the brand prefix, same pattern every other override
  // above already follows — no fact changed.
  "acrylic-marker-set-24-colours": {
    pageTitle: "Acrylic Paint Marker Set, Non-Bleed",
    // Milestone 204: real Search Console data showed this page at
    // average position 8.89 (bottom of page 1) across 76 impressions
    // and 0 clicks over the last 3 months. The real shortDescription
    // this replaces, for comparison: "Create bold art on paper,
    // canvas, wood, stone and glass with acrylic paint markers in 24
    // or 60 colour sets. Water based, non-toxic, quick drying and
    // packed in a reusable carry case." Same facts, adds the real
    // "ships countrywide in South Africa" claim already used elsewhere
    // on this site — see this file's own header comment above for why
    // this is a reasonable try, not a guaranteed fix.
    metaDescription:
      "Acrylic paint markers for paper, canvas, wood, stone and glass. Water based, non-toxic and quick drying, available in 24 or 60 colours. Ships countrywide in South Africa.",
  },
};

export function getProductSeoContent(slug) {
  return productSeoContent[slug] || null;
}
