# AI Search Visibility Measurement Plan — Milestone 203

**Baseline date:** 7 October 2026 (see `AI_SEARCH_BASELINE_MILESTONE_203.md` for the full baseline results this plan measures against).

This defines what to re-check, and when, to see whether the crawlability/entity/content work in this milestone has had an effect. It is a measurement schedule, not a promise — none of the review periods below are expected to show a guaranteed improvement; some may show nothing measurable, which is itself a valid result worth recording honestly.

## Review checkpoints

| Checkpoint | Date (from 7 Oct 2026 baseline) | What to re-run |
|---|---|---|
| 7-day | 14 October 2026 | Re-run all 12 baseline queries from `AI_SEARCH_BASELINE_MILESTONE_203.md`, in the same tool, same wording. Check Google Search Console (if access exists by then) for first impressions. |
| 28-day | 4 November 2026 | Same 12 queries. Check Search Console impressions/clicks/queries/pages trend over the full period, not just a single day's snapshot. Check whether `/robots.txt`'s named crawler rules have actually been fetched by Googlebot/Bingbot (Search Console's and Bing Webmaster Tools' own crawl-stats reports, if access exists). |
| 90-day | 5 January 2027 | Same 12 queries. Full Search Console + Bing Webmaster trend review. Re-assess whether any of the external citation opportunities in `AI_CITATION_OPPORTUNITIES_M203.md` were acted on, and if so, whether they correlate with any visibility change. |

## What to measure at each checkpoint

### 1. Brand queries
- "Seasonedz Group colouring books"
- "Seasonedz colouring"
- `site:seasonedzgroup.co.za`

A business should be trivially findable by its own name. This is the single clearest pass/fail signal — if these three still return nothing at the 28-day checkpoint, that is a stronger signal of an indexation problem than any ranking position on a competitive commercial term ever would be.

### 2. Commercial non-brand queries
The 9 commercial queries from the baseline (colouring books South Africa, kids colouring books South Africa, Bible colouring books South Africa Christian, mindfulness adult colouring books South Africa, acrylic paint markers South Africa buy, South African colouring book brands, where to buy colouring books online South Africa, educational colouring books South Africa schools, colouring book bundles South Africa). Record: appeared yes/no, approximate position if shown, which competitors still appear.

### 3. AI-answer-engine checks (where accessible)
- **ChatGPT Search**: ask the same brand and top 2-3 commercial queries directly in ChatGPT with search enabled, if the person running the checkpoint has access. Record whether Seasonedz is cited, and which URL.
- **Google AI Overviews**: note whether an AI Overview appears at all for the commercial queries, and if so, whether Seasonedz is among the cited sources.
- **Microsoft Copilot**: same check, if accessible.
- This environment could not run any of the three for the 7 October baseline (**NOT MEASURED**) — these checks require a human with direct product access, not this tool.

### 4. Google Search Console (if/when access exists)
- Impressions, clicks, and average position for queries containing "Seasonedz" and for the core commercial terms.
- Indexed-page count vs. the 39/41-URL sitemap (see final report for the exact post-milestone count).
- Whether `/blog/*` pages, the 5 category pages and `/shop/` show any impressions at all — a genuinely useful signal for whether the new BreadcrumbList/content changes are even being crawled.
- **Status as of this milestone: GSC DATA NOT AVAILABLE IN THIS ENVIRONMENT.** No authenticated Search Console access exists here; this row is a placeholder instruction for whoever runs the checkpoint with real access.

### 5. Bing Webmaster Tools (if/when access exists)
- Indexed pages, crawl errors, and (if Bing has rolled it out to this property) any AI-citation reporting Bing Webmaster Tools exposes.
- Whether the IndexNow submissions (see final report) show up in Bing's own IndexNow activity log for the property.
- **Status as of this milestone: not available in this environment** — same placeholder as Search Console above.

### 6. Referral traffic (if/when analytics access exists)
- GA4 (if `VITE_GA_MEASUREMENT_ID` is configured by then — see `deploy.yml`'s own comment on this being owner-supplied): check for any sessions with source containing "chatgpt", "bing", "perplexity", "copilot", or organic sessions to `/blog/*` and `/category/*` specifically, which would indicate the new internal links and breadcrumb structure are actually being used by real visitors arriving from search.

## How to read the results honestly

- A single query not appearing on one day proves nothing. A **pattern across multiple checkpoints** (e.g., still zero brand-query visibility at the 90-day mark) is the signal that matters.
- Any improvement seen should be checked against what else changed in the same window (a CRM outreach contact linking to the site, a new Google Business Profile completion, a Takealot listing going live) before crediting this milestone's technical changes specifically — this project's own discipline (see `SEO_BASELINE_MILESTONE_200.md`) is to separate confirmed fact from plausible-but-unproven causation, and that discipline applies here too.
- If nothing has changed by the 90-day checkpoint, the honest next step is revisiting the Citation Opportunities document, not adding more schema or technical tweaks — the baseline findings in this milestone suggest the current gap is more likely a citation/authority gap than a crawlability gap, since the technical SEO fundamentals (sitemap, structured data, canonical handling) were already largely in place before this milestone even started.
