// Growth Plan, Phase 2: one long-form content block per real buying
// intent, keyed by the real Category.slug from the backend. Written
// once, kept evergreen on purpose — this never mentions preorder
// status, stock or a release date, since those are live facts already
// shown correctly on each product card in the grid below (Milestone
// 181/182). Nothing here invents a review, rating, award or sales
// number; every product name and age range matches the real catalogue.
//
// Only rendered on the real path-based /category/:slug page (see
// categoryPage.js and shop.js's own `showLongFormContent` option) —
// never on the query-filtered /shop?category= view, so this content
// only ever lives under its own canonical URL.

export const CATEGORY_SEO_CONTENT = {
  "bible-colouring-books": {
    metaDescription:
      "Christian colouring books for kids, ages 6 to 10. Old and New Testament Bible colouring books for Sunday school, family devotion time and homeschooling in South Africa.",
    body: [
      "Seasonedz Group makes Bible colouring books for children who are learning the Old and New Testament stories for the first time. Little Hands, Big Faith is written for ages 6 to 10, with simple line art a child can colour independently and short, age appropriate text alongside each scene.",
      "These are genuinely useful Christian colouring books for South African families, not just decorated pages. A parent reading a Bible story at home, a Sunday school teacher preparing a lesson, or a grandparent looking for a gift that supports a child's faith will find real content here, not filler.",
      "The Old Testament book covers stories children hear often in Sunday school, from creation through to the well known accounts every Christian family wants their children to know. The New Testament book follows the same approach for the life of Jesus and the early church. Both are sized for a child's hands and hold up to regular use at a desk or kitchen table.",
      "For churches and Sunday school teachers, these books work well as a quiet activity during a lesson, a take home resource after a session, or part of a small gift for a child's first Bible. They pair naturally with our acrylic marker sets if a class wants brighter colour than crayon alone gives.",
      "Every product on this page ships from Seasonedz Group in South Africa, with Courier Guy delivery or free collection in Pretoria and Thohoyandou. If you are choosing between the Old Testament and New Testament book, or want both together, the bundle further down our shop is usually the better value for a classroom or a family with more than one child.",
    ],
  },
  "kids-colouring-books": {
    metaDescription:
      "ABC colouring book for kids with alphabet tracing and fun facts. A foundation phase activity book for Grade R, homeschooling and early learning in South Africa.",
    body: [
      "Our ABC Colouring Book for Kids is built around one simple idea: colouring and letter learning work better together. Each page pairs a letter with alphabet tracing practice and a real, simple fact, so a child ages 3 to 7 is doing three things at once without it feeling like work.",
      "It suits the foundation phase directly. A Grade R teacher can use it as a low pressure activity book between structured lessons. A parent homeschooling in South Africa can use it as a stand alone early learning resource, alongside whatever curriculum they already follow. Either way, the tracing element gives a child real pencil control practice, not just colouring for its own sake.",
      "The A4 page size gives enough room for a small hand to trace comfortably, and the fun facts on each page give a parent or teacher something real to talk about while the child colours, which tends to hold a young child's attention longer than plain pictures do.",
      "This is a foundation phase alphabet book in the plainest sense: it teaches the alphabet through repetition and colour, at an age where that repetition genuinely matters. It is equally at home in a classroom set for a Grade R class, a single copy for a homeschooling family, or a gift for a child who is just starting to recognise letters.",
      "If you are buying for a classroom or a homeschool group, our markers and crayons range is a natural add on, sized and priced for exactly this kind of everyday use. Seasonedz Group ships countrywide with Courier Guy, or offers free collection in Pretoria and Thohoyandou for local buyers.",
    ],
  },
  // Milestone 196: broader, category/genre-first copy (was product-first
  // before this pass — see git history) — see the read-only investigation
  // that preceded this: the product page's own description already
  // explicitly owns "adult colouring book"/"colouring book for adults"/
  // "mindfulness colouring book for adults" in its own closing keyword
  // sentence, so this category deliberately stays at the broader
  // "adult colouring"/"mindfulness colouring" concept level instead of
  // restating the product's own exact phrases (avoids the two pages
  // competing for the same primary term). `pageTitle` follows the same
  // optional-field pattern "bundles" introduced — every other entry
  // without one is unaffected. Deliberately no stress-relief/
  // therapeutic/mental-health claim anywhere here (owner instruction),
  // and deliberately never implies more than the one real dedicated
  // adult title Seasonedz currently sells.
  "mindfulness-colouring": {
    pageTitle: "Adult & Mindfulness Colouring",
    metaDescription:
      "Explore adult and mindfulness colouring for quiet, screen free creative time. Shop the Seasonedz mindfulness book, markers and bundle in South Africa.",
    body: [
      "Adult colouring, sometimes called mindfulness colouring, offers a simple way to spend quiet creative time away from a screen. Instead of starting with a blank page, you can choose colours and work through ready-made patterns and illustrations at your own pace.",
      "Seasonedz currently offers one dedicated adult title, the Mindfulness Colouring Book for Adults. It has 92 single sided pages with 45 designs including flowers, animals, patterns, portraits and nature scenes.",
      "You can colour for a few minutes or spend longer on a detailed page. There is no need to finish a design in one sitting, which makes adult colouring easy to fit around work, home life or other everyday routines.",
      "For people who prefer markers, the book can be paired with our 24 colour acrylic marker set. The Mindfulness Colouring Book and markers are also available together as a bundle.",
      "Seasonedz Group ships countrywide through Courier Guy, with free collection available in Pretoria and Thohoyandou. Our markers and crayons are also available separately for other colouring activities.",
    ],
  },
  "markers-and-crayons": {
    metaDescription:
      "Acrylic markers and wax crayons for kids and adults. Vibrant, safe colouring supplies from Seasonedz Group, made to pair with our colouring books.",
    body: [
      "Every colouring book is only as good as what you colour it with, and this range exists to be the reliable, no fuss answer to that. Our Seasonedz Creative Acrylic Paint Marker Set gives 24 colours with a genuinely non bleed tip, so colour stays on the page instead of soaking through to the next one, which matters if a child is working through a book they will want to keep.",
      "For younger hands, our 12 Colour Rotating Wax Crayons use a twist up design, so there is no sharpening and less risk of a snapped crayon halfway through a page. They suit ages 3 and up, and work well alongside our ABC Colouring Book for a young child who is still developing grip and control.",
      "Both sets are chosen to pair naturally with the rest of our range, whether that is a Bible colouring book for a Sunday school class, a mindfulness colouring book for an adult who wants richer colour than pencil gives, or a classroom set where a teacher wants every child using the same reliable materials.",
      "If you are buying for a classroom, a Sunday school group or a family with more than one child colouring at once, buying markers or crayons together with a colouring book as a bundle is usually the better value, and several of those combinations are available further down our shop.",
      "Seasonedz Group ships countrywide with Courier Guy, and offers free collection in Pretoria and Thohoyandou for anyone nearby who would rather collect than wait for delivery.",
    ],
  },
  // Milestone 196: Growth Plan Phase 2 previously covered 4 of the 5
  // real categories — this fills the one gap. `pageTitle` is a new,
  // optional field (undefined/absent for every other entry above,
  // which keeps reading the real Category.name exactly as before) —
  // shop.js only ever uses it for the real /category/bundles page's
  // own <title>/H1/visible breadcrumb text, never the Category
  // entity's own name (unchanged everywhere else: /categories cards,
  // nav, and the BreadcrumbList JSON-LD's own `name`, deliberately left
  // alone — structured data is out of scope for this pass). "Bundles"
  // alone doesn't say what's actually in the category to someone who's
  // never heard of Seasonedz; "Colouring Book Bundles" does, without
  // renaming the underlying category record itself.
  bundles: {
    pageTitle: "Colouring Book Bundles",
    metaDescription:
      "Shop colouring book bundles with books, markers and crayons for kids, Bible learning and mindful colouring. Available from Seasonedz Group South Africa.",
    // Every product named below is a real, currently live item in this
    // category (checked against the live catalogue before writing
    // this) — the school-starter-colouring-pack product is referred to
    // by what it actually is, the Old Testament bundle, never by its
    // own slug's misleading name (a separate, already-flagged, not-yet-
    // fixed issue this content deliberately doesn't touch or repeat).
    body: [
      "Our colouring book bundles pair one of our real colouring books with the markers or crayons it is meant to be used with, so there is nothing extra to buy before a child, a Sunday school class or an adult who wants to relax can start colouring straight away. Every bundle here is a genuine pairing we sell together, never two unrelated items grouped just for the sake of a bundle.",
      "Buying the book and its markers or crayons together usually costs less than buying the same two items separately, which matters if you are equipping more than one child, a classroom, or simply want a complete, ready to give gift set arriving in one order.",
      "For younger children we pair our ABC Colouring Book with 12 Rotating Wax Crayons, an easy grip set that suits a child who is still learning to hold a crayon properly. For a child ready for richer colour, our New Testament Bible Colouring Book comes with a full 24 colour acrylic marker set, giving a Sunday school class or a family devotion time both the story and the means to colour it well. Our kids colouring books and our markers and crayons are also available on their own, if you only need one part of the set.",
      "The same pairing is available for the Old Testament, and for a family or class that wants both testaments together, the Old and New Testament Bible Colouring Books Bundle brings the two books into one set. Anyone looking specifically for Bible colouring books on their own can find those in our bible colouring books range too.",
      "For adults, our Mindfulness Colouring Book for Adults comes bundled with the same 24 colour acrylic marker set from our mindfulness colouring range, for a richer colouring experience than pencil or plain crayon alone. Seasonedz Group ships every bundle countrywide with Courier Guy, with free collection available in Pretoria and Thohoyandou for anyone nearby.",
    ],
  },
};

export function getCategorySeoContent(slug) {
  return CATEGORY_SEO_CONTENT[slug] || null;
}
