// Version 7, Milestone 103: smoke-test configuration. Two projects:
//
// - "local" — runs against a local static server serving a freshly
//   built dist/, with the same static-route-generation and 404.html
//   fallback the real deploy pipeline uses (see webServer.command
//   below). Safe for GitHub Actions: no live-site dependency, no
//   secrets, no admin credentials, and (deliberately) no
//   VITE_API_BASE_URL set for the build, so the frontend always falls
//   back to its own built-in static product data (src/js/api/
//   productsApi.js already does this cleanly whenever the API is
//   unreachable) — the suite's own content is then 100% deterministic
//   and never depends on the live backend being up or on real
//   business data. safety.spec.js's PayFast/admin checks are the one
//   deliberate exception — they call the real backend directly
//   because that's the only backend this project has; both calls are
//   read-only/rejected-by-design (see that file's own comments).
//
// - "live" — runs the exact same spec files against the real
//   production site. Manual use only (`npm run test:smoke:live`),
//   never wired into CI. webServer still starts for this project too
//   (Playwright's webServer is configured once, not per-project) —
//   a deliberate simplicity trade-off: the unused local server is
//   otherwise harmless and gets torn down with the process, and
//   avoiding it would need a second config file or an extra
//   dependency (e.g. cross-env) just to set one env var portably
//   across the Windows/Unix shells this project is developed on.
import { defineConfig, devices } from "@playwright/test";

const LOCAL_PORT = 4600;
const LOCAL_BASE_URL = `http://localhost:${LOCAL_PORT}`;
const LIVE_BASE_URL = "https://www.seasonedzgroup.co.za";

// Milestone 183: a second, separate build+server, used ONLY by
// tests/smoke/analyticsEnabled.spec.js. Every other spec file runs
// against the "local" build above, which deliberately never sets
// VITE_GA_MEASUREMENT_ID (same discipline as VITE_API_BASE_URL) so GA4
// stays off there — that build alone already proves the "no ID -> no
// analytics" and "test environment -> no analytics" requirements.
// Testing the OPPOSITE path (ID present + consent granted -> events
// actually fire) needs a build that genuinely has an ID, so this one
// sets an obviously-fake, non-existent Measurement ID — never a real
// Seasonedz property (Part S: "never send fake ecommerce transactions
// to the real GA4 property") — and the spec file itself intercepts
// and blocks the one real network request GA4 would make (loading
// https://www.googletagmanager.com/gtag/js), so no request ever
// actually leaves the test runner either.
const ANALYTICS_TEST_MEASUREMENT_ID = "G-TESTNOTREAL01";
const LOCAL_ANALYTICS_PORT = 4601;
const LOCAL_ANALYTICS_BASE_URL = `http://localhost:${LOCAL_ANALYTICS_PORT}`;

