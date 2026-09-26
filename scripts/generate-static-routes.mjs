// Generates real per-route index.html files in dist/ after `npm run
// build`, so GitHub Pages serves these public routes with a genuine
// HTTP 200 instead of only through the 404.html SPA fallback (Version
// 7, Milestone 88D — Milestone 88C found that every route besides "/"
// returned 404, which risks Google excluding those pages from its
// index regardless of what content would render client-side).
//
// Each generated file starts as a copy of the built dist/index.html —
// the app is still a client-rendered SPA, so the actual interactive
// page is still assembled by JS on load (window.location.pathname),
// exactly as before. Originally this script only fixed the HTTP
// status code for these routes; it now ALSO rewrites each generated
// file's <title>, meta description, canonical, Open Graph and Twitter
// tags to that route's own real values, and inserts that route's own
// JSON-LD (Product/BreadcrumbList/BlogPosting), so a crawler that
// never executes JavaScript (every social-preview crawler; Google's
// own first, non-rendering crawl pass) sees route-correct signals
// immediately — see the "SEASONEDZ STATIC ROUTE SEO AND SOCIAL
// PREVIEW FIX" diagnostic/implementation report for the full
// reasoning. The homepage's own dist/index.html is never touched by
// any of this — only the per-route COPIES this script writes.
//
// Deliberately an *allowlist*, not a blocklist: only routes explicitly
// listed below (plus real product/blog slugs) ever get a generated
// file, so a private/transactional route (cart, checkout, admin, ...)
// can never end up with a real 200 file by oversight.
//
// Run standalone (not through Vite), so it can't rely on
// import.meta.env — that's also why product/blog slugs (and now
// title/excerpt/image/date for blog posts) are read as plain text
// (regex over the known `slug: "..."` shape, extended below) rather
// than importing src/data/products.js or blogPosts.js directly, both
// of which eagerly call js/paths.js's withBase() at module load time
// (Vite-only; undefined under plain Node). router.js can't be
// imported directly either, for the same reason one level removed —
// it transitively imports every page module, several of which import
// those same files — so static-page title/description are read the
// same way, straight from router.js's own route-table source text
// (see getStaticRouteMeta() below). src/data/categorySeoContent.js has
// no such import anywhere in it, so that one IS imported directly —
// the safest possible form of reuse, guaranteed to never drift from
// what the live site itself shows.
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
import { getCategorySeoContent } from "../src/data/categorySeoContent.js";
import { getProductSeoContent } from "../src/data/productSeoContent.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
// Milestone 183: optional CLI override (`node generate-static-routes.mjs
// <dir>`), used ONLY by playwright.config.js's second, GA4-enabled
// throwaway build (its own separate dist-analytics-test/ output, so it
// never collides with the real dist/ the "local" project and the real
// deploy.yml build both still use by default with no argument).
const DIST = join(ROOT, process.argv[2] || "dist");
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
  "/affiliate-terms",
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
const ROUTER_JS_FILE = join(ROOT, "src/js/router.js");

// The one real brand name, reused everywhere og:site_name / a brand
// field is needed — never re-typed or varied.
const SITE_NAME = "Seasonedz Group";

// Mirrors src/js/seo.js's own DEFAULT_DESCRIPTION constant exactly —
// the same fallback the CLIENT-SIDE app already falls back to for a
// route with no description of its own, so a route missing one here
// (checked against router.js's real route table — see
// getStaticRouteMeta()) shows identically once JS takes over, never a
// second, different, invented value.
const DEFAULT_DESCRIPTION =
  "Educational colouring books, Bible colouring books, mindfulness colouring books, markers and crayons for parents, teachers, schools and churches.";

// The same homepage hero image index.html already uses as its own
// approved og:image/twitter:image — reused as the fallback share image
// for any route with no page-specific image of its own (a static page,
// or a category with neither a representative product nor its own
// stored image). Never a different or invented image.
const DEFAULT_OG_IMAGE = `${SITE_URL}/images/home/seasonedz-group-educational-colouring-books-hero.webp`;

