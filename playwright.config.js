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
    },
    {
      name: "live",
      use: { ...devices["Desktop Chrome"], baseURL: LIVE_BASE_URL },
      // A couple of retries here only — absorbs occasional Render
      // cold-start slowness on the live backend, never masks the
      // "local" project's failures, which must stay deterministic.
      retries: 2,
    },
  ],
  webServer: {
    // Rebuilds and regenerates static routes/sitemap.xml/404.html
    // itself, exactly like .github/workflows/deploy.yml does — fully
    // self-contained so `npm run test:smoke` works the same whether
    // or not a build already happened earlier in the same CI job.
    // VITE_API_BASE_URL is deliberately left unset (see file header).
    command:
      "npm run build && node scripts/generate-static-routes.mjs && node -e \"require('fs').copyFileSync('dist/index.html','dist/404.html')\" && node tests/helpers/server.mjs dist " +
      LOCAL_PORT,
    url: `${LOCAL_BASE_URL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
