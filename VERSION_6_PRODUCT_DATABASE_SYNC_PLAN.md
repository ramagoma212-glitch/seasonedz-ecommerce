# Version 6 — Product Database Content Sync Plan (Milestone 49)

Planning only. **No production database change is made by this
milestone.** This document exists so a future, explicitly-approved
milestone can update backend product records safely, without guessing
at scope or risking unrelated fields (stock, price, images).

## Current Finding

Production product pages (and the SEO metadata/JSON-LD added in
Milestone 48) read product data from the Render backend's Postgres
database via `GET /api/products` and `GET /api/products/:slug`
(`backend/src/services/product.service.ts`, `toProductOutput()`) —
**not** from `src/data/products.js`. That static frontend file is only
used as a fallback when the API is unreachable
(`src/js/api/productsApi.js`).

Milestone 48 updated the real facts (page counts, binding, paper size,
better descriptions) only in `src/data/products.js`. Confirmed live on
2026-07-18: `GET https://seasonedz-ecommerce.onrender.com/api/products`
still returns the old seed-era `shortDescription`/`description`/
`features` for all four named products, and has no page count, paper
size or binding data at all — the database was never seeded with those
facts, and this milestone correctly did not touch it.

## Product Records To Update

All four identified by `slug` (stable, unique) and current `sku`, read
directly from the live `/api/products` response:

| Product | slug | sku |
|---|---|---|
| ABC Colouring Book for Kids with Fun Facts | `abc-colouring-book-for-kids-with-fun-facts` | `SG-0001` |
| Mindfulness Colouring Book for Adults | `mindfulness-colouring-book-for-adults` | `SG-0002` |
| Little Hands Big Faith Old Testament Bible Colouring Book | `little-hands-big-faith-old-testament-bible-colouring-book` | `SG-0003` |
| Little Hands Big Faith New Testament Bible Colouring Book | `little-hands-big-faith-new-testament-bible-colouring-book` | `SG-0004` |

No other product records are in scope. Nothing about bundles that
*contain* these products (`abc-book-and-markers-bundle`,
`bible-colouring-book-bundle`, `mindfulness-book-and-markers-bundle`)
is proposed to change — their own description text does not currently
state page counts, so there is nothing stale to correct there.

## Schema Gap Found

`backend/prisma/schema.prisma`'s `Product` model has **no** `paperSize`,
`pageCount`, or `binding` columns — only `description`,
`shortDescription`, `features` (`Json?`), and `ageRange` (`String?`)
exist as free-text-capable fields. `src/data/products.js` (frontend
fallback) added `paperSize`/`pageCount`/`binding` as new top-level
object fields, but there is no backend equivalent.

Two ways to close this gap, and this plan deliberately does **not**
pick one — that choice needs a human decision before implementation:

1. **No schema change** — fold paper size/page count/binding into the
   existing `description` and `features` (Json array of bullet
   strings) fields, exactly as prose/bullets. Zero migration risk, can
   ship as a pure `UPDATE`/Prisma `update()` on existing columns.
2. **Schema change** — add `paperSize String?`, `pageCount Int?`,
   `binding String?` columns via a Prisma migration, so the API can
   expose them as their own structured fields (which `productDetails.js`
   already reads and conditionally renders — see
   `VERSION_6_PRODUCT_SEO_IMPLEMENTATION_RESULT.md`). More work and
   carries real migration risk against the live Supabase database, but
   makes the data structured rather than buried in prose, and is what
   would make the frontend's existing `product.paperSize` /
   `product.pageCount` / `product.binding` conditional rendering
   actually activate on the live site.

**Recommendation for a future milestone:** option 2 is the "real" fix,
but option 1 is safe to do first and immediately improves the
description/features text search relies on
(`product.service.ts`'s `buildWhere()` search already matches against
`description`/`shortDescription`). Whichever is chosen, this plan's
safety rules and rollback approach apply the same way.

## Fields Recommended For Update

For the four products above only:

- `description` — replace with the corrected, fact-accurate prose
  already written for Milestone 48 (see `src/data/products.js` and
  `VERSION_6_PRODUCT_SEO_IMPLEMENTATION_RESULT.md` for the exact
  supplied text).