function extractSlugs(filePath) {
  const text = readFileSync(filePath, "utf8");
  return [...text.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
}

// Preferred: the live API (same endpoint the storefront itself calls,
// so it already reflects real, currently-public products only — the
// backend's own public product query never returns a DRAFT product at
// all, see product.service.ts's VISIBLE_STATUSES, so no DRAFT filter
// is needed or possible here: the field isn't even in this response).
// Fallback: the local static data file's slug list only — see this
// file's own header comment on why route-specific METADATA is only
// ever built from live data. A build running on the fallback still
// generates every route file (so the HTTP-status fix from Milestone
// 88D never regresses), just without the richer per-route metadata
// this change adds — the existing, already-safe behaviour, not a new
// one, and never a guessed/invented product fact in its place.
async function getProductsForRoutes() {
  try {
    const response = await fetch(PRODUCTS_API_URL);
    if (!response.ok) throw new Error(`API responded with ${response.status}`);
    const json = await response.json();
    const products = json?.data?.products || [];
    if (products.length === 0) throw new Error("API returned zero products");
    return { products, source: "live API" };
  } catch (error) {
    console.warn(`[generate-static-routes] Live products API unavailable (${error.message}) — falling back to local product data (route files only, no per-route metadata).`);
    return { products: extractSlugs(PRODUCTS_FALLBACK_FILE).map((slug) => ({ slug })), source: "local fallback data" };
  }
}

// Version 7, Milestone 171I: real, path-based /category/:slug pages —
// see src/pages/categoryPage.js's own header comment for why these
// exist. Only categories with at least one real product get a static
// file/sitemap entry here — an empty category page is thin/duplicate-
// looking content with nothing for a visitor or Googlebot to find
// (confirmed live: "Schools and Wholesale" currently has zero
// products), so it's deliberately excluded rather than generating a
// page that would just show "No products found." Now also carries
// `name` and `imageUrl` (still straight from the same one API
// response) — needed for route-specific title/description/og:image.
async function getIndexableCategories() {
  try {
    const response = await fetch(CATEGORIES_API_URL);
    if (!response.ok) throw new Error(`API responded with ${response.status}`);
    const json = await response.json();
    const categories = (json?.data?.categories || []).filter((c) => c.productCount > 0 && c.slug);
    if (categories.length === 0) throw new Error("API returned zero categories with products");
    return { categories, source: "live API" };
  } catch (error) {
    console.warn(`[generate-static-routes] Live categories API unavailable (${error.message}) — falling back to local category/product data (route files only, no per-route metadata).`);
    // Fallback: cross-reference the two local static data files —
    // any category slug that appears as at least one product's own
    // categorySlug has a product, the same rule as the live API's
    // productCount > 0 above.
    const categorySlugs = extractSlugs(CATEGORIES_FALLBACK_FILE);
    const productsText = readFileSync(PRODUCTS_FALLBACK_FILE, "utf8");
    const productCategorySlugs = new Set([...productsText.matchAll(/categorySlug:\s*"([^"]+)"/g)].map((m) => m[1]));
    return { categories: categorySlugs.filter((slug) => productCategorySlugs.has(slug)).map((slug) => ({ slug })), source: "local fallback data" };
  }
}

// Blog posts have no backend/API — read as plain text from the one
// local data file, same discipline as products/categories above (see
// this file's own header comment on why it can't be imported
// directly). Extended from a slug-only extractor to also pull title,
// excerpt, image and date — the fields this file's post objects
// always declare in that exact order (see src/data/blogPosts.js) — so
// route-specific metadata and BlogPosting JSON-LD can be built from
// the SAME real copy blogPost.js itself already shows, never a second,
// separately-maintained copy. Deferred (not failed) if the file can't
// be read/parsed safely, or a post is missing a field this needs —
// matches the existing "blog route generation deferred" safety net,
// now a per-post skip rather than an all-or-nothing one.
function getBlogPostsSafely() {
  try {
    const text = readFileSync(BLOG_POSTS_FILE, "utf8");
    const postPattern = /title:\s*"([^"]*)"[\s\S]*?slug:\s*"([^"]*)"[\s\S]*?excerpt:\s*"([^"]*)"[\s\S]*?image:\s*"([^"]*)"[\s\S]*?date:\s*"([^"]*)"/g;
    const posts = [...text.matchAll(postPattern)].map((m) => ({ title: m[1], slug: m[2], excerpt: m[3], image: m[4], date: m[5] }));
    return posts.length > 0 ? posts : null;
  } catch (error) {
    console.warn(`[generate-static-routes] Could not read blog post data safely (${error.message}) — blog route generation deferred.`);
    return null;
  }
}

