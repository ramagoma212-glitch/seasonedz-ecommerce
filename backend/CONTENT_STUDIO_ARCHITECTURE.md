# Content Studio: Architecture (Phase 2, Brand Knowledge Foundation)

This document describes only what Phase 2 actually built: the Brand Knowledge Foundation. No AI provider, campaign, generation job, social account or scheduling system exists yet. See `PHASE 2 FINAL REPORT` (delivered to the owner) for the full verification record, and the Phase 1 architecture audit (delivered separately as an Artifact) for the full platform vision.

## Corrections carried forward from the Phase 1 audit

The Phase 2 brief issued four corrections to the Phase 1 report before this work began.

- **Correction A (scheduling).** The Phase 1 report stated no real cron resource exists. The Phase 2 brief states a Render Cron Job already exists for notification processing. This could not be independently confirmed from repository state: `backend/NOTIFICATIONS_SETUP.md` (last touched 2026-08-27, the day before this correction was issued) still explicitly describes that Cron Job as "Not created by this milestone, a deliberate, owner-approved decision before adding any paid Render resource," and `render.yaml` declares only one `web` service. A Render dashboard change would not appear in either file. Regardless, this correction has no implementation impact on Phase 2, since nothing here schedules anything. **Before Phase 3+ introduces `GenerationJob` processing or scheduled publishing, re-confirm directly in the Render dashboard whether a Cron Job already exists, and if so, extend it rather than creating a second one.**
- **Correction B (test safety).** Confirmed still active and unweakened. See "Test safety" below.
- **Correction C (Anthropic).** No Anthropic credential, SDK, or API call exists anywhere in this phase.
- **Correction D (Meta/TikTok).** No Meta or TikTok integration, credential, or code exists anywhere in this phase.

## What this phase built

Three new database models, added in one additive migration, with no existing table altered:

- `BrandKnowledgeEntry`: structured marketing and brand knowledge.
- `ContentPillar`: named marketing content categories.
- `Audience`: named marketing audiences, never individual customer records.

Backend: `services/brandKnowledge.service.ts`, `services/contentPillar.service.ts`, `services/audience.service.ts`, their controllers, and `routes/contentStudio.routes.ts`, mounted at `/api/admin/content-studio`.

Frontend: a new "Content Studio" entry in the admin nav, with three admin CRUD areas (Brand Knowledge, Content Pillars, Audiences) under `/admin/content-studio`.

## Product source-of-truth boundary

This is the one rule every part of this phase was built around. **`Product` remains the sole authority for a product's name, price, stock, SKU, slug, availability and real images.** `BrandKnowledgeEntry` never stores any of those. It may optionally link to one real `Product` via `relatedProductId`, but that link only ever carries guidance about the product, such as approved positioning, approved benefits, or prohibited claims, never a copy of its transactional facts. A future AI context builder (Phase 3+) must always read current product facts from `Product` directly and treat a knowledge entry as guidance, however old it gets.

