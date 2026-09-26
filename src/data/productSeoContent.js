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
};

export function getProductSeoContent(slug) {
  return productSeoContent[slug] || null;
}