- `shortDescription` — same source.
- `features` (Json array) — replace the stale bullet points (e.g. "40
  pages", "36 pages of Old Testament stories") with the corrected
  ones already used in `src/data/products.js`.
- `ageRange` — only for the two Bible titles, `"4-10 years"` →
  `"6-10 years"`, per the real facts supplied in Milestone 48.
- **`paperSize` / `pageCount` / `binding`** — only if the schema-change
  option above is approved and implemented first; otherwise these
  facts are folded into `description`/`features` text instead (see
  Schema Gap section).
- `tags` — no changes proposed. Current tags for all four products are
  already accurate; changing tags now would be scope creep beyond
  "sync the facts that are wrong."

**Explicitly not touched, under any version of this plan:**

- `price` / `oldPrice` — not touched, per instruction.
- `stockQuantity` — not touched, per instruction. (Also technically
  hazardous: see Risk section — production stock has moved since
  seeding, e.g. the New Testament title's live `stockQuantity` is `1`,
  not the seed value of `4`.)
- `images` / `ProductImage` rows — no image changes were part of
  Milestone 48 and none are proposed.
- `slug` — never changes; it's the stable key every reference (cart,
  order history, this very plan) depends on.
- `sku`, `ratingAverage`, `reviewCount`, `isFeatured`, `isBestSeller`,
  `isNewArrival`, `discountLabel`, `category` — untouched, out of
  scope.

## Risk Found: `prisma/seed.ts` Is Not Safe To Re-Run Against Production

`backend/prisma/seed.ts`'s `productSeeds` upsert `update` block writes
**every** field including `price`, `stockQuantity`, `ratingAverage`
and `reviewCount` back to their original seed-time values on every
run. Production `stockQuantity` has already diverged from those seed
defaults through real orders (confirmed live: New Testament title is
at `1` in production vs. seed value `4`; School Starter Pack is at
`46` vs. seed value `50`). **Simply editing `seed.ts` and re-running
`npx prisma db seed` against the production database would silently
overwrite live stock counts and ratings — a real, easy mistake to
make and exactly the kind of change this milestone is required to
avoid.**

This is the main reason a dedicated, narrowly-scoped script is
recommended over reusing `seed.ts` — see below.

## Safety Rules

- No payment code, PayFast config, or checkout logic touched.
- No stock quantity changes, under any circumstance.
- No price changes.
- No production database write in this milestone — planning only.
- Any future update script must default to a dry run and must be
  reviewed and explicitly approved before it is ever pointed at the
  production `DATABASE_URL`.
- Any future update script must touch only the four named products
  (matched by `slug`, never by broader `where` conditions), and only
  the specific fields listed above.
- A backup of the current field values (below) must be taken
  immediately before any real update runs, so a rollback needs no
  guessing.

### Backup Of Current Production Values (captured 2026-07-18, for rollback)

```json
[
  {
    "slug": "abc-colouring-book-for-kids-with-fun-facts",
    "shortDescription": "A colourful A-Z colouring book packed with fun facts for little learners.",
    "description": "Help your child learn their ABCs while having fun. Each letter comes with a large, easy-to-colour illustration and a bite-sized fun fact, making this book a favourite for home, pre-school and the classroom.",
    "features": ["40 pages of colouring fun", "A fun fact printed on every page", "Thick, bleed-resistant paper", "Perfect for ages 3 to 8"],
    "ageRange": "3-8 years"
  },
  {
    "slug": "mindfulness-colouring-book-for-adults",
    "shortDescription": "Intricate, calming patterns designed to ease stress and encourage mindfulness.",
    "description": "A beautifully illustrated colouring book for adults, featuring intricate mandalas and nature-inspired patterns. A screen-free way to unwind, focus and practise mindfulness after a long day.",
    "features": ["50 intricate pattern pages", "Single-sided pages to prevent bleed-through", "Designed for coloured pencils and fine markers", "A relaxing, screen-free activity"],
    "ageRange": "16+ years"
  },
  {
    "slug": "little-hands-big-faith-old-testament-bible-colouring-book",
    "shortDescription": "Beloved Old Testament stories brought to life through colouring.",
    "description": "From Noah's Ark to David and Goliath, this colouring book introduces children to well-loved Old Testament stories through warm, simple illustrations, ideal for Sunday school or family devotion time.",
    "features": ["36 pages of Old Testament stories", "Simple illustrations suited to young colourists", "Great for Sunday school and family devotions", "Sturdy cover for regular use"],
    "ageRange": "4-10 years"
  },
  {
    "slug": "little-hands-big-faith-new-testament-bible-colouring-book",
    "shortDescription": "The life of Jesus and the New Testament, illustrated for little hands.",
    "description": "A gentle introduction to the New Testament, from the Nativity to the parables of Jesus. Companion book to our Old Testament title, designed with the same warm, easy-to-colour illustration style.",
    "features": ["36 pages of New Testament stories", "Companion to the Old Testament colouring book", "Simple illustrations suited to young colourists", "Great for Sunday school and family devotions"],
    "ageRange": "4-10 years"
  }
]
```