This is enforced structurally, not just by convention. `BrandKnowledgeEntryCreateInput` (the service's own accepted input shape) has no `price`, `stockQuantity`, or `name` field at all. See `brandKnowledge.service.ts`'s own interface and its test file's explicit assertion of this.

## Brand Knowledge model

Category (`BrandKnowledgeCategory` enum): `BRAND_FACT`, `BRAND_VOICE`, `WRITING_RULE`, `VISUAL_RULE`, `PRODUCT_POSITIONING`, `AUDIENCE_INSIGHT`, `APPROVED_CLAIM`, `PROHIBITED_CLAIM`, `TERMINOLOGY`, `CALL_TO_ACTION`, `PLATFORM_RULE`, `SEASONAL_GUIDANCE`, `CAMPAIGN_HISTORY`. This is an evolution of the Phase 1 report's own proposed list, expanded per the Phase 2 brief section 9.

Provenance (`BrandKnowledgeSourceType` enum): `OWNER_APPROVED`, `WEBSITE`, `PRODUCT_DATABASE`, `POLICY`, `HISTORICAL_CAMPAIGN`, `INTERNAL_GUIDANCE`. This is kept deliberately separate from category, so a future reader can tell an owner-approved writing rule apart from a website-derived fact without parsing free text. Every seeded entry cites a real `sourceReference` (see the seed manifest below); nothing was AI-generated (brief section 30).

Every entry also carries: `tags` (a Postgres array, the first native array field in this schema, chosen specifically because tag-based retrieval is a real, required query per brief section 23, unlike `Audience`'s free-text fields below), `isActive` (deactivate/reactivate only, no hard-delete route exists), `priority` (unused by anything in Phase 2, reserved for Phase 3's own retrieval bounding), optional `pillarId`, `audienceId` and `relatedProductId` links, and `createdByAdminId`/`updatedByAdminId` (SetNull on admin deletion, matching `OrderStatusHistory`'s established audit-trail discipline).

## Content Pillars and Audiences

`ContentPillar` (`name` unique, `description`, `sortOrder`, `isActive`) is database-managed rather than hard-coded in frontend JavaScript, per brief section 14.

`Audience` (`name` unique, `description`, `painPoints`, `motivations`, `preferredContent`, `isActive`) is a marketing audience, never a customer record. The three guidance fields are deliberately plain text, not arrays: unlike `tags` above, nothing queries them individually, and a future AI context builder reads them as prose.

### Seeded pillars (confirmed) and candidates not seeded

Seeded, with evidence from `src/data/blogPosts.js`'s real published posts: Educational Colouring, Bible Learning, Mindfulness, School Creativity, Product Tips.

**Recommended for future consideration, not seeded.** Real evidence exists for both, but as a business operation rather than an existing content pillar with published posts.

- *Schools and Bulk Buying.* `src/pages/schools.js` is a dedicated, real page ("Seasonedz Group for Schools," "Bulk Orders for Schools," "Ready-Made School Packs"), but no blog content yet exists under this angle specifically.
- *Faith and Church Life.* `schools.js` explicitly lists "Church groups and Sunday school programmes" as a served audience, broader than the existing Bible Learning pillar, which is colouring-book-product-specific.

An `ADMIN` can activate either through the Content Pillars admin page in minutes, once the owner decides they're wanted. No code change required.

### Seeded audiences (confirmed)

All seven candidates the Phase 2 brief itself listed were seeded, each verified against real, currently-published content rather than assumed.

| Audience | Evidence |
|---|---|
| Parents | About page: "For a child, it can make learning more enjoyable." |
| Teachers | `schools.js`: "Individual teachers and classrooms"; blog post "Bringing Creativity Into Your Classroom" |
| Schools | `schools.js`: preschools, primary schools, aftercare centres, tutoring centres; product category "Schools and Wholesale" |
| Churches | `schools.js`: "Church groups and Sunday school programmes"; blog post "Using Bible Colouring Books in Sunday School" |
| Families | About page: "For a family, it can encourage meaningful time together." |
| Adult Colouring and Mindfulness Customers | About page's adult framing; product category and blog pillar "Mindfulness" |
| Business and Bulk Buyers | `schools.js`: "Bulk Orders for Schools," "Kids programmes and holiday clubs" |

## Retrieval strategy (the Phase 3 integration point)

`brandKnowledge.service.ts` exports `getKnowledgeContext({ productId?, audienceId?, pillarId?, categories? })`, a deterministic, database-only retrieval function. There is no vector database, no embeddings, no AI call, and no assembly into a prompt string, since brief sections 23 and 24 explicitly forbid all of that in this phase. It returns every active entry that is either broadly applicable (no specific product/audience/pillar link, for example a sitewide `WRITING_RULE`) or scoped to whatever was asked about, ordered by `priority` then recency. A companion `getKnowledgeByTags(tags)` supports the same tag-based lookup brief section 23 asked for.

This is the one function Phase 3 is expected to call. Turning its structured output into an actual Claude prompt is explicitly Phase 3's job, not this one's.

## Admin permissions

`ADMIN` has full Brand Knowledge, Pillar and Audience management: create, edit, deactivate, reactivate. `STAFF` has read access only. This is the first role-gated route surface this backend has ever had. See `middleware/requireAdminRole.middleware.ts`. Enforcement is entirely server-side; the frontend never hides or shows a control based on role, so there is nothing for a role-escalation attempt to bypass.

## Test safety (Correction B)

This project has no separate test database. `DATABASE_URL` is the real production database in every environment, test included (see `backend/TESTING_SAFETY.md`). Every Content Studio test stubs the exact Prisma calls it needs, and `config/testDbGuard.ts`'s `installProductionWriteGuard()` blocks any unstubbed mutating call automatically. Each of `brandKnowledge.service.test.ts`, `contentPillar.service.test.ts` and `audience.service.test.ts` includes one deliberately-unstubbed test proving a real `create()` call is blocked rather than silently succeeding. This is what actually verifies the guard covers these new models, not just an assumption that it does.
