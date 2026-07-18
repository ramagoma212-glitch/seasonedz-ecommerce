# Product Content Update Plan — Draft Reference (Not Executable)

Documentation only. This file lists the proposed old → new text for
the four products identified in
`VERSION_6_PRODUCT_DATABASE_SYNC_PLAN.md`, so a human can review the
exact wording before any script is written to apply it. **There is no
script in this repository that reads this file or applies these
changes.** Nothing here runs automatically.

New text is copied verbatim from `src/data/products.js` as of
Milestone 48 (commit `74b1a2c`), which was written from the real
product facts supplied for that milestone.

---

## ABC Colouring Book for Kids with Fun Facts (`abc-colouring-book-for-kids-with-fun-facts`, SKU `SG-0001`)

**shortDescription**
- Old: "A colourful A-Z colouring book packed with fun facts for little learners."
- New: "An A4 alphabet colouring book for early learners, with tracing, colouring and a fun fact on every page."

**description**
- Old: "Help your child learn their ABCs while having fun. Each letter comes with a large, easy-to-colour illustration and a bite-sized fun fact, making this book a favourite for home, pre-school and the classroom."
- New: "Made for young children who are just starting to learn their letters. Each page pairs a large letter to trace and colour with a simple, bite sized fun fact, so little hands stay busy while little minds pick up something new. A firm favourite at home, in pre-school and in the classroom."

**features**
- Old: ["40 pages of colouring fun", "A fun fact printed on every page", "Thick, bleed-resistant paper", "Perfect for ages 3 to 8"]
- New: ["A4 size, 30 pages", "Saddle-stitched (stapled) binding", "Letters to trace as well as colour", "A fun fact printed on every page", "Suited to early learning at home or school"]

**ageRange**: unchanged, "3-8 years"

**Facts not in schema today** (see Schema Gap in the sync plan): paperSize `A4`, pageCount `30`, binding `Saddle-stitched` — folded into description/features above unless the schema-change option is approved.

---

## Mindfulness Colouring Book for Adults (`mindfulness-colouring-book-for-adults`, SKU `SG-0002`)

**shortDescription**
- Old: "Intricate, calming patterns designed to ease stress and encourage mindfulness."
- New: "An A4 adult colouring book with 45 calming designs across 92 pages, for relaxation and quiet creative time."

**description**
- Old: "A beautifully illustrated colouring book for adults, featuring intricate mandalas and nature-inspired patterns. A screen-free way to unwind, focus and practise mindfulness after a long day."
- New: "A generous A4 colouring book made for adults who want a quiet, creative way to unwind. Inside are 45 detailed designs across 92 single sided pages, giving plenty of room for stress relief and mindfulness without a screen in sight. A thoughtful choice for anyone wanting a calm activity at the end of the day, or a gift for someone who could use a little quiet time."

**features**
- Old: ["50 intricate pattern pages", "Single-sided pages to prevent bleed-through", "Designed for coloured pencils and fine markers", "A relaxing, screen-free activity"]
- New: ["A4 size, 92 pages", "45 detailed designs", "Single-sided pages so colour never bleeds through", "Perfect (glued) binding for a book that lies flatter as you colour", "Suited to coloured pencils and fine markers"]

**ageRange**: unchanged, "16+ years"

**Facts not in schema today**: paperSize `A4`, pageCount `92`, binding `Perfect binding`.

---

## Little Hands Big Faith Old Testament Bible Colouring Book (`little-hands-big-faith-old-testament-bible-colouring-book`, SKU `SG-0003`)

**shortDescription**
- Old: "Beloved Old Testament stories brought to life through colouring."
- New: "An A4 Bible colouring book with 30 Old Testament stories to read, write, pray and colour. Ages 6 to 10."

**description**
- Old: "From Noah's Ark to David and Goliath, this colouring book introduces children to well-loved Old Testament stories through warm, simple illustrations, ideal for Sunday school or family devotion time."
- New: "From Noah's Ark to David and Goliath, this A4 colouring book introduces children aged 6 to 10 to 30 well loved Old Testament stories. Each story invites your child to read, write, pray and colour, making it a meaningful choice for Sunday school, family devotion time or quiet time at home."

**features**
- Old: ["36 pages of Old Testament stories", "Simple illustrations suited to young colourists", "Great for Sunday school and family devotions", "Sturdy cover for regular use"]
- New: ["A4 size, 66 pages", "30 Old Testament stories", "Read, write, pray and colour on every page", "Saddle-stitched (stapled) binding", "Great for Sunday school and family devotions"]

**ageRange**
- Old: "4-10 years"
- New: "6-10 years"

**Facts not in schema today**: paperSize `A4`, pageCount `66`, binding `Saddle-stitched`.

---

## Little Hands Big Faith New Testament Bible Colouring Book (`little-hands-big-faith-new-testament-bible-colouring-book`, SKU `SG-0004`)

**shortDescription**
- Old: "The life of Jesus and the New Testament, illustrated for little hands."
- New: "An A4 Bible colouring book with 30 New Testament stories to read, write, pray and colour. Ages 6 to 10."

**description**
- Old: "A gentle introduction to the New Testament, from the Nativity to the parables of Jesus. Companion book to our Old Testament title, designed with the same warm, easy-to-colour illustration style."
- New: "A gentle introduction to the New Testament for children aged 6 to 10, from the Nativity to the parables of Jesus. This A4 colouring book covers 30 New Testament stories, each inviting your child to read, write, pray and colour. A companion to our Old Testament title, with the same warm illustration style, ideal for Sunday school or family devotion time."

**features**
- Old: ["36 pages of New Testament stories", "Companion to the Old Testament colouring book", "Simple illustrations suited to young colourists", "Great for Sunday school and family devotions"]
- New: ["A4 size, 66 pages", "30 New Testament stories", "Read, write, pray and colour on every page", "Saddle-stitched (stapled) binding", "Companion to the Old Testament colouring book"]

**ageRange**
- Old: "4-10 years"
- New: "6-10 years"

**Facts not in schema today**: paperSize `A4`, pageCount `66`, binding `Saddle-stitched`.

**Note**: this product's live `stockQuantity` was `1` at the time this
plan was written (2026-07-18) — a reminder of exactly why any future
update script must never touch `stockQuantity`, only the text fields
listed here.

---

## Not Included

No changes are proposed for `price`, `oldPrice`, `stockQuantity`,
`images`, `slug`, `sku`, `ratingAverage`, `reviewCount`, `isFeatured`,
`isBestSeller`, `isNewArrival`, `discountLabel`, `category`, or `tags`
on any of the four products, and no other product in the catalogue is
included in this plan.