(This same JSON is also saved as
`backend/prisma/product-content-backup-2026-07-18.json` for easy
machine use by a future rollback script.)

## Recommended Implementation Approach

- A standalone script, e.g. `backend/prisma/scripts/syncProductContent.ts`
  — **not** `seed.ts`, and **not** created as an executable script by
  this milestone (see below).
- Takes its update payload from a small, explicit array of
  `{ slug, description, shortDescription, features, ageRange }`
  objects — only the four products, only those fields. No broad
  `updateMany`, no `where` clause wider than `{ slug: { in: [...] } }`.
- Defaults to `--dry-run` (prints a diff of old vs. new values per
  product, writes nothing) unless a script is explicitly re-run with
  an opt-in flag, e.g. `--commit`.
- Logs each product it would update (or did update) by slug and which
  fields changed, before/after.
- Idempotent: running it twice with the same payload produces the same
  end state and a no-op diff the second time.
- Never touches `price`, `stockQuantity`, `ratingAverage`,
  `reviewCount`, `images`, or any product not in its explicit slug
  list — enforced by only ever calling `prisma.product.update()` with
  a narrow `data: {}` object listing exactly the fields above, never a
  spread of a larger seed-style object.

## Testing Plan (for when implementation is approved)

1. Run the script in `--dry-run` mode first, against whichever
   database `DATABASE_URL` currently points to locally — review the
   printed diff carefully before ever considering `--commit`.
2. If a staging database exists, run `--commit` there first. (None is
   known to exist for this project today — to confirm before the next
   milestone.)
3. Only after a human explicitly approves, run `--commit` against
   production.
4. Immediately after, `GET /api/products/:slug` for all four products
   and confirm the returned `description`/`shortDescription`/
   `features`/`ageRange` match the intended new values exactly.
5. Load each of the four live product pages in a browser and confirm
   the page text, the SEO `<meta name="description">`, and the
   `Product` JSON-LD (`js/seo.js` / `productDetails.js`) all reflect
   the updated facts — the same Playwright-based checks used at the
   end of Milestone 48's merge, re-run against the four specific
   product URLs.
6. Confirm checkout still completes normally with Bank Transfer /
   Cash on Delivery (no code path here is touched, but this is a
   cheap, high-value confirmation after any DB write).
7. Confirm `POST /api/payments/payfast/initiate` still returns `503`
   "PayFast payments are not enabled" and the live site still shows
   the PayFast radio as disabled — unrelated to this change, but part
   of this project's standard post-change checklist.

## Rollback Plan

- The backup JSON above (and the accompanying
  `product-content-backup-2026-07-18.json` file) contains every
  original value needed to restore `description`/`shortDescription`/
  `features`/`ageRange` for all four products.
- Rollback re-runs the same script pointed at the backup file instead
  of the new-facts payload — same narrow `{ slug: { in: [...] } }`
  update, same dry-run-first discipline.
- No stock or price rollback is ever needed, because this plan never
  touches those fields in the first place.

## Draft (Not Executable) Update Reference

See `backend/prisma/product-content-update-plan.md` for the literal
old-value → new-value text this milestone recommends, laid out
per-product for a human to review field-by-field before any script is
written to apply it.
