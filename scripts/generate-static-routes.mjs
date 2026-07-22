// Generates real per-route index.html files in dist/ after `npm run
// build`, so GitHub Pages serves these public routes with a genuine
// HTTP 200 instead of only through the 404.html SPA fallback (Version
// 7, Milestone 88D — Milestone 88C found that every route besides "/"
// returned 404, which risks Google excluding those pages from its
// index regardless of what content would render client-side).
//
// Each generated file is an exact copy of the built dist/index.html —
// the app is still a client-rendered SPA, so the actual page content
// is still assembled by JS on load (window.location.pathname), exactly
// as before. This script only fixes the HTTP status code for these
// routes, nothing about how the app itself renders.
//
// Deliberately an *allowlist*, not a blocklist: only routes explicitly
// listed below (plus real product/blog slugs) ever get a generated
// file, so a private/transactional route (cart, checkout, admin, ...)
// can never end up with a real 200 file by oversight.
//
// Run standalone (not through Vite), so it can't rely on
// import.meta.env — that's also why product/blog slugs are read as
// plain text (regex over the known `slug: "..."` shape) rather than
// importing src/data/products.js or blogPosts.js directly, both of
// which eagerly call js/paths.js's withBase() at module load time
// (Vite-only; undefined under plain Node).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const INDEX_HTML_PATH = join(DIST, "index.html");

// Matches router.js's own list of public, indexable routes (see
// Milestone 88A) — "/" is excluded here since dist/index.html already
// serves it with a native 200.
const PUBLIC_STATIC_ROUTES = [
  "/shop",
  "/categories",
  "/about",
  "/contact",
  "/faq",
  "/shipping-policy",
  "/returns-policy",
  "/privacy-policy",
  "/terms",
  "/cookies-policy",
  "/testimonials",
  "/schools",
  "/wholesale",
  "/distributor",
  "/blog",
];

const PRODUCTS_API_URL = "https://seasonedz-ecommerce.onrender.com/api/products?limit=100";
const PRODUCTS_FALLBACK_FILE = join(ROOT, "src/data/products.js");
const BLOG_POSTS_FILE = join(ROOT, "src/data/blogPosts.js");

function extractSlugs(filePath) {
  const text = readFileSync(filePath, "utf8");
  return [...text.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
}

// Preferred: the live API (same endpoint the storefront itself calls,
// so it already reflects real, currently-public products only).
// Fallback: the local static data file, read as plain text — used
// only if the live API is unreachable during a build.
async function getProductSlugs() {
  try {
    const response = await fetch(PRODUCTS_API_URL);
    if (!response.ok) throw new Error(`API responded with ${response.status}`);
    const json = await response.json();
    const slugs = (json?.data?.products || []).map((p) => p.slug).filter(Boolean);
    if (slugs.length === 0) throw new Error("API returned zero products");
    return { slugs, source: "live API" };
  } catch (error) {
    console.warn(`[generate-static-routes] Live products API unavailable (${error.message}) — falling back to local product data.`);
    return { slugs: extractSlugs(PRODUCTS_FALLBACK_FILE), source: "local fallback data" };
  }
}

// Blog posts have no backend/API — only generated if the local data
// file can be read and parsed safely; otherwise deferred rather than
// risking a broken or empty route.
function getBlogSlugsSafely() {
  try {
    const slugs = extractSlugs(BLOG_POSTS_FILE);
    return slugs.length > 0 ? slugs : null;
  } catch (error) {
    console.warn(`[generate-static-routes] Could not read blog post data safely (${error.message}) — blog route generation deferred.`);
    return null;
  }
}

function writeRouteFile(routePath, html) {
  const targetDir = join(DIST, routePath.replace(/^\//, ""));
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(join(targetDir, "index.html"), html);
}

async function main() {
  if (!existsSync(INDEX_HTML_PATH)) {
    console.error("[generate-static-routes] dist/index.html not found — run `npm run build` first.");
    process.exit(1);
  }
  const shellHtml = readFileSync(INDEX_HTML_PATH, "utf8");

  for (const route of PUBLIC_STATIC_ROUTES) {
    writeRouteFile(route, shellHtml);
  }
  console.log(`[generate-static-routes] Generated ${PUBLIC_STATIC_ROUTES.length} public static route(s).`);

  const { slugs: productSlugs, source } = await getProductSlugs();
  for (const slug of productSlugs) {
    writeRouteFile(`/product/${slug}`, shellHtml);
  }
  console.log(`[generate-static-routes] Generated ${productSlugs.length} product route(s) from ${source}.`);

  const blogSlugs = getBlogSlugsSafely();
  if (blogSlugs) {
    for (const slug of blogSlugs) {
      writeRouteFile(`/blog/${slug}`, shellHtml);
    }
    console.log(`[generate-static-routes] Generated ${blogSlugs.length} blog post route(s).`);
  } else {
    console.log("[generate-static-routes] Blog post route generation deferred — slugs not safely available.");
  }

  const total = PUBLIC_STATIC_ROUTES.length + productSlugs.length + (blogSlugs ? blogSlugs.length : 0);
  console.log(`[generate-static-routes] Done. ${total} static route file(s) written to dist/.`);
}

main();
