// Seasonedz Group product catalog.
// Sample data with a realistic shape so pages/components never need to
// change when real product data (from the business) replaces this file.
// IDs are stable, slug-based strings rather than random/incrementing
// numbers, so links and routes stay predictable.
//
// Version 7, Milestone 171C: rating/reviewCount zeroed on every product
// (were fake sample values like 4.8/36 — see productCard.js's own
// Milestone 95 comment on why the storefront stopped displaying them).
// This file is also the storefront's genuine outage fallback (see
// js/api/productsApi.js's getCatalog()), not just local-dev sample
// data — a real customer could see it during a real backend outage, so
// it must never show a fabricated rating either, matching the real
// Product.ratingAverage/reviewCount columns' own honest 0 default.

import { withBase } from "../js/paths.js";

export const products = [
  {
    id: "abc-colouring-book-for-kids-with-fun-facts",
    slug: "abc-colouring-book-for-kids-with-fun-facts",
    name: "ABC Colouring Book for Kids with Fun Facts",
    category: "Kids Colouring Books",
    categorySlug: "kids-colouring-books",
    price: 149.0,
    oldPrice: null,
    image: "/images/product-1.jpg",
    gallery: ["/images/product-1.jpg", "/images/product-2.jpg", "/images/product-6.jpg"],
    shortDescription: "An A4 alphabet colouring book for early learners, with tracing, colouring and a fun fact on every page.",
    description:
      "Made for young children who are just starting to learn their letters. Each page pairs a large letter to trace and colour with a simple, bite sized fun fact, so little hands stay busy while little minds pick up something new. A firm favourite at home, in pre-school and in the classroom.",
    features: [
      "A4 size, 30 pages",
      "Saddle-stitched (stapled) binding",
      "Letters to trace as well as colour",
      "A fun fact printed on every page",
      "Suited to early learning at home or school",
    ],
    paperSize: "A4",
    pageCount: 30,
    binding: "Saddle-stitched",
    ageRange: "3-8 years",
    stockStatus: "In Stock",
    rating: 0,
    reviewCount: 0,
    tags: ["kids", "educational", "alphabet", "colouring book"],
    isFeatured: true,
    isBestSeller: true,
    isNewArrival: false,
    discountLabel: null,
  },
  {
    id: "mindfulness-colouring-book-for-adults",
    slug: "mindfulness-colouring-book-for-adults",
    name: "Mindfulness Colouring Book for Adults",
    category: "Mindfulness Colouring",
    categorySlug: "mindfulness-colouring",
    price: 159.0,
    oldPrice: null,
    image: "/images/product-3.jpg",
    gallery: ["/images/product-3.jpg", "/images/product-5.jpg"],
    shortDescription: "An A4 adult colouring book with 45 calming designs across 92 pages, for relaxation and quiet creative time.",
    description:
      "A generous A4 colouring book made for adults who want a quiet, creative way to unwind. Inside are 45 detailed designs across 92 single sided pages, giving plenty of room for stress relief and mindfulness without a screen in sight. A thoughtful choice for anyone wanting a calm activity at the end of the day, or a gift for someone who could use a little quiet time.",
    features: [
      "A4 size, 92 pages",
      "45 detailed designs",
      "Single-sided pages so colour never bleeds through",
      "Perfect (glued) binding for a book that lies flatter as you colour",
      "Suited to coloured pencils and fine markers",
    ],
    paperSize: "A4",
    pageCount: 92,
    binding: "Perfect binding",
    ageRange: "16+ years",
    stockStatus: "In Stock",
    rating: 0,
    reviewCount: 0,
    tags: ["mindfulness", "adult colouring", "relaxation", "self-care"],
    isFeatured: true,
    isBestSeller: false,
    isNewArrival: false,
    discountLabel: null,
  },
  {
    id: "little-hands-big-faith-old-testament-bible-colouring-book",
    slug: "little-hands-big-faith-old-testament-bible-colouring-book",
    name: "Little Hands Big Faith Old Testament Bible Colouring Book",
    category: "Bible Colouring Books",
    categorySlug: "bible-colouring-books",
    price: 169.0,
    oldPrice: null,
    image: "/images/product-2.jpg",
    gallery: ["/images/product-2.jpg", "/images/product-1.jpg"],
    shortDescription: "An A4 Bible colouring book with 30 Old Testament stories to read, write, pray and colour. Ages 6 to 10.",
    description:
      "From Noah's Ark to David and Goliath, this A4 colouring book introduces children aged 6 to 10 to 30 well loved Old Testament stories. Each story invites your child to read, write, pray and colour, making it a meaningful choice for Sunday school, family devotion time or quiet time at home.",
    features: [
      "A4 size, 66 pages",
      "30 Old Testament stories",
      "Read, write, pray and colour on every page",
      "Saddle-stitched (stapled) binding",
      "Great for Sunday school and family devotions",
    ],
    paperSize: "A4",
    pageCount: 66,
    binding: "Saddle-stitched",
    ageRange: "6-10 years",
    stockStatus: "In Stock",
    rating: 0,
    reviewCount: 0,
    tags: ["bible", "faith", "kids", "sunday school"],
    isFeatured: false,
    isBestSeller: true,
    isNewArrival: false,
    discountLabel: null,
  },
  {
    id: "little-hands-big-faith-new-testament-bible-colouring-book",
    slug: "little-hands-big-faith-new-testament-bible-colouring-book",
    name: "Little Hands Big Faith New Testament Bible Colouring Book",
    category: "Bible Colouring Books",
    categorySlug: "bible-colouring-books",
    price: 169.0,
    oldPrice: null,
    image: "/images/product-2.jpg",
    gallery: ["/images/product-2.jpg", "/images/product-1.jpg"],
    shortDescription: "An A4 Bible colouring book with 30 New Testament stories to read, write, pray and colour. Ages 6 to 10.",
    description:
      "A gentle introduction to the New Testament for children aged 6 to 10, from the Nativity to the parables of Jesus. This A4 colouring book covers 30 New Testament stories, each inviting your child to read, write, pray and colour. A companion to our Old Testament title, with the same warm illustration style, ideal for Sunday school or family devotion time.",
    features: [
      "A4 size, 66 pages",
      "30 New Testament stories",
      "Read, write, pray and colour on every page",
      "Saddle-stitched (stapled) binding",
      "Companion to the Old Testament colouring book",
    ],
    paperSize: "A4",
    pageCount: 66,
    binding: "Saddle-stitched",
    ageRange: "6-10 years",
    stockStatus: "Low Stock",
    rating: 0,
    reviewCount: 0,
    tags: ["bible", "faith", "kids", "sunday school"],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: true,
    discountLabel: null,
  },
  {
    // Milestone 196A: synchronised with the corrected, variant-neutral
    // production record (name/shortDescription/description/features/
    // price all mirror the live Product row — see that milestone's own
    // report for the full before/after). hasVariants/variantOptions/
    // variants/variantPriceRange are new here — every consumer
    // (productDetails.js, productCard.js, app.js's variant selector,
    // search.js) already handles these fields generically regardless of
    // where the product came from (see mapApiProductToFrontendShape's
    // own header comment), so this is real data in the SAME existing
    // shape, not a new architecture. Variant `images`/`imageUrl` are
    // deliberately left empty — this file has no distinct 60-colour
    // photo of its own, and the gallery correctly falls back to the
    // shared product gallery below in that case (same rule as the live
    // site's own resolveGalleryImages()), rather than fabricating a
    // fake per-variant image.
    id: "acrylic-marker-set-24-colours",
    slug: "acrylic-marker-set-24-colours",
    name: "Seasonedz Creative Acrylic Paint Marker Set, Non-Bleed",
    category: "Markers and Crayons",
    categorySlug: "markers-and-crayons",
    price: 120.0,
    oldPrice: 299.0,
    image: "/images/home/gifts/gift-acrylic-markers.png",
    gallery: ["/images/home/gifts/gift-acrylic-markers.png"],
    shortDescription:
      "Create bold art on paper, canvas, wood, stone and glass with acrylic paint markers in 24 or 60 colour sets. Water based, non-toxic, quick drying and packed in a reusable carry case.",
    description:
      "Create bold, colourful artwork with the Seasonedz Creative Acrylic Marker Set. This versatile acrylic paint marker set is ideal for colouring, drawing, lettering, rock painting, school projects, handmade gifts and everyday arts and crafts.\n\nAvailable in 24 or 60 colour sets, these non bleed acrylic markers are suitable for use on paper, card, canvas, wood, stones, glass, ceramic, plastic and selected fabric craft projects.\n\nWater based, non-toxic and quick drying, each set is packed in a reusable carry case for easy storage.",
    // Milestone 196A: the seven Product.features entries approved and
    // applied to the live production record — kept in exact sync, no
    // tip-construction claim (unverified — see that milestone's own
    // tip-construction audit).
    features: [
      "Water based acrylic ink",
      "Non-toxic formula",
      "Quick drying colour",
      "Non-bleed, for clean colour on the page",
      "Smooth ink flow",
      "Suitable for paper, canvas, wood, stone, glass and other craft surfaces",
      "Comes in a reusable carry case",
    ],
    ageRange: "6+ years",
    stockStatus: "In Stock",
    rating: 0,
    reviewCount: 0,
    tags: ["markers", "art supplies", "colouring"],
    isFeatured: true,
    isBestSeller: false,
    isNewArrival: false,
    // Milestone 196A: "Save R50" was only ever accurate against this
    // file's own old, unrelated R249/R299 sample prices — never
    // reintroduced against the real R120/R299, which the live
    // production record itself also shows with no discountLabel set.
    discountLabel: null,
    hasVariants: true,
    variantOptions: [{ name: "Pack Size", values: ["24 Colours", "60 Colours"] }],
    variants: [
      {
        id: "SG-0011",
        optionValues: { "Pack Size": "24 Colours" },
        sku: "SG-0011",
        price: 99.99,
        stockQuantity: 150,
        imageUrl: "",
        images: [],
        languageCode: null,
        isbn: null,
        gtin: null,
      },
      {
        id: "SG-0012",
        optionValues: { "Pack Size": "60 Colours" },
        sku: "SG-0012",
        price: 249.99,
        stockQuantity: 150,
        imageUrl: "",
        images: [],
        languageCode: null,
        isbn: null,
        gtin: null,
      },
    ],
    variantPriceRange: { min: 99.99, max: 249.99 },
  },
  {
    id: "rotating-wax-crayons-12-colours",
    slug: "rotating-wax-crayons-12-colours",
    name: "Rotating Wax Crayons 12 Colours",
    category: "Markers and Crayons",
    categorySlug: "markers-and-crayons",
    price: 89.0,
    oldPrice: null,
    image: "/images/product-5.jpg",
    gallery: ["/images/product-5.jpg", "/images/product-4.jpg"],
    shortDescription: "No-mess, twist-up wax crayons in 12 classic colours.",
    description:
      "These twist-up wax crayons keep little hands clean and are perfect for on-the-go colouring. The rotating barrel means less breakage and less sharpening, making it a firm favourite with parents and teachers.",
    features: [
      "12 classic colours",
      "Twist-up barrel reduces breakage",
      "No sharpening or mess",
      "Comfortable, chunky grip for little hands",
    ],
    ageRange: "3+ years",
    stockStatus: "In Stock",
    rating: 0,
    reviewCount: 0,
    tags: ["crayons", "art supplies", "kids"],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: true,
    discountLabel: null,
  },
  {
    id: "abc-book-and-markers-bundle",
    slug: "abc-book-and-markers-bundle",
    name: "ABC Book and Markers Bundle",
    category: "Bundles",
    categorySlug: "bundles",
    price: 329.0,
    oldPrice: 398.0,
    image: "/images/product-6.jpg",
    gallery: ["/images/product-6.jpg", "/images/product-1.jpg", "/images/product-4.jpg"],
    shortDescription: "Our ABC colouring book paired with the 24-colour acrylic marker set.",
    description:
      "Everything a young learner needs in one bundle: the ABC Colouring Book for Kids with Fun Facts, paired with our 24-colour acrylic marker set, at a better price than buying separately.",
    features: [
      "Includes ABC Colouring Book for Kids with Fun Facts",
      "Includes Acrylic Marker Set 24 Colours",
      "Better value than buying individually",
      "A ready-made gift for birthdays or school",
    ],
    ageRange: "3-8 years",
    stockStatus: "In Stock",
    rating: 0,
    reviewCount: 0,
    tags: ["bundle", "kids", "gift", "markers"],
    isFeatured: false,
    isBestSeller: true,
    isNewArrival: false,
    discountLabel: "Bundle & Save",
  },
  {
    id: "bible-colouring-book-bundle",
    slug: "bible-colouring-book-bundle",
    name: "Bible Colouring Book Bundle",
    category: "Bundles",
    categorySlug: "bundles",
    price: 319.0,
    oldPrice: 338.0,
    image: "/images/product-6.jpg",
    gallery: ["/images/product-6.jpg", "/images/product-2.jpg"],
    shortDescription: "Both Little Hands Big Faith colouring books, Old and New Testament, together.",
    description:
      "The complete Little Hands Big Faith set: our Old Testament and New Testament Bible colouring books together in one bundle, perfect for Sunday school classes or as a thoughtful family gift.",
    features: [
      "Includes Old Testament Bible Colouring Book",
      "Includes New Testament Bible Colouring Book",
      "Great value for churches and Sunday schools",
      "A meaningful gift for young believers",
    ],
    ageRange: "6-10 years",
    stockStatus: "Low Stock",
    rating: 0,
    reviewCount: 0,
    tags: ["bundle", "bible", "faith", "gift"],
    isFeatured: true,
    isBestSeller: false,
    isNewArrival: false,
    discountLabel: "Bundle & Save",
  },
  {
    id: "mindfulness-book-and-markers-bundle",
    slug: "mindfulness-book-and-markers-bundle",
    name: "Mindfulness Book and Markers Bundle",
    category: "Bundles",
    categorySlug: "bundles",
    price: 379.0,
    oldPrice: 408.0,
    image: "/images/product-6.jpg",
    gallery: ["/images/product-6.jpg", "/images/product-3.jpg", "/images/product-4.jpg"],
    shortDescription: "The mindfulness colouring book paired with the acrylic marker set.",
    description:
      "A relaxing self-care bundle combining our Mindfulness Colouring Book for Adults with the 24-colour acrylic marker set. A thoughtful gift, or a lovely way to treat yourself.",
    features: [
      "Includes Mindfulness Colouring Book for Adults",
      "Includes Acrylic Marker Set 24 Colours",
      "A ready-made self-care gift",
      "Better value than buying individually",
    ],
    ageRange: "16+ years",
    stockStatus: "In Stock",
    rating: 0,
    reviewCount: 0,
    tags: ["bundle", "mindfulness", "gift", "markers"],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: true,
    discountLabel: "Bundle & Save",
  },
  {
    // Milestone 196C: synchronised with the real production record —
    // this fallback entry previously described a fictional "School
    // Starter Colouring Pack" (ABC book + rotating crayons) that has
    // never been the real SG-0010 product; the slug is an unrelated
    // historical leftover (see that milestone's own School Starter
    // forensic audit), kept as-is since the URL itself is correct and
    // already indexed — only this file's stale name/price/description/
    // features are corrected here, to match the real Old Testament +
    // Acrylic Markers bundle now live at this same URL.
    id: "school-starter-colouring-pack",
    slug: "school-starter-colouring-pack",
    name: "Old Testament Bible Colouring Book and 24 Acrylic Markers Bundle for Kids Ages 6 to 10",
    category: "Bundles",
    categorySlug: "bundles",
    price: 230.0,
    oldPrice: null,
    image: "/images/product-1.jpg",
    gallery: ["/images/product-1.jpg", "/images/product-5.jpg", "/images/product-6.jpg"],
    shortDescription:
      "Explore Old Testament Bible stories through reading, writing, prayer and colouring with this Christian activity bundle for kids ages 6 to 10, complete with 24 vibrant acrylic markers.",
    description:
      "Help children discover the Old Testament in a creative and meaningful way with this Christian learning set. It combines 30 Old Testament Bible stories with reading, memory verse, writing, prayer and colouring activities, plus a 24 colour acrylic marker set for bringing every page to life.",
    features: [
      "Old Testament Bible colouring book and 24 acrylic markers",
      "Designed for children ages 6 to 10",
      "30 Old Testament Bible stories",
      "Read, memorise, write, pray and colour activities",
      "24 vibrant acrylic marker colours",
      "Water based and non-toxic markers",
      "Ideal for home, church and Sunday school",
    ],
    ageRange: "6+ years",
    stockStatus: "In Stock",
    rating: 0,
    reviewCount: 0,
    tags: ["bundle", "schools", "wholesale", "classroom"],
    isFeatured: true,
    isBestSeller: true,
    isNewArrival: false,
    discountLabel: null,
  },
].map((product) => ({
  ...product,
  image: withBase(product.image),
  gallery: product.gallery.map(withBase),
}));