// router.js can't be imported directly (see this file's own header
// comment) — its title/description for the handful of PUBLIC_STATIC_ROUTES
// this script generates are instead read straight from its own route-
// table source text, the exact same "read the real source as plain
// text" discipline as extractSlugs() above. Falls back to
// DEFAULT_DESCRIPTION (mirroring js/seo.js's identical constant) only
// when a route genuinely has no description of its own in router.js
// (e.g. "/blog"), exactly matching what the client-side app itself
// would show for that same route — never a different, invented value.
// Throws, rather than returning a guessed title, if the route's own
// entry can't be found at all — Part 14's "fail clearly, never invent"
// rule; a route that hits this has a real bug in this function itself,
// not a data problem this script should paper over.
export function extractRouteMeta(routerSource, routePattern) {
  const patternMarker = `pattern: "${routePattern}"`;
  const startIndex = routerSource.indexOf(patternMarker);
  if (startIndex === -1) return { title: null, description: null };
  const blockEnd = routerSource.indexOf("},", startIndex);
  const block = routerSource.slice(startIndex, blockEnd === -1 ? undefined : blockEnd);
  const titleMatch = block.match(/title:\s*"([^"]*)"/);
  const descriptionMatch = block.match(/description:\s*"([^"]*)"/);
  return {
    title: titleMatch ? titleMatch[1] : null,
    description: descriptionMatch ? descriptionMatch[1] : DEFAULT_DESCRIPTION,
  };
}

function getStaticRouteMeta(routePath) {
  const routerSource = readFileSync(ROUTER_JS_FILE, "utf8");
  const { title, description } = extractRouteMeta(routerSource, routePath);
  if (!title) {
    throw new Error(
      `[generate-static-routes] Could not find a title for route "${routePath}" in router.js's own route table — refusing to generate misleading generic metadata for it. Add/fix that route's entry in src/js/router.js, or remove it from PUBLIC_STATIC_ROUTES here.`
    );
  }
  return { title, description };
}

// ---------------------------------------------------------------------------
// HTML/JSON-LD safety (diagnostic Parts 9-10): every value below comes
// from real product/category/blog/route data, never free-typed HTML —
// still always escaped before insertion, on the same "never trust a
// value just because its source is trusted" discipline this codebase's
// own backend applies to admin/customer input.
// ---------------------------------------------------------------------------

