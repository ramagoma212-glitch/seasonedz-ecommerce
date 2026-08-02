// Version 7, Milestone 158: homepage "Thoughtful Gifts Made With
// Purpose" section — configurable gift product list. Each entry
// references a REAL product by slug (never a fake/duplicate product or
// route); renderGiftingSection() in pages/home.js looks that slug up
// in the real catalogue and only ever shows the card if the product
// genuinely exists, is ACTIVE, and has a working route. wrappedImage
// is a presentation-only photo (gift-wrapped packaging) — it is never
// used as the product's own catalogue/cart/checkout image, only here.
//
// To add a future gift product (e.g. Mindfulness Colouring Book Gift
// Idea): add an entry below with a real product slug, approved title/
// description copy, and an approved wrapped-image asset — nothing
// about renderGiftingSection() itself needs to change.
export const GIFT_PRODUCTS = [
  {
    productSlug: "abc-colouring-book-for-kids-with-fun-facts",
    title: "ABC Colouring Book Gift Idea",
    description: "A thoughtful learning gift for tracing, colouring and early alphabet practice.",
    wrappedImage: "/images/home/gifts/gift-abc-colouring-book.png",
    alt: "ABC Colouring Book for Kids shown in clear gift wrapping with a cream ribbon and gift tag.",
  },
  {
    productSlug: "little-hands-big-faith-new-testament-bible-colouring-book",
    title: "New Testament Bible Colouring Book Gift Idea",
    description: "A meaningful faith based gift that supports reading, writing, prayer and creativity.",
    wrappedImage: "/images/home/gifts/gift-new-testament.png",
    alt: "New Testament Bible Colouring Book for Kids shown in clear gift wrapping with a cream ribbon and gift tag.",
  },
  {
    productSlug: "little-hands-big-faith-old-testament-bible-colouring-book",
    title: "Old Testament Bible Colouring Book Gift Idea",
    description: "A thoughtful Christian gift filled with Bible stories, learning and creative activities.",
    wrappedImage: "/images/home/gifts/gift-old-testament.png",
    alt: "Old Testament Bible Colouring Book for Kids shown in clear gift wrapping with a cream ribbon and gift tag.",
  },
];
