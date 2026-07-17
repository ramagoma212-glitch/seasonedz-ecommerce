# Version 6 — Product Pages and SEO Improvement Plan (Milestone 45)

Planning only. **No product copy was rewritten and no page code was
changed as part of this milestone.** This document reviews the current
state and recommends what to improve later, so implementation
(Milestone 48) can move quickly and consistently rather than
re-deriving tone and structure from scratch.

## Current State (Reviewed)

- Product data lives in `src/data/products.js` (or the real backend
  once connected) — each product already has `name`, `shortDescription`,
  `description`, `features`, `ageRange`, `tags`, an `image` plus a
  `gallery` array.
- `document.title` is already set per-route (`src/js/router.js`) as
  `"{Page Title} | Seasonedz Group"` — basic SEO/UX groundwork already
  in place.
- `index.html` has exactly **one** static meta description, for the
  homepage only — no per-page meta description, no Open Graph tags, no
  structured data (JSON-LD) anywhere yet.
- `lang="en-ZA"` is already set on `<html>` — correct for South African
  targeting.
- No sitemap, no robots.txt reviewed as part of this milestone (worth
  a follow-up check, not covered here).

## Product Page Improvements

- Add a short, honest "why this book" line above the fold on each
  product page — what makes it useful/different, not generic sales
  copy.
- Make `features` (the existing bullet list) more scannable — this
  already exists in the data shape, so this is a display/consistency
  improvement, not a new field.
- Add a clear age-range badge near the title (data already has
  `ageRange`) so parents/teachers can tell suitability at a glance.
- Consider a short "what's inside" summary (page count, paper
  type/weight, binding) — useful, concrete detail parents and schools
  actually look for, if the business can supply it per product.

## Better Product Descriptions

- Keep descriptions in Seasonedz Group's existing tone: **simple,
  warm, professional, human** — write the way a helpful teacher or
  shop owner would describe the book to a parent, not marketing copy.
- Always spell it **"colouring," never "coloring"** — already correct
  in the codebase's own comments and templates; carry this through to
  every new or rewritten product description.
- Avoid salesy wording ("amazing," "must-have," "limited time") —
  Seasonedz Group's voice is trustworthy and calm, not urgent or
  hyped.
- Mention the real audience explicitly where true (e.g. "great for
  Sunday school," "ideal for a Grade R classroom") — concrete framing
  beats vague enthusiasm.

## Better Product Image Structure

- Confirm every product has a real, distinct primary image and a
  gallery showing: the cover, a sample colouring page, and (where
  relevant) a size/scale reference.
- Standardise image dimensions/aspect ratio across products so the
  shop grid stays visually consistent.
- Add descriptive `alt` text per image (product name + what's shown),
  both for accessibility and because image search is a real discovery
  channel for a visual product like colouring books.

## SEO Title and Meta Description Recommendations

- Per-product `<title>`: `"{Product Name} | Seasonedz Group"` —
  already the pattern `router.js` uses; just needs a per-route meta
  description to match, which doesn't exist yet.
- Per-product meta description: one honest sentence — audience, what
  it is, and the age range — e.g. *"[Product name] — a colouring book
  for [audience], ages [range]. [one distinguishing detail]."* Keep
  under ~155 characters.
- Category pages: a short meta description naming the category and its
  general audience, not just the homepage's generic one repeated
  everywhere.

## Product Schema / Structured Data Recommendations (Planning Only)

- `Product` schema (schema.org, JSON-LD) per product page: `name`,
  `description`, `image`, `offers.price`, `offers.priceCurrency`
  (`ZAR`), `offers.availability` (mapped from the existing
  `stockStatus`/`stockQuantity`).
- `BreadcrumbList` schema reflecting Home → Category → Product, once
  the internal linking below is in place.
- Do not add `AggregateRating`/`Review` schema unless the
  `rating`/`reviewCount` fields represent genuine, real customer
  reviews — fabricated review markup is a real SEO/trust risk, not a
  shortcut worth taking.

## Internal Linking Improvements

- Product pages already show "related products" — confirm this
  consistently links within the same category and, where sensible,
  cross-links complementary items (e.g. a colouring book linking to a
  matching marker/crayon set).
- Category pages should link clearly back to relevant trust pages
  (Schools, Wholesale) where relevant, e.g. a "Kids Colouring Books"
  category linking to the Schools page for bulk enquiries.
- Footer "Quick Links" already exist — confirm every major page is
  reachable within a couple of clicks from anywhere on the site.

## Category Page Improvements

- Add a short intro paragraph per category (what it is, who it suits)
  above the product grid — currently just a grid with no framing text.
- Ensure category pages support the same filter/sort/search
  combinations as the main Shop page, so a category link is never a
  dead end compared to browsing from Shop.

## Trust Section Improvements

- Ensure Contact, Shipping, Returns, Privacy, and Terms pages are
  linked prominently, not just in the footer — a first-time visitor
  deciding whether to trust a small South African ecommerce site reads
  these before buying.
- Consider a short "About Seasonedz Group" trust paragraph reachable
  from the homepage — who the business is, based where, serving
  which communities — genuine human detail, not stock "About Us"
  filler.

## FAQ Improvements

- Confirm the existing FAQ page covers the practical questions a
  parent/teacher/school actually has: delivery cost and timing
  (R80/free from R700 — already accurate), payment methods currently
  available (Bank Transfer/Cash on Delivery — PayFast still "Coming
  Soon," must stay accurate), returns, and bulk/wholesale ordering.
- Keep every FAQ answer honest about current limitations (no live
  courier tracking yet, no PayFast yet) rather than implying more than
  what's actually live — consistent with this project's consistent
  "never claim more than is true" approach throughout its whole
  history.

## Mobile Readability Improvements

- Confirm product descriptions and feature lists remain scannable at
  narrow widths — long paragraphs read worse on mobile than short ones
  with clear breaks.
- Confirm the age-range badge and price stay visible without scrolling
  on a typical phone screen.

## Performance and Image Optimisation Ideas

- Serve appropriately-sized images per context (thumbnail vs. gallery
  vs. zoom) rather than one large image reused everywhere.
- Consider modern image formats (WebP/AVIF) with a fallback, once
  real product photography exists.
- Lazy-load below-the-fold images (shop grid, related products) —
  standard, low-risk performance win.

## South African Ecommerce Trust Signals

- Prices already display in Rand (`R459.00` style) — keep consistent
  everywhere, including any future SEO/structured-data price fields
  (`ZAR`).
- Delivery fee rule (R80 below R700, free from R700) is a genuine,
  concrete trust signal already — make sure it's visible early in
  checkout and on the FAQ/shipping policy, not just buried in cart
  math.
- Being explicit about "no live courier tracking yet" and "PayFast
  coming soon" is itself a trust signal for a South African audience
  increasingly wary of vague/overpromising small ecommerce sites —
  keep this honesty, don't soften it away for marketing polish.
- A visible, real contact method (already present: contact page,
  planned WhatsApp) matters more to South African shoppers evaluating
  an unfamiliar small business than badges or generic trust seals.

## Seasonedz Group Tone Reminder

- Simple, warm, professional, human.
- "Colouring," never "coloring."
- Avoid salesy wording — favour plain, honest description over hype.

## Recommendation

Treat this as a content and metadata pass (Milestone 48), not a
redesign — the existing page structure and data shape are already
sound; what's missing is per-page SEO metadata, structured data, and
consistently warm, accurate copy. Implement per-page meta description
and `Product` schema first (highest SEO value, lowest risk), then move
to copy/image improvements product-by-product as real content becomes
available.