// For a value going inside an HTML attribute (content="...", href="...").
// Order matters: "&" must be escaped first, or the "&amp;"/"&lt;"/etc.
// this function itself writes would immediately be re-escaped.
export function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Prevents a string value from prematurely closing the surrounding
// <script type="application/ld+json"> tag (the standard "</script>"
// breakout) — JSON.stringify alone never escapes "<", so this is
// applied on top of it. Every character in the resulting JSON is still
// valid, parseable JSON; only the raw "<" byte is replaced with its
// unicode escape, which JSON.parse (and every real consumer of this
// data, browsers and crawlers alike) reads back as the identical "<"
// character.
export function safeJsonLdScript(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

// Absolute http(s) URLs (every real product image already is one —
// see the live API sample this milestone's own audit captured) pass
// through unchanged; a root-relative path (blog post images, e.g.
// "/images/product-1.jpg") gets SITE_URL prepended. Mirrors
// js/paths.js's withBase() "absolute URLs pass through unchanged" rule
// exactly, adapted to always return a fully absolute URL — required
// for a valid og:image/JSON-LD image, unlike withBase()'s own
// base-path-relative result.
export function resolveAssetUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

// Mirrors js/seo.js's setPageMeta() own "${title} | Seasonedz Group"
// suffix rule exactly — the same title a JS-executing visitor/crawler
// would see once the client-side app takes over, just present from the
// very first byte here instead of only after JS runs.
function buildTitle(pageTitle) {
  return `${pageTitle} | ${SITE_NAME}`;
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

// Replaces one <meta ...> tag's own content="..." value, identified by
// a unique preceding attribute (e.g. `name="description"` or
// `property="og:title"`) — regardless of whether the tag is written on
// one line or several (see index.html's own multi-line og:description-
// style tags). Every other attribute on the tag, and everything else
// in the document, is left completely untouched. Matches only the
// FIRST occurrence, which is correct here since index.html never
// declares the same meta name/property twice.
function replaceMetaContent(html, identifyingAttr, newContent) {
  const pattern = new RegExp(`(<meta\\s+${identifyingAttr}\\s+content=")[^"]*("\\s*/?>)`, "s");
  if (!pattern.test(html)) {
    throw new Error(`[generate-static-routes] Expected tag matching <meta ${identifyingAttr} content="..."> was not found in the built index.html shell — refusing to silently skip it.`);
  }
  return html.replace(pattern, (_match, prefix, suffix) => `${prefix}${newContent}${suffix}`);
}

// The one function that turns the generic homepage shell into a real
// route's own raw metadata: <title>, meta description, canonical, and
// every Open Graph/Twitter tag Part 2 of the implementation brief
// lists — EXCEPT og:type, og:site_name and twitter:card, which stay
// exactly as index.html already declares them ("website", "Seasonedz
// Group", "summary_large_image") on every route, since none of those
// three actually vary by page (see this milestone's own report for
// why og:type stays "website" even for products, rather than adding
// the "product" og:type namespace this site doesn't otherwise
// declare). Every value is escaped (escapeHtmlAttribute) before
// insertion — see this file's own HTML/JSON-LD safety section above.
// Milestone 190B, Part P: index.html's own hero preload <link> (see
// its own comment there — added in Milestone 149 as a deliberate,
// then-accepted tradeoff: "this SPA has no per-route <head>, so this
// is the one plain, zero-JS way to hint it early regardless of which
// route a visitor lands on first"). writeRouteFile() below is the ONLY
// caller of applyRouteMetadata(), and it is only ever called for a
// non-homepage route — dist/index.html itself (the real homepage file
// Vite built) is never touched by this script at all, so it keeps its
// preload, fetchpriority="high" and all, completely unchanged. Every
// OTHER generated route's own copy of that same shell had been
// carrying this same tag forward unnecessarily; stripped here so e.g.
// a direct /shop or /contact visit never preloads an image it will
// never display.
const HERO_PRELOAD_PATTERN = /\s*<link\s+rel="preload"\s+as="image"\s+href="\/images\/home\/seasonedz-group-educational-colouring-books-hero\.webp"\s+fetchpriority="high"\s*\/>\n?/;

export function applyRouteMetadata(html, { routePath, title, description, ogImage }) {
  const canonicalUrl = `${SITE_URL}${withTrailingSlash(routePath)}`;
  const fullTitle = escapeHtmlAttribute(buildTitle(title));
  const safeDescription = escapeHtmlAttribute(description);
  const safeCanonical = escapeHtmlAttribute(canonicalUrl);
  const safeOgImage = escapeHtmlAttribute(ogImage || DEFAULT_OG_IMAGE);

  let result = html.replace(HERO_PRELOAD_PATTERN, "");
  // Milestone 196: index.html's own Milestone 171G comment (just above
  // the real tag) explains the homepage's title/description handling
  // in prose that itself contains the literal substring "<title>" —
  // a naive /<title>[\s\S]*?<\/title>/ match (no line-start anchor)
  // matched THAT occurrence first, then non-greedily searched forward
  // for the next "</title>", which was the real tag's own closing tag —
  // consuming everything in between (including the comment's closing
  // "-->" and the real tag's own opening "<title>") and leaving every
  // non-homepage generated route's <title> AND <meta name="description">
  // sitting inside one large, never-closed HTML comment: invisible to
  // every browser and crawler reading the raw HTML, even though
  // buildSitemapXml/toProductOutput/etc. all had correct data the whole
  // time. The real tag is always alone on its own line (see index.html);
  // the comment's prose reference never is — anchoring to the start of
  // the line (with the multiline flag) is what distinguishes them.
  result = result.replace(/^[ \t]*<title>[\s\S]*?<\/title>[ \t]*$/m, `    <title>${fullTitle}</title>`);
  result = result.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${safeCanonical}" />`);
  result = replaceMetaContent(result, 'name="description"', safeDescription);
  result = replaceMetaContent(result, 'property="og:title"', fullTitle);
  result = replaceMetaContent(result, 'property="og:description"', safeDescription);
  result = replaceMetaContent(result, 'property="og:url"', safeCanonical);
  result = replaceMetaContent(result, 'property="og:image"', safeOgImage);
  result = replaceMetaContent(result, 'name="twitter:title"', fullTitle);
  result = replaceMetaContent(result, 'name="twitter:description"', safeDescription);
  result = replaceMetaContent(result, 'name="twitter:image"', safeOgImage);
  return result;
}

// The exact id scheme src/js/seo.js's own setPageStructuredData()/
// clearPageStructuredData() use (STRUCTURED_DATA_ID = "page-structured-
// data") — giving each build-time block one of these same ids is what
// makes the client-side app's own clearPageStructuredData() (called on
// EVERY navigation, unconditionally, by router.js — confirmed: it runs
// before ANY page's own render function) correctly remove these
// build-time blocks the instant JS takes over, before that same page's
// own setPageStructuredData() call adds its (possibly different, e.g.
// live-fetched vs static-fallback) real data back. Without this, a
// route with its own client-side structured data call would end up
// with TWO Product/BreadcrumbList blocks in the live DOM — one from
// this script, one from the client — the exact regression this
// milestone's own regression pass caught and this comment documents.
const STRUCTURED_DATA_ID = "page-structured-data";

// Appends one or more JSON-LD <script> blocks immediately before
// </head> — never removing or replacing the two that are already
// there (Organization/WebSite, both site-wide facts that apply to
// every route unchanged and are never touched by clearPageStructuredData()
// either — see this milestone's own report, Part 8). A no-op when a
// route has no structured data of its own to add (every plain static
// page never gets an id-tagged block at all).
export function insertJsonLdBlocks(html, blocks) {
  const realBlocks = (blocks || []).filter(Boolean);
  if (realBlocks.length === 0) return html;
  const scripts = realBlocks
    .map((block, index) => {
      const id = index === 0 ? STRUCTURED_DATA_ID : `${STRUCTURED_DATA_ID}-${index}`;
      return `    <script type="application/ld+json" id="${id}">${safeJsonLdScript(block)}</script>`;
    })
    .join("\n");
  return html.replace("</head>", `${scripts}\n  </head>`);
}

// ---------------------------------------------------------------------------
// Product/Category/Blog JSON-LD builders — deliberately mirror
// src/pages/productDetails.js's buildProductStructuredData()/
// buildBreadcrumbStructuredData() and src/pages/blogPost.js's
// buildBlogPostingStructuredData() field-for-field, so the build-time
// and client-side-rendered structured data for the same page always
// agree. See this milestone's own report for the one deliberate
// improvement over the client-side version: availability now also
// recognises an active preorder (schema.org's own real "PreOrder"
// value), which the client-side function does not yet check.
// ---------------------------------------------------------------------------

export function schemaAvailability(product) {
  if (product.isPreorder) return "https://schema.org/PreOrder";
  // Milestone 188: mirrors productDetails.js's own schemaAvailability()
  // — see that file's comment for why a variable product's
  // product-level stockStatus is meaningless here.
  if (product.hasVariants) {
    const anyVariantInStock = (product.variants || []).some((variant) => variant.stockQuantity > 0);
    return anyVariantInStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  }
  if (product.stockStatus === "Out of Stock") return "https://schema.org/OutOfStock";
  return "https://schema.org/InStock";
}

// Milestone 188: mirrors productDetails.js's own buildOffers() — see
// that file's comment for why AggregateOffer is used instead of a
// single Offer for a variable product.
function buildOffers(product, canonicalUrl) {
  if (product.hasVariants && product.variantPriceRange) {
    return {
      "@type": "AggregateOffer",
      priceCurrency: "ZAR",
      lowPrice: Number(product.variantPriceRange.min).toFixed(2),
      highPrice: Number(product.variantPriceRange.max).toFixed(2),
      offerCount: (product.variants || []).length,
      availability: schemaAvailability(product),
      url: canonicalUrl,
    };
  }
  return {
    "@type": "Offer",
    priceCurrency: "ZAR",
    price: Number(product.price).toFixed(2),
    availability: schemaAvailability(product),
    url: canonicalUrl,
  };
}

// Milestone 188A, Part Y: deliberately never adds `isbn` here (unlike
// productDetails.js's own client-side buildProductStructuredData(),
// which adds it for the SPECIFIC variant a ?variant= deep link
// resolves to) — a static build has no "currently selected variant"
// concept at all, and picking one language edition's ISBN to bake into
// every visitor's first paint (regardless of which URL they actually
// land on) would misrepresent the product. `inLanguage` is never added
// either, on either version — audited against schema.org and confirmed
// invalid on Product (see productDetails.js's own comment).
export function buildProductJsonLd(product, canonicalUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription,
    image: product.image,
    url: canonicalUrl,
    category: product.category?.name,
    brand: { "@type": "Brand", name: SITE_NAME },
    ...(product.sku ? { sku: product.sku, mpn: product.sku } : {}),
    offers: buildOffers(product, canonicalUrl),
    ...(product.reviewCount > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Number(product.ratingAverage).toFixed(2), reviewCount: product.reviewCount } }
      : {}),
  };
}

