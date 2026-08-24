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
//
// Version 7, Milestone 89: also writes dist/sitemap.xml, listing the
// exact same allowlisted routes plus real product/blog slugs — kept
// in this same script (rather than a separate one) so there is only
// one place that fetches product/blog data and only one definition of
// "which routes are public," instead of two lists that could drift
// apart over time.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  "/schools",
  "/wholesale",
  "/distributor",
  "/blog",
];

const SITE_URL = "https://www.seasonedzgroup.co.za";
// Version 7, Milestone 171D: updated from the old seasonedz-ecommerce.
// onrender.com host (still valid — Render never retires its default
// subdomain — but stale since Milestone 133 moved the live API to its
// own same-site custom domain) to the current canonical API host, for
// consistency with every other reference to the API in this repo.
const PRODUCTS_API_URL = "https://api.seasonedzgroup.co.za/api/products?limit=100";
const CATEGORIES_API_URL = "https://api.seasonedzgroup.co.za/api/categories";
const PRODUCTS_FALLBACK_FILE = join(ROOT, "src/data/products.js");
const CATEGORIES_FALLBACK_FILE = join(ROOT, "src/data/categories.js");
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

// Version 7, Milestone 171I: real, path-based /category/:slug pages —
// see src/pages/categoryPage.js's own header comment for why these
// exist. Only categories with at least one real product get a static
// file/sitemap entry here — an empty category page is thin/duplicate-
// looking content with nothing for a visitor or Googlebot to find
// (confirmed live: "Schools and Wholesale" currently has zero
// products), so it's deliberately excluded rather than generating a
// page that would just show "No products found."
async function getIndexableCategorySlugs() {
  try {
    const response = await fetch(CATEGORIES_API_URL);
    if (!response.ok) throw new Error(`API responded with ${response.status}`);
    const json = await response.json();
    const slugs = (json?.data?.categories || []).filter((c) => c.productCount > 0).map((c) => c.slug).filter(Boolean);
    if (slugs.length === 0) throw new Error("API returned zero categories with products");
    return { slugs, source: "live API" };
  } catch (error) {
    console.warn(`[generate-static-routes] Live categories API unavailable (${error.message}) — falling back to local category/product data.`);
    // Fallback: cross-reference the two local static data files —
    // any category slug that appears as at least one product's own
    // categorySlug has a product, the same rule as the live API's
    // productCount > 0 above.
    const categorySlugs = extractSlugs(CATEGORIES_FALLBACK_FILE);
    const productsText = readFileSync(PRODUCTS_FALLBACK_FILE, "utf8");
    const productCategorySlugs = new Set([...productsText.matchAll(/categorySlug:\s*"([^"]+)"/g)].map((m) => m[1]));
    return { slugs: categorySlugs.filter((slug) => productCategorySlugs.has(slug)), source: "local fallback data" };
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

// Shared by the per-route canonical rewrite below and buildSitemapXml
// — GitHub Pages redirects a bare generated route like /shop to
// /shop/ (see router.js's own comment on this), so /shop/ is the
// final, redirect-free URL both the sitemap and canonical tags should
// use. Mirrors js/seo.js's buildCanonicalUrl(), which applies the same
// rule client-side after JS runs.
function withTrailingSlash(path) {
  return path === "/" || path.endsWith("/") ? path : `${path}/`;
}

// Version 7, Milestone 99 Follow-Up: each generated file starts as a
// byte-for-byte copy of dist/index.html, which still carries the
// homepage's own static canonical tag baked in at build time — left
// alone, every generated route's raw HTML would claim to be the
// homepage until client-side JS corrects it (js/seo.js), which search
// engine crawlers that don't execute JS would never see happen. This
// rewrites that one tag to the route's real canonical before the file
// is ever written, so the raw HTML is correct from the start —
// js/seo.js's own per-navigation update still runs identically on top
// of this for the client-rendered SPA experience.
function withRouteCanonical(html, routePath) {
  const canonicalUrl = `${SITE_URL}${withTrailingSlash(routePath)}`;
  return html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${canonicalUrl}" />`);
}

function writeRouteFile(routePath, html) {
  const targetDir = join(DIST, routePath.replace(/^\//, ""));
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(join(targetDir, "index.html"), withRouteCanonical(html, routePath));
}

// No <lastmod>/<changefreq>/<priority> — this project has no reliable
// per-page last-modified data, and fabricating one would be worse
// than omitting it; Google explicitly treats changefreq/priority as
// hints it mostly ignores anyway, so a plain <loc>-only sitemap loses
// nothing that matters.
//
// Version 7, Milestone 99: each <loc> gets the same trailing slash
// treatment as the per-route canonical above.
function buildSitemapXml(urlPaths) {
  const urlEntries = urlPaths.map((path) => `  <url><loc>${SITE_URL}${withTrailingSlash(path)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>\n`;
}

// Version 7, Milestone 171I: Google Merchant Center product feed —
// standard RSS 2.0 + the "g:" Google Shopping namespace, the plain,
// well-documented feed format Merchant Center's "Scheduled fetch" can
// pull directly from a URL, deliberately chosen over building a custom
// API integration (the milestone brief's own "do not create a
// complicated API integration unless necessary"). Written to dist/ as
// a build artifact alongside sitemap.xml — no new runtime dependency,
// no third-party feed library.
//
// Only ever built from the LIVE product API, never the static fallback
// data — a Merchant Center feed makes real availability/price claims
// to Google, so it must reflect the actual current catalogue or not be
// generated at all for that build (see getProductsForFeed() below).
//
// Deliberately does NOT include g:mpn/g:gtin as invented values —
// Seasonedz's own SKU (when the admin has set one) is used as the mpn,
// since Seasonedz is itself the manufacturer of these products (a
// small business's own SKU is a legitimate MPN in exactly this
// situation, not a fabricated identifier) and identifier_exists is set
// to "no" only when no SKU exists, per Google's own documented support
// for genuinely identifier-less small-business listings — never a
// made-up GTIN/ISBN. g:google_product_category is deliberately omitted
// — Google's own taxonomy IDs aren't something to guess at without the
// real reference list to hand; product_type (Seasonedz's own real
// category name) is a safe, accurate substitute Google also supports.
//
// Version 7, Milestone 171I.1: identifier priority is GTIN (a genuine
// ISBN-13, for a book, or a real GS1 barcode for anything else) first,
// then MPN (the Seasonedz-assigned SKU), then identifier_exists=no —
// matching Google's own required hierarchy: a real GTIN, when the
// product genuinely has one, must always be submitted; brand+MPN is
// only the correct fallback when no GTIN exists; identifier_exists=no
// is only correct when neither is available. `product.gtin` is read
// here defensively (an optional field, forward-ready for whenever a
// real identifier is captured in the authoritative product data — see
// this milestone's own audit for why none exists there today) — it is
// never fabricated, and this file never invents one. As of this
// milestone, the live product API returns no such field for any
// product, so this path is dormant (proven by the tests in
// merchantFeed.test.mjs) until real ISBN/GTIN data is added to the
// authoritative Product record.
//
// Version 7, Milestone 171I.2: g:id is Seasonedz's own SKU, not the
// product slug. Google rejects any g:id over 50 characters, and three
// of the eleven live products (long, SEO-friendly slugs) were already
// past that limit — Merchant Center flagged them the day the feed was
// first connected. The SKU is short, human-readable and already the
// identifier this file trusts elsewhere as g:mpn, so it also serves as
// the stable Merchant Center id now. The product URL in <link> still
// uses the slug, unchanged — only g:id moved. validateFeedIdentifiers()
// below refuses to build the feed at all if any product is ever missing
// a SKU or two products share one, rather than emit a broken id.
export function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Strips only cosmetic separators (hyphens/spaces) — the digits
// themselves are never altered, generated, or guessed. A real ISBN-13
// is commonly entered/stored with hyphens (e.g. "978-0-123456-78-9");
// Google's GTIN field wants digits only.
function normalizeGtin(rawGtin) {
  return String(rawGtin).replace(/[\s-]/g, "");
}

function buildIdentifierFields(product) {
  // Priority per Google's own required hierarchy — a genuine GTIN
  // (e.g. a real ISBN-13 for a book) always wins when the authoritative
  // product data actually has one; MPN (Seasonedz's own SKU, since
  // Seasonedz is the manufacturer/publisher) is the correct fallback
  // when it doesn't; identifier_exists=no only when neither exists.
  // Never both gtin and identifier_exists=no on the same item, and
  // never mpn alongside identifier_exists=no either — brand+mpn is
  // itself already a valid identifier combination.
  if (product.gtin) {
    return [`    <g:gtin>${escapeXml(normalizeGtin(product.gtin))}</g:gtin>`];
  }
  if (product.sku) {
    return [`    <g:mpn>${escapeXml(product.sku)}</g:mpn>`];
  }
  return ["    <g:identifier_exists>no</g:identifier_exists>"];
}

// Version 7, Milestone 171I.2: g:id must be a real, stable identifier —
// never invented. If any product is missing a SKU, or two products
// share one, the whole feed is withheld for this build (same discipline
// as getProductsForFeed()'s own live-API-only rule above) rather than
// publish a broken or duplicate id to Google.
export function validateFeedIdentifiers(products) {
  const missingSku = products.filter((product) => !product.sku);
  if (missingSku.length > 0) {
    console.warn(
      `[generate-static-routes] ${missingSku.length} product(s) have no SKU — Merchant Center feed not generated for this build (g:id requires a genuine SKU; see this script's own header comment above buildMerchantFeedXml()).`
    );
    return false;
  }
  const skus = products.map((product) => product.sku);
  if (new Set(skus).size !== skus.length) {
    console.warn("[generate-static-routes] duplicate SKUs found across products — Merchant Center feed not generated for this build.");
    return false;
  }
  return true;
}

export function buildMerchantFeedXml(products) {
  const items = products
    .map((product) => {
      const availability = product.stockStatus === "Out of Stock" ? "out of stock" : "in stock";
      const link = `${SITE_URL}/product/${product.slug}/`;
      const priceValue = Number(product.price).toFixed(2);

      return [
        "  <item>",
        `    <g:id>${escapeXml(product.sku)}</g:id>`,
        `    <title>${escapeXml(product.name)}</title>`,
        `    <description>${escapeXml(product.shortDescription || product.name)}</description>`,
        `    <link>${escapeXml(link)}</link>`,
        `    <g:image_link>${escapeXml(product.image)}</g:image_link>`,
        `    <g:availability>${availability}</g:availability>`,
        `    <g:price>${priceValue} ZAR</g:price>`,
        "    <g:brand>Seasonedz Group</g:brand>",
        "    <g:condition>new</g:condition>",
        product.category?.name ? `    <g:product_type>${escapeXml(product.category.name)}</g:product_type>` : "",
        ...buildIdentifierFields(product),
      ]
        .filter(Boolean)
        .join("\n") + "\n  </item>";
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>Seasonedz Group Products</title>
  <link>${SITE_URL}/</link>
  <description>Seasonedz Group product feed for Google Merchant Center free listings.</description>
${items}
</channel>
</rss>
`;
}

// Live-API-only, on purpose — see this function's own header comment
// above buildMerchantFeedXml(). An unreachable API means no feed file
// is written for this build at all, rather than one built from
// possibly-stale local fallback data making real price/availability
// claims to Google.
async function getProductsForFeed() {
  try {
    const response = await fetch(PRODUCTS_API_URL);
    if (!response.ok) throw new Error(`API responded with ${response.status}`);
    const json = await response.json();
    const products = json?.data?.products || [];
    if (products.length === 0) throw new Error("API returned zero products");
    if (!validateFeedIdentifiers(products)) return null;
    return products;
  } catch (error) {
    console.warn(`[generate-static-routes] Live products API unavailable (${error.message}) — Merchant Center feed not generated for this build.`);
    return null;
  }
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

  const { slugs: categorySlugs, source: categorySource } = await getIndexableCategorySlugs();
  for (const slug of categorySlugs) {
    writeRouteFile(`/category/${slug}`, shellHtml);
  }
  console.log(`[generate-static-routes] Generated ${categorySlugs.length} category route(s) from ${categorySource}.`);

  const blogSlugs = getBlogSlugsSafely();
  if (blogSlugs) {
    for (const slug of blogSlugs) {
      writeRouteFile(`/blog/${slug}`, shellHtml);
    }
    console.log(`[generate-static-routes] Generated ${blogSlugs.length} blog post route(s).`);
  } else {
    console.log("[generate-static-routes] Blog post route generation deferred — slugs not safely available.");
  }

  const total = PUBLIC_STATIC_ROUTES.length + productSlugs.length + categorySlugs.length + (blogSlugs ? blogSlugs.length : 0);
  console.log(`[generate-static-routes] Done. ${total} static route file(s) written to dist/.`);

  const sitemapPaths = [
    "/",
    ...PUBLIC_STATIC_ROUTES,
    ...categorySlugs.map((slug) => `/category/${slug}`),
    ...productSlugs.map((slug) => `/product/${slug}`),
    ...(blogSlugs ? blogSlugs.map((slug) => `/blog/${slug}`) : []),
  ];
  writeFileSync(join(DIST, "sitemap.xml"), buildSitemapXml(sitemapPaths));
  console.log(`[generate-static-routes] Generated sitemap.xml with ${sitemapPaths.length} URL(s).`);

  const feedProducts = await getProductsForFeed();
  if (feedProducts) {
    writeFileSync(join(DIST, "google-merchant-feed.xml"), buildMerchantFeedXml(feedProducts));
    console.log(`[generate-static-routes] Generated google-merchant-feed.xml with ${feedProducts.length} product(s).`);
  }
}

// Version 7, Milestone 171I.1: only runs when this file is executed
// directly as a script (`node scripts/generate-static-routes.mjs`),
// never as a side effect of importing its pure functions elsewhere —
// see merchantFeed.test.mjs, which imports buildMerchantFeedXml()/
// escapeXml() for unit testing and must never trigger a real build/
// live-API-fetch/dist/ write just by doing so. pathToFileURL() (not a
// hand-built "file://" string) handles Windows drive-letter paths
// correctly — a naive string comparison silently never matches there.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
