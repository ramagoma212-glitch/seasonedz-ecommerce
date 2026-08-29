# Content Studio: Architecture (through Phase 3A, AI Foundation)

This document covers Phase 2 (Brand Knowledge Foundation) and Phase 3A (AI Content Generation Foundation). No AI provider is connected, no AI credential exists, and no paid AI request has ever been made from this codebase. No campaign, generation job, social account or scheduling system exists yet either. See each phase's own FINAL REPORT for its verification record, and the Phase 1 architecture audit (delivered separately as an Artifact) for the full platform vision.

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

### Seeded pillars

Seven pillars are seeded, each with real evidence, not invented.

From Phase 2, evidenced by `src/data/blogPosts.js`'s real published posts: Educational Colouring, Bible Learning, Mindfulness, School Creativity, Product Tips.

Added in Phase 3A (brief section 5's own completeness review): Phase 2 had found evidence for these two but deliberately left them unseeded pending a second look. Both were re-confirmed against `src/pages/schools.js`, a real, currently published page, and added.

- *Schools and Bulk Buying.* Evidenced by "Seasonedz Group for Schools," "Bulk Orders for Schools," "Ready-Made School Packs."
- *Faith and Church Life.* Evidenced by "Church groups and Sunday school programmes," broader than the existing Bible Learning pillar, which is colouring-book-product-specific.

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

## Retrieval strategy

`brandKnowledge.service.ts` exports `getKnowledgeContext({ productId?, audienceId?, pillarId?, categories? })`, a deterministic, database-only retrieval function. There is no vector database, no embeddings, no AI call, and no assembly into a prompt string. It returns every active entry that is either broadly applicable (no specific product/audience/pillar link, for example a sitewide `WRITING_RULE`) or scoped to whatever was asked about, ordered by `priority` then recency. A companion `getKnowledgeByTags(tags)` supports the same tag-based lookup.

Phase 3A's `contentContext.service.ts` is the actual caller (see below); this function itself is unchanged from Phase 2.

## Admin permissions

`ADMIN` has full Brand Knowledge, Pillar and Audience management: create, edit, deactivate, reactivate. `STAFF` has read access only. This is the first role-gated route surface this backend has ever had. See `middleware/requireAdminRole.middleware.ts`. Enforcement is entirely server-side; the frontend never hides or shows a control based on role, so there is nothing for a role-escalation attempt to bypass.

## Test safety (Correction B)

This project has no separate test database. `DATABASE_URL` is the real production database in every environment, test included (see `backend/TESTING_SAFETY.md`). Every Content Studio test stubs the exact Prisma calls it needs, and `config/testDbGuard.ts`'s `installProductionWriteGuard()` blocks any unstubbed mutating call automatically. Each of `brandKnowledge.service.test.ts`, `contentPillar.service.test.ts` and `audience.service.test.ts` includes one deliberately-unstubbed test proving a real `create()` call is blocked rather than silently succeeding. This is what actually verifies the guard covers these new models, not just an assumption that it does.

---

# Phase 3A: AI Content Generation Foundation

Everything below lives in `backend/src/services/ai/`. No database migration was needed for this phase: every piece is a TypeScript interface, a validator, or a service built on data Phase 2 already persists. Nothing here is wired to a real AI provider, and nothing here can spend money, by construction, not just by omission (see "Spending safety boundary" below).

## AIProvider architecture

`ai.types.ts` defines the one interface every business service depends on:

```ts
interface AIProvider {
  readonly name: string;
  generateStructured<T>(request: AIRequest): Promise<AIResult<T>>;
}
```

`generateStructured<T>` is the only method. There is no `generateText()`/`chat()` escape hatch that would hand a caller unstructured prose to parse itself. `providers/deterministicAI.provider.ts` is the only implementation Phase 3A ships: `DeterministicAIProvider` returns realistic, grounded fixtures built from the request's own context, always the same output for the same input, with zero API key and zero cost. No Anthropic, Gemini, or OpenAI import exists anywhere in `services/ai/`.

## Structured request and response contracts

`AIRequest` separates `systemInstructions` (trusted, hard-coded policy) from `context` (retrieved data) and `task` (the specific instruction), plus `outputSchema`, `temperaturePolicy` and `metadata`. `AIResult<T>` carries `data`, `provider`, `model`, `usage`, `latencyMs` and a `requestId` for future provenance, unused by anything yet since nothing is persisted.

`services/ai/contracts/` holds one hand-rolled runtime validator per output shape (this project has no schema-validation library installed anywhere, so these follow the same convention as every existing `backend/src/validators` file rather than adding Zod or similar):

- `marketingStrategy.contract.ts`: `MarketingStrategy`, including a length-capped `reasoningSummary` (a business explanation, never a raw model reasoning transcript).
- `contentIdea.contract.ts`: `ContentIdea` and `ContentHook`. A `productId` is accepted as a plain string here; whether it names a real `Product` is checked one layer up, in `contentContext.service.ts`, which has database access this module deliberately does not.
- `creativeOutputs.contract.ts`: `PlatformVariant` (a generic per-platform shape, not one hardcoded field per platform), `CaptionPackage`, `VideoScript`/`VideoScriptScene`, and `VisualBrief`.
- `qualityCheck.contract.ts`: `QualityCheckResult`/`QualityCheckIssue`, the same shape both today's deterministic checks and a future AI-based quality reviewer will return.

Nothing downstream ever reads a field from a provider response before it has passed through one of these validators.

## Context builder

`contentContext.service.ts` exports `buildContentContext({ productId?, audienceId?, pillarId?, purpose, platforms? })`. It combines, in one bounded object:

- Live `Product` facts (name, price, stock, images), read directly from `Product`, never from a `BrandKnowledgeEntry`, preserving the same source-of-truth boundary as Phase 2.
- `Audience`/`ContentPillar` rows, rejected with a 409 if inactive, 404 if the id doesn't exist.
- Brand voice knowledge via `getKnowledgeContext()`, grouped by category (writing rules, visual rules, approved/prohibited claims, calls to action, platform rules, brand facts, terminology) and capped at 10 entries per category.

This file imports exactly four Prisma models: `product`, `audience`, `contentPillar`, and (via `brandKnowledge.service.ts`) `brandKnowledgeEntry`. It never imports `customer`, `order`, `address`, `adminSession`, or any other table that could carry personal data or a secret. A test proves this by stubbing those exact delegates to throw if called, not just asserting it in a comment.

## Prompt architecture and injection defence

`promptBuilder.ts`'s `buildAIRequest()` is the only place `systemInstructions` is ever set, always from a single hard-coded constant (`SEASONEDZ_SYSTEM_POLICY`). A `ContentContext`, built from `BrandKnowledgeEntry` bodies, product descriptions, and admin-entered audience/pillar text, is always passed as `context`, never concatenated into that policy string. The policy itself instructs a future real provider to treat anything in `context` as data, never as an overriding command. `promptBuilder.test.ts` proves this holds even when a knowledge entry's body literally contains "Ignore all previous instructions": `systemInstructions` comes back byte-identical regardless.

## Prompt versioning

`promptVersions.ts` holds flat string constants (`CONTENT_STRATEGY_V1`, `CONTENT_IDEA_V1`, `VIDEO_SCRIPT_V1`, `VISUAL_BRIEF_V1`, `CAPTION_V1`, `QUALITY_CHECK_V1`). Nothing is persisted yet, so there is no table tracking which version produced what. Once Phase 3B+ starts writing real generated rows, each one stores the exact version string used, taken from here.

## Quality control

`qualityCheck.service.ts` runs checks with zero AI call: missing CTA, empty caption, missing platform variant, captions blindly copied to every platform, decorative em/en dash, the US spelling "coloring," and a heuristic scan for risky claim phrases ("award-winning," "guaranteed," etc.) not present in the content's own approved claims. These are flagged as a WARNING, never a hard ERROR, since a substring match cannot prove a claim is genuinely unsupported. "Invalid product ID," "inactive audience," and "inactive pillar" are deliberately not re-checked here: `contentContext.service.ts`'s reference validators already reject those before any context (and therefore any generated content) can exist.

`duplicateDetection.util.ts` provides exact and normalised string comparison for captions, hooks and scripts. No embeddings, and nothing checked against real history yet, since no `ContentItem` exists.

## Pipeline architecture

`contentGenerationPipeline.service.ts` exports five independently callable stage functions: `generateStrategy`, `generateIdeas`, `generateScript`, `generateVisualBrief`, `generateCaptions`. Each takes an explicit `AIProvider` parameter; none of them import or construct a specific provider, and there is no orchestrating function that chains them automatically. Regenerating a caption calls `generateCaptions()` alone. It cannot accidentally re-run strategy or script generation, which is what keeps a future regeneration cheap once a real provider bills per call.

## Cost estimation and spending safety

`usageEstimator.service.ts`'s `estimateUsage()` returns a clearly labelled, approximate token/cost estimate. Its own `basis` field states plainly that no real request has been priced. It is a planning figure only, based on the Phase 1 audit's own researched Claude Sonnet pricing as a placeholder, not any active provider's real rate.

`checkGenerationBudget()` is the spending-safety boundary a future paid call is required to pass before executing. In Phase 3A it always returns `{ allowed: false }` with an explicit "not yet enabled" reason, hard-blocked by code, not merely absent. Flipping this on is real provider activation work for a later, separately approved phase.

## Security boundary

Section 21/38's protection is structural: `contentContext.service.ts` only ever queries `Product`, `Audience`, `ContentPillar` and `BrandKnowledgeEntry`. A dedicated test stubs `prisma.customer`, `prisma.order`, `prisma.address`, `prisma.adminSession` and `prisma.affiliateApplicationDocument` to throw if called, then runs a full `buildContentContext()`, proving the exclusion rather than just documenting an intention. A second test serialises the assembled context and asserts it contains no substring resembling an email, password hash, session token, API key, ID number, bank statement, or credit card field.

## Admin context preview

`POST /api/admin/content-studio/context-preview` (`contentContextPreview.controller.ts`) is the one new route this phase adds. It calls `buildContentContext()` and returns the result: never a generation, never a raw prompt, never `SEASONEDZ_SYSTEM_POLICY` itself. Available to any authenticated admin (`ADMIN` or `STAFF`), the same "read" classification as every other GET-shaped route in this router, since it costs nothing and generates nothing. The frontend page (`src/pages/adminContentContextPreview.js`, under Content Studio's "Context Preview" tab) renders the result in labelled sections: Product Facts, Audience, Content Pillar, Writing Rules, Visual Rules, Approved Claims, Prohibited Claims, Calls to Action, Platform Rules.

## Provider activation boundary (Phase 3B)

Everything above is real, tested architecture with nothing to reimplement. Phase 3B's actual scope: implement a real `AIProvider` (almost certainly `ClaudeAIProvider`, per the Phase 1 audit's own research) behind a feature flag, obtain a real Anthropic Console API key (separate from any Claude Max subscription, confirmed in Phase 1 to be billed independently), wire `checkGenerationBudget()` to real, persisted spend tracking, and connect the pipeline stage functions to an actual admin-facing "generate" action. No generation UI, campaign, or spend exists until that phase is separately approved and built.