export function buildBreadcrumbJsonLd(trail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name, item: crumb.url })),
  };
}

function buildProductBreadcrumbTrail(product) {
  return [
    { name: "Home", url: `${SITE_URL}/` },
    { name: product.category?.name, url: `${SITE_URL}/category/${product.category?.slug}/` },
    { name: product.name, url: `${SITE_URL}/product/${product.slug}/` },
  ];
}

function buildCategoryBreadcrumbTrail(category) {
  return [
    { name: "Home", url: `${SITE_URL}/` },
    { name: category.name, url: `${SITE_URL}/category/${category.slug}/` },
  ];
}

// Milestone 196C: CollectionPage + a lightweight, URL-only ItemList —
// deliberately the minimal documented Google pattern for "this page
// lists these other pages" (no nested Product type, no name/price/
// image per item), so this never duplicates or risks disagreeing with
// each product's own full Product JSON-LD on its own page. Built only
// from the products actually shown for this category (never a
// fabricated/complete catalogue), mirrored field-for-field by shop.js's
// own client-side buildCategoryCollectionPageJsonLd() so the static and
// hydrated versions always agree.
//
// `name` deliberately uses the customer-facing display name (the same
// pageTitle override the visible <title>/H1 already use — see
// categorySeoContent.js), NOT the real category.name BreadcrumbList
// intentionally keeps using above — a CollectionPage describes the
// page itself and must match what a visitor/crawler actually sees on
// it (Google's own "structured data must reflect visible content"
// guidance), whereas a breadcrumb trail is signalling site taxonomy,
// a deliberately different, already-established convention this pass
// doesn't change.
export function buildCategoryCollectionPageJsonLd(displayName, canonicalUrl, categoryProducts) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: displayName,
    url: canonicalUrl,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: categoryProducts.map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${SITE_URL}${withTrailingSlash(`/product/${product.slug}`)}`,
      })),
    },
  };
}

export function buildBlogPostingJsonLd(post) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    image: resolveAssetUrl(post.image),
    datePublished: post.date,
    url: `${SITE_URL}/blog/${post.slug}/`,
    author: { "@type": "Organization", name: SITE_NAME },
    publisher: { "@type": "Organization", name: SITE_NAME },
  };
}

function writeRouteFile(routePath, shellHtml, metadata) {
  const targetDir = join(DIST, routePath.replace(/^\//, ""));
  mkdirSync(targetDir, { recursive: true });
  const withMetadata = applyRouteMetadata(shellHtml, { routePath, title: metadata.title, description: metadata.description, ogImage: metadata.ogImage });
  const withStructuredData = insertJsonLdBlocks(withMetadata, metadata.jsonLdBlocks);
  writeFileSync(join(targetDir, "index.html"), withStructuredData);
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
// Milestone 188, Part AP: a variable product still needs its OWN sku
// too — used below as the shared g:item_group_id every one of its
// variant items carries (see buildVariantItemXml()) — plus a genuine
// sku on EVERY one of its active variants, each variant's own g:id.
// Missing either withholds the whole feed, same discipline as a
// missing simple-product sku always has.
export function validateFeedIdentifiers(products) {
  const missingSku = products.filter((product) => !product.sku);
  if (missingSku.length > 0) {
    console.warn(
      `[generate-static-routes] ${missingSku.length} product(s) have no SKU — Merchant Center feed not generated for this build (g:id requires a genuine SKU; see this script's own header comment above buildMerchantFeedXml()).`
    );
    return false;
  }

  const variableProductsWithMissingVariantSku = products.filter(
    (product) => product.hasVariants && Array.isArray(product.variants) && product.variants.some((variant) => !variant.sku)
  );
  if (variableProductsWithMissingVariantSku.length > 0) {
    console.warn(
      `[generate-static-routes] ${variableProductsWithMissingVariantSku.length} variable product(s) have a variant with no SKU — Merchant Center feed not generated for this build (each variant needs its own genuine SKU as its g:id).`
    );
    return false;
  }

  const skus = products.flatMap((product) =>
    product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0
      ? product.variants.map((variant) => variant.sku)
      : [product.sku]
  );
  if (new Set(skus).size !== skus.length) {
    console.warn("[generate-static-routes] duplicate SKUs found across products — Merchant Center feed not generated for this build.");
    return false;
  }
  return true;
}