// Milestone 187: same pattern again, a third throwaway build, this
// time with VITE_TURNSTILE_SITE_KEY set — the chat widget stays fully
// hidden without a site key configured (see js/chatbot.js), so only
// this build can exercise it. Uses Cloudflare's own publicly
// documented "always passes, visible" Turnstile TEST sitekey
// (1x00000000000000000000AA) — never a real Seasonedz site key, and
// every test still mocks the actual Cloudflare Worker endpoint
// (**/chat, **/health) via page.route(), so no request ever reaches
// the real deployed Worker or spends real Workers AI allocation.
const CHATBOT_TEST_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
const CHATBOT_TEST_API_URL = "https://chatbot-worker.invalid";
const LOCAL_CHATBOT_PORT = 4602;
const LOCAL_CHATBOT_BASE_URL = `http://localhost:${LOCAL_CHATBOT_PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A little more generous than Playwright's 30s default — right after
  // the local static server (tests/helpers/server.mjs) starts, several
  // workers can hit it with full-page navigations at the same instant,
  // and that single-threaded server occasionally needs a bit longer
  // than 30s to work through the initial queue.
  timeout: 60_000,
  // Playwright's own default per-assertion timeout (5s) is tight for
  // the "live" project's real internet-latency page loads (Render cold
  // starts, real Supabase image fetches) — found this directly: two
  // assertions failed at 5s on first attempt, then passed on retry,
  // which is exactly the kind of result retries alone shouldn't be
  // used to paper over. 10s comfortably covers both projects; local
  // assertions resolve almost instantly regardless.
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "local",
      use: { ...devices["Desktop Chrome"], baseURL: LOCAL_BASE_URL },
      retries: 0,
      // Milestone 183: this build has no Measurement ID, so the
      // "enabled" spec can never pass here — it only runs under the
      // "analytics" project below, against the build that has one.
      // Milestone 187: same reasoning for the chat widget spec — this
      // build has no Turnstile site key, so the widget never renders
      // here.
      testIgnore: [/analyticsEnabled\.spec\.js$/, /chatbot\.spec\.js$/],
    },
    {
      name: "live",
      use: { ...devices["Desktop Chrome"], baseURL: LIVE_BASE_URL },
      // A couple of retries here only — absorbs occasional Render
      // cold-start slowness on the live backend, never masks the
      // "local" project's failures, which must stay deterministic.
      retries: 2,
      testIgnore: [/analyticsEnabled\.spec\.js$/, /chatbot\.spec\.js$/],
    },
    {
      name: "analytics",
      use: { ...devices["Desktop Chrome"], baseURL: LOCAL_ANALYTICS_BASE_URL },
      retries: 0,
      // Only this one spec file needs the fake-Measurement-ID build —
      // every other spec already runs under "local"/"live" above and
      // must never be re-run against this throwaway build too.
      testMatch: /analyticsEnabled\.spec\.js$/,
    },
    {
      name: "chatbot",
      use: { ...devices["Desktop Chrome"], baseURL: LOCAL_CHATBOT_BASE_URL },
      retries: 0,
      testMatch: /chatbot\.spec\.js$/,
    },
  ],
  webServer: [
    {
      // Rebuilds and regenerates static routes/sitemap.xml/404.html
      // itself, exactly like .github/workflows/deploy.yml does — fully
      // self-contained so `npm run test:smoke` works the same whether
      // or not a build already happened earlier in the same CI job.
      // VITE_API_BASE_URL and VITE_GA_MEASUREMENT_ID are deliberately
      // left unset (see file header).
      command:
        "npm run build && node scripts/generate-static-routes.mjs && node -e \"require('fs').copyFileSync('dist/index.html','dist/404.html')\" && node tests/helpers/server.mjs dist " +
        LOCAL_PORT,
      url: `${LOCAL_BASE_URL}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Milestone 183: a second, independent build (own dist-analytics-
      // test/ output directory, own port) with a fake, non-existent
      // Measurement ID baked in — see this file's own header comment
      // on why analyticsEnabled.spec.js alone needs this. Needs the
      // exact same static-route-generation + 404.html-fallback steps
      // as the "local" build above (tests/helpers/server.mjs has no
      // SPA rewrite of its own, matching real GitHub Pages — a direct
      // page.goto() to e.g. /shop or /checkout 404s without a real
      // dist-analytics-test/shop/index.html file to serve), so this
      // spec's own direct navigations to non-root routes actually
      // load the app instead of a bare 404.
      command: `npm run build -- --outDir dist-analytics-test && node scripts/generate-static-routes.mjs dist-analytics-test && node -e "require('fs').copyFileSync('dist-analytics-test/index.html','dist-analytics-test/404.html')" && node tests/helpers/server.mjs dist-analytics-test ${LOCAL_ANALYTICS_PORT}`,
      url: `${LOCAL_ANALYTICS_BASE_URL}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_GA_MEASUREMENT_ID: ANALYTICS_TEST_MEASUREMENT_ID },
    },
    {
      command: `npm run build -- --outDir dist-chatbot-test && node scripts/generate-static-routes.mjs dist-chatbot-test && node -e "require('fs').copyFileSync('dist-chatbot-test/index.html','dist-chatbot-test/404.html')" && node tests/helpers/server.mjs dist-chatbot-test ${LOCAL_CHATBOT_PORT}`,
      url: `${LOCAL_CHATBOT_BASE_URL}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_TURNSTILE_SITE_KEY: CHATBOT_TEST_TURNSTILE_SITE_KEY, VITE_CHATBOT_API_URL: CHATBOT_TEST_API_URL },
    },
  ],
});