function buildItemXml(product) {
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
}

// Milestone 188, Part AP: per Google's own current documented guidance
// (support.google.com/merchants/answer/6324507 — "item group ID"),
// each variant needs its own g:id/link/price/availability, all sharing
// one g:item_group_id. Google explicitly requires each variant's link
// to be a genuinely distinct URL "using a different path segment
// and/or query parameters" when there's no separate per-variant page —
// this project's storefront deliberately has only ONE canonical URL
// per product (no per-variant pages/routes exist or are added by this
// milestone), so a `?variant=<id>` query parameter on that same
// canonical page is used here, exactly the pattern Google's own
// documentation names as valid in that situation. productDetails.js
// reads that parameter to preselect the matching variant on load.
// Never emitted for a variable product with zero active variants yet
// (nothing purchasable to list) — falls through to no items for that
// product, not a broken/empty listing.
// Milestone 188A, Part AA: verified against Google's own Merchant
// Center documentation before implementing — there is no separate
// "isbn" feed attribute; a book's ISBN-13 is submitted via the
// standard `gtin` attribute (support.google.com/merchants/answer/6324461:
// "Use the ISBN-13 of a book as the value for the GTIN attribute"), and
// when a product genuinely has two distinct GTIN-type identifiers,
// Google's own documented pattern is to submit `gtin` twice, once per
// value ("For a product that has a UPC and an ISBN-13, submit the
// GTIN attribute twice"). variant.gtin (a real physical barcode) and
// variant.isbn are deliberately separate fields (Part G: "do not
// assume every barcode equals ISBN") — when both exist and differ,
// both are submitted; when they're the same value, only one is
// emitted (never a pointless exact duplicate tag).
function buildVariantIdentifierFields(variant) {
  const gtinValues = [variant.gtin, variant.isbn].filter((value, index, all) => value && all.indexOf(value) === index);
  if (gtinValues.length > 0) {
    return gtinValues.map((value) => `    <g:gtin>${escapeXml(value)}</g:gtin>`);
  }
  // Same "reuse the genuine, stable SKU as mpn" convention
  // buildIdentifierFields() already uses for a simple product with no
  // gtin of its own.
  return [`    <g:mpn>${escapeXml(variant.sku)}</g:mpn>`];
}

function buildVariantItemXml(product, variant) {
  const availability = variant.stockQuantity > 0 ? "in stock" : "out of stock";
  const link = `${SITE_URL}/product/${product.slug}/?variant=${encodeURIComponent(variant.id)}`;
  const priceValue = Number(variant.price).toFixed(2);
  const optionLabel = Object.values(variant.optionValues || {}).join(" / ");
  const title = optionLabel ? `${product.name} - ${optionLabel}` : product.name;

  return [
    "  <item>",
    `    <g:id>${escapeXml(variant.sku)}</g:id>`,
    `    <title>${escapeXml(title)}</title>`,
    `    <description>${escapeXml(product.shortDescription || product.name)}</description>`,
    `    <link>${escapeXml(link)}</link>`,
    `    <g:image_link>${escapeXml(variant.imageUrl || product.image)}</g:image_link>`,
    `    <g:availability>${availability}</g:availability>`,
    `    <g:price>${priceValue} ZAR</g:price>`,
    "    <g:brand>Seasonedz Group</g:brand>",
    "    <g:condition>new</g:condition>",
    product.category?.name ? `    <g:product_type>${escapeXml(product.category.name)}</g:product_type>` : "",
    `    <g:item_group_id>${escapeXml(product.sku)}</g:item_group_id>`,
    ...buildVariantIdentifierFields(variant),
  ]
    .filter(Boolean)
    .join("\n") + "\n  </item>";
}

export function buildMerchantFeedXml(products) {
  const items = products
    .flatMap((product) => {
      if (product.hasVariants) {
        const activeVariants = Array.isArray(product.variants) ? product.variants : [];
        return activeVariants.map((variant) => buildVariantItemXml(product, variant));
      }
      return [buildItemXml(product)];
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

// True only for a product/category object that actually came from the
// live API (see getProductsForRoutes()/getIndexableCategories() —
// the local-fallback path returns bare { slug } objects with nothing
// else). Route-specific metadata/structured data is only ever built
// from these real, complete objects — Part 14's "never invent Product
// information simply to make the build succeed": a fallback-sourced
// route still gets its file (so the HTTP-200 fix from Milestone 88D
// never regresses), just with the same generic-but-honest metadata it
// would have had before this change, never a guessed name/price/image.
function isEnrichedProduct(product) {
  return typeof product.name === "string" && typeof product.shortDescription === "string";
}

function isEnrichedCategory(category) {
  return typeof category.name === "string";
}

function findRepresentativeImage(categorySlug, products) {
  const match = products.find((product) => product.category?.slug === categorySlug && product.image);
  return match ? match.image : null;
}

async function main() {
  if (!existsSync(INDEX_HTML_PATH)) {
    console.error("[generate-static-routes] dist/index.html not found — run `npm run build` first.");
    process.exit(1);
  }
  const shellHtml = readFileSync(INDEX_HTML_PATH, "utf8");

  for (const route of PUBLIC_STATIC_ROUTES) {
    const { title, description } = getStaticRouteMeta(route);
    writeRouteFile(route, shellHtml, { title, description, ogImage: DEFAULT_OG_IMAGE, jsonLdBlocks: [] });
  }
  console.log(`[generate-static-routes] Generated ${PUBLIC_STATIC_ROUTES.length} public static route(s) with route-specific metadata.`);

  const { products, source } = await getProductsForRoutes();
  for (const product of products) {
    const routePath = `/product/${product.slug}`;
    if (isEnrichedProduct(product)) {
      const canonicalUrl = `${SITE_URL}${withTrailingSlash(routePath)}`;
      // Milestone 196B, Part 3: mirrors productDetails.js's own
      // pageTitle resolution exactly — title-only, so the raw pre-JS
      // <title> a crawler sees first always agrees with what the
      // client-side render sets once JS runs. buildProductJsonLd()
      // below is untouched and still reads product.name directly, so
      // this override never reaches structured data.
      const seoContent = getProductSeoContent(product.slug);
      const pageTitle = seoContent?.pageTitle || product.name;
      const jsonLdBlocks = [buildProductJsonLd(product, canonicalUrl), buildBreadcrumbJsonLd(buildProductBreadcrumbTrail(product))];
      writeRouteFile(routePath, shellHtml, { title: pageTitle, description: product.shortDescription, ogImage: product.image, jsonLdBlocks });
    } else {
      // Local-fallback build: file still generated (HTTP 200 fix
      // preserved), generic metadata only — see isEnrichedProduct().
      writeRouteFile(routePath, shellHtml, { title: "Product", description: DEFAULT_DESCRIPTION, ogImage: DEFAULT_OG_IMAGE, jsonLdBlocks: [] });
    }
  }
  console.log(`[generate-static-routes] Generated ${products.length} product route(s) from ${source}${source === "live API" ? " with route-specific metadata and JSON-LD" : ""}.`);

  const { categories, source: categorySource } = await getIndexableCategories();
  for (const category of categories) {
    const routePath = `/category/${category.slug}`;
    if (isEnrichedCategory(category)) {
      const canonicalUrl = `${SITE_URL}${withTrailingSlash(routePath)}`;
      const seoContent = getCategorySeoContent(category.slug);
      const description = seoContent ? seoContent.metaDescription : category.description || DEFAULT_DESCRIPTION;
      const ogImage = findRepresentativeImage(category.slug, products) || (category.imageUrl ? resolveAssetUrl(category.imageUrl) : DEFAULT_OG_IMAGE);
      // Milestone 196: mirrors shop.js's own displayName logic exactly
      // (an optional per-category pageTitle override, currently only
      // "bundles" — see categorySeoContent.js's own comment) — this is
      // the raw, pre-JS <title> a crawler sees first, so it must agree
      // with what the client-side render sets once JS runs, or this
      // page would carry two different titles depending on whether a
      // visitor's browser executed JS yet. The BreadcrumbList JSON-LD
      // below deliberately still uses the real category.name, unchanged
      // — structured data is out of scope for this pass.
      const categoryDisplayName = seoContent?.pageTitle || category.name;
      const categoryProducts = products.filter((product) => product.category?.slug === category.slug);
      const jsonLdBlocks = [
        buildBreadcrumbJsonLd(buildCategoryBreadcrumbTrail({ name: category.name, slug: category.slug })),
        buildCategoryCollectionPageJsonLd(categoryDisplayName, canonicalUrl, categoryProducts),
      ];
      writeRouteFile(routePath, shellHtml, { title: categoryDisplayName, description, ogImage, jsonLdBlocks });
    } else {
      writeRouteFile(routePath, shellHtml, { title: "Category", description: DEFAULT_DESCRIPTION, ogImage: DEFAULT_OG_IMAGE, jsonLdBlocks: [] });
    }
  }
  console.log(`[generate-static-routes] Generated ${categories.length} category route(s) from ${categorySource}${categorySource === "live API" ? " with route-specific metadata and Breadcrumb JSON-LD" : ""}.`);

  const blogPosts = getBlogPostsSafely();
  if (blogPosts) {
    for (const post of blogPosts) {
      const canonicalUrl = `${SITE_URL}${withTrailingSlash(`/blog/${post.slug}`)}`;
      writeRouteFile(`/blog/${post.slug}`, shellHtml, {
        title: post.title,
        description: post.excerpt,
        ogImage: resolveAssetUrl(post.image),
        jsonLdBlocks: [buildBlogPostingJsonLd({ ...post, url: canonicalUrl })],
      });
    }
    console.log(`[generate-static-routes] Generated ${blogPosts.length} blog post route(s) with route-specific metadata and BlogPosting JSON-LD.`);
  } else {
    console.log("[generate-static-routes] Blog post route generation deferred — post data not safely available.");
  }

  const productSlugs = products.map((p) => p.slug);
  const categorySlugs = categories.map((c) => c.slug);
  const blogSlugs = blogPosts ? blogPosts.map((p) => p.slug) : [];

  const total = PUBLIC_STATIC_ROUTES.length + productSlugs.length + categorySlugs.length + blogSlugs.length;
  console.log(`[generate-static-routes] Done. ${total} static route file(s) written to dist/.`);

  const sitemapPaths = [
    "/",
    ...PUBLIC_STATIC_ROUTES,
    ...categorySlugs.map((slug) => `/category/${slug}`),
    ...productSlugs.map((slug) => `/product/${slug}`),
    ...blogSlugs.map((slug) => `/blog/${slug}`),
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
