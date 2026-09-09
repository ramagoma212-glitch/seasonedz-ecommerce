// SEO/social preview fix (Option B from the approved rendering
// diagnostic): unit tests for the pure metadata/JSON-LD building
// functions generate-static-routes.mjs now uses to give every
// generated per-route HTML file its own real title, description,
// canonical, Open Graph, Twitter and structured data — instead of the
// generic homepage shell every route previously served raw. Same
// discipline as merchantFeed.test.mjs: pure functions only, no network,
// no live API, run via `npm run test:feed` (node:test over
// scripts/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtmlAttribute,
  safeJsonLdScript,
  resolveAssetUrl,
  applyRouteMetadata,
  insertJsonLdBlocks,
  schemaAvailability,
  buildProductJsonLd,
  buildBreadcrumbJsonLd,
  buildBlogPostingJsonLd,
  extractRouteMeta,
} from "./generate-static-routes.mjs";

// A minimal but structurally real shell — same shape as the actual
// built dist/index.html this script always starts from (one <title>,
// one canonical, one of each og:*/twitter:* tag, and the two site-wide
// JSON-LD blocks that must never be disturbed).
const SHELL_HTML = `<!DOCTYPE html>
<html lang="en-ZA">
  <head>
    <title>Seasonedz Group | Colouring Books &amp; Creative Products</title>
    <meta
      name="description"
      content="Shop educational, Bible and mindfulness colouring books, markers, crayons and creative products for kids, families, schools and churches in South Africa."
    />
    <link rel="canonical" href="https://www.seasonedzgroup.co.za/" />
    <meta property="og:site_name" content="Seasonedz Group" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Seasonedz Group | Colouring Books &amp; Creative Products" />
    <meta
      property="og:description"
      content="Shop educational, Bible and mindfulness colouring books, markers, crayons and creative products for kids, families, schools and churches in South Africa."
    />
    <meta property="og:url" content="https://www.seasonedzgroup.co.za/" />
    <meta property="og:image" content="https://www.seasonedzgroup.co.za/images/home/seasonedz-group-educational-colouring-books-hero.webp" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Seasonedz Group | Colouring Books &amp; Creative Products" />
    <meta
      name="twitter:description"
      content="Shop educational, Bible and mindfulness colouring books, markers, crayons and creative products for kids, families, schools and churches in South Africa."
    />
    <meta name="twitter:image" content="https://www.seasonedzgroup.co.za/images/home/seasonedz-group-educational-colouring-books-hero.webp" />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Seasonedz Group"}</script>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Seasonedz Group"}</script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
`;

// ---------------------------------------------------------------------------
// HTML/JSON-LD escaping safety
// ---------------------------------------------------------------------------

test("escapeHtmlAttribute escapes every reserved HTML attribute character correctly, in the correct order", () => {
  assert.equal(escapeHtmlAttribute(`& < > "`), "&amp; &lt; &gt; &quot;");
});

test("escapeHtmlAttribute never double-escapes an already-encoded ampersand", () => {
  // "&" must be escaped first, or escapeHtmlAttribute's own output
  // would be mangled on a second pass.
  assert.equal(escapeHtmlAttribute("Kids & Fun"), "Kids &amp; Fun");
});

test("safeJsonLdScript neutralises a literal </script> sequence, without corrupting the JSON", () => {
  const script = safeJsonLdScript({ name: 'Evil</script><script>alert(1)</script>' });
  assert.ok(!script.includes("</script>"), "raw </script> must never appear in the emitted JSON-LD");
  const parsed = JSON.parse(script.replace(/\\u003c/g, "<"));
  assert.equal(parsed.name, 'Evil</script><script>alert(1)</script>');
});

test("safeJsonLdScript output is always valid, parseable JSON for ordinary data", () => {
  const data = { "@type": "Product", name: "ABC Colouring Book", price: "100.00" };
  const script = safeJsonLdScript(data);
  assert.deepEqual(JSON.parse(script), data);
});

test("resolveAssetUrl passes an absolute http(s) URL through unchanged", () => {
  const url = "https://example.supabase.co/storage/product.png";
  assert.equal(resolveAssetUrl(url), url);
});

test("resolveAssetUrl makes a root-relative path absolute against the real production domain", () => {
  assert.equal(resolveAssetUrl("/images/product-1.jpg"), "https://www.seasonedzgroup.co.za/images/product-1.jpg");
});

// ---------------------------------------------------------------------------
// applyRouteMetadata — title, description, canonical, OG, Twitter
// ---------------------------------------------------------------------------

test("applyRouteMetadata sets a unique title, description and canonical for a category-shaped route", () => {
  const html = applyRouteMetadata(SHELL_HTML, {
    routePath: "/category/bible-colouring-books",
    title: "Bible Colouring Books",
    description: "Christian colouring books for kids, ages 6 to 10.",
  });
  assert.match(html, /<title>Bible Colouring Books \| Seasonedz Group<\/title>/);
  assert.match(html, /<meta\s+name="description"\s+content="Christian colouring books for kids, ages 6 to 10\."\s*\/>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.seasonedzgroup\.co\.za\/category\/bible-colouring-books\/" \/>/);
});

test("applyRouteMetadata sets og:title, og:description, og:url and og:image to the route's own values", () => {
  const html = applyRouteMetadata(SHELL_HTML, {
    routePath: "/product/abc-colouring-book",
    title: "ABC Colouring Book for Kids",
    description: "A fun alphabet colouring book.",
    ogImage: "https://example.supabase.co/storage/abc.png",
  });
  assert.match(html, /<meta property="og:title" content="ABC Colouring Book for Kids \| Seasonedz Group" \/>/);
  assert.match(html, /property="og:description"\s+content="A fun alphabet colouring book\."/);
  assert.match(html, /<meta property="og:url" content="https:\/\/www\.seasonedzgroup\.co\.za\/product\/abc-colouring-book\/" \/>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/example\.supabase\.co\/storage\/abc\.png" \/>/);
});

test("applyRouteMetadata sets Twitter title, description and image to the same route-specific values", () => {
  const html = applyRouteMetadata(SHELL_HTML, {
    routePath: "/product/abc-colouring-book",
    title: "ABC Colouring Book for Kids",
    description: "A fun alphabet colouring book.",
    ogImage: "https://example.supabase.co/storage/abc.png",
  });
  assert.match(html, /<meta name="twitter:title" content="ABC Colouring Book for Kids \| Seasonedz Group" \/>/);
  assert.match(html, /name="twitter:description"\s+content="A fun alphabet colouring book\."/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/example\.supabase\.co\/storage\/abc\.png" \/>/);
});

test("applyRouteMetadata falls back to the default homepage share image when no route-specific image is given", () => {
  const html = applyRouteMetadata(SHELL_HTML, { routePath: "/about", title: "About Seasonedz Group", description: "About us." });
  assert.match(html, /<meta property="og:image" content="https:\/\/www\.seasonedzgroup\.co\.za\/images\/home\/seasonedz-group-educational-colouring-books-hero\.webp" \/>/);
});

test("applyRouteMetadata never touches og:type, og:site_name or twitter:card — they stay the shell's own values", () => {
  const html = applyRouteMetadata(SHELL_HTML, { routePath: "/product/x", title: "X", description: "Y" });
  assert.match(html, /<meta property="og:type" content="website" \/>/);
  assert.match(html, /<meta property="og:site_name" content="Seasonedz Group" \/>/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
});

test("applyRouteMetadata escapes HTML-unsafe characters in a title/description before insertion, producing well-formed tags", () => {
  const html = applyRouteMetadata(SHELL_HTML, {
    routePath: "/product/kids-fun-book",
    title: 'Kids & "Fun" Book <Special>',
    description: 'A book with & and "quotes".',
  });
  assert.match(html, /<title>Kids &amp; &quot;Fun&quot; Book &lt;Special&gt; \| Seasonedz Group<\/title>/);
  assert.doesNotMatch(html, /<title>Kids & "Fun"/);
  assert.match(html, /content="A book with &amp; and &quot;quotes&quot;\."/);
});

test("applyRouteMetadata produces exactly one title, one canonical, one og:title and one twitter:title — no duplicate competing tags", () => {
  const html = applyRouteMetadata(SHELL_HTML, { routePath: "/shop", title: "Shop", description: "Browse everything." });
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.equal((html.match(/<link rel="canonical"/g) || []).length, 1);
  assert.equal((html.match(/property="og:title"/g) || []).length, 1);
  assert.equal((html.match(/name="twitter:title"/g) || []).length, 1);
});

test("applyRouteMetadata leaves the homepage's Organization and WebSite JSON-LD blocks completely untouched", () => {
  const html = applyRouteMetadata(SHELL_HTML, { routePath: "/shop", title: "Shop", description: "Browse everything." });
  assert.match(html, /"@type":"Organization"/);
  assert.match(html, /"@type":"WebSite"/);
  assert.equal((html.match(/application\/ld\+json/g) || []).length, 2);
});

// ---------------------------------------------------------------------------
// insertJsonLdBlocks
// ---------------------------------------------------------------------------

test("insertJsonLdBlocks adds a new block before </head> without removing the existing Organization/WebSite blocks", () => {
  const html = insertJsonLdBlocks(SHELL_HTML, [{ "@type": "BreadcrumbList", itemListElement: [] }]);
  assert.match(html, /"@type":"Organization"/);
  assert.match(html, /"@type":"WebSite"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  assert.equal((html.match(/application\/ld\+json/g) || []).length, 3);
});

test("insertJsonLdBlocks with no blocks is a no-op — a plain static page gets no extra script tag", () => {
  const html = insertJsonLdBlocks(SHELL_HTML, []);
  assert.equal(html, SHELL_HTML);
});

test("insertJsonLdBlocks can add two blocks (Product + BreadcrumbList) for one product page", () => {
  const html = insertJsonLdBlocks(SHELL_HTML, [{ "@type": "Product", name: "Test" }, { "@type": "BreadcrumbList", itemListElement: [] }]);
  assert.match(html, /"@type":"Product"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  assert.equal((html.match(/application\/ld\+json/g) || []).length, 4);
});

// ---------------------------------------------------------------------------
// Product structured data
// ---------------------------------------------------------------------------

function baseProduct(overrides = {}) {
  return {
    slug: "abc-colouring-book",
    name: "ABC Colouring Book for Kids",
    shortDescription: "A fun alphabet colouring book.",
    image: "https://example.supabase.co/storage/abc.png",
    price: 100,
    sku: "SG-0001",
    stockStatus: "In Stock",
    reviewCount: 0,
    ratingAverage: 0,
    category: { name: "Kids Colouring Books", slug: "kids-colouring-books" },
    isPreorder: false,
    ...overrides,
  };
}

test("buildProductJsonLd includes real name, description, image, price in ZAR, brand and url", () => {
  const jsonLd = buildProductJsonLd(baseProduct(), "https://www.seasonedzgroup.co.za/product/abc-colouring-book/");
  assert.equal(jsonLd["@context"], "https://schema.org");
  assert.equal(jsonLd["@type"], "Product");
  assert.equal(jsonLd.name, "ABC Colouring Book for Kids");
  assert.equal(jsonLd.description, "A fun alphabet colouring book.");
  assert.equal(jsonLd.image, "https://example.supabase.co/storage/abc.png");
  assert.equal(jsonLd.brand.name, "Seasonedz Group");
  assert.equal(jsonLd.offers.priceCurrency, "ZAR");
  assert.equal(jsonLd.offers.price, "100.00");
  assert.equal(jsonLd.url, "https://www.seasonedzgroup.co.za/product/abc-colouring-book/");
});

test("schemaAvailability reports InStock for an ordinary in-stock product", () => {
  assert.equal(schemaAvailability(baseProduct({ stockStatus: "In Stock" })), "https://schema.org/InStock");
});

test("schemaAvailability reports OutOfStock for a genuinely out-of-stock, non-preorder product — never claims InStock", () => {
  assert.equal(schemaAvailability(baseProduct({ stockStatus: "Out of Stock", isPreorder: false })), "https://schema.org/OutOfStock");
});

test("schemaAvailability reports the real schema.org PreOrder value for an active preorder product, even at zero stock", () => {
  assert.equal(schemaAvailability(baseProduct({ stockStatus: "Out of Stock", isPreorder: true })), "https://schema.org/PreOrder");
});

test("buildProductJsonLd never fabricates aggregateRating when reviewCount is zero", () => {
  const jsonLd = buildProductJsonLd(baseProduct({ reviewCount: 0 }), "https://www.seasonedzgroup.co.za/product/x/");
  assert.equal(jsonLd.aggregateRating, undefined);
});

test("buildProductJsonLd includes a genuine aggregateRating only when real reviews exist", () => {
  const jsonLd = buildProductJsonLd(baseProduct({ reviewCount: 3, ratingAverage: 4.6667 }), "https://www.seasonedzgroup.co.za/product/x/");
  assert.deepEqual(jsonLd.aggregateRating, { "@type": "AggregateRating", ratingValue: "4.67", reviewCount: 3 });
});

test("buildProductJsonLd omits sku/mpn entirely when the product has none — never invents one", () => {
  const jsonLd = buildProductJsonLd(baseProduct({ sku: null }), "https://www.seasonedzgroup.co.za/product/x/");
  assert.equal(jsonLd.sku, undefined);
  assert.equal(jsonLd.mpn, undefined);
});

// ---------------------------------------------------------------------------
// BreadcrumbList / BlogPosting structured data
// ---------------------------------------------------------------------------

test("buildBreadcrumbJsonLd builds a valid, correctly-positioned Home > Category > Product trail", () => {
  const jsonLd = buildBreadcrumbJsonLd([
    { name: "Home", url: "https://www.seasonedzgroup.co.za/" },
    { name: "Kids Colouring Books", url: "https://www.seasonedzgroup.co.za/category/kids-colouring-books/" },
    { name: "ABC Colouring Book for Kids", url: "https://www.seasonedzgroup.co.za/product/abc-colouring-book/" },
  ]);
  assert.equal(jsonLd["@type"], "BreadcrumbList");
  assert.equal(jsonLd.itemListElement.length, 3);
  assert.equal(jsonLd.itemListElement[0].position, 1);
  assert.equal(jsonLd.itemListElement[2].position, 3);
  assert.equal(jsonLd.itemListElement[1].name, "Kids Colouring Books");
});

test("buildBlogPostingJsonLd uses the real post title, excerpt, date and an absolute image URL", () => {
  const jsonLd = buildBlogPostingJsonLd({
    title: "5 Ways Colouring Books Support Early Childhood Learning",
    excerpt: "Discover how colouring activities build fine motor skills and focus.",
    image: "/images/product-1.jpg",
    date: "2026-01-15",
    url: "https://www.seasonedzgroup.co.za/blog/colouring-books-support-early-learning/",
  });
  assert.equal(jsonLd["@type"], "BlogPosting");
  assert.equal(jsonLd.headline, "5 Ways Colouring Books Support Early Childhood Learning");
  assert.equal(jsonLd.description, "Discover how colouring activities build fine motor skills and focus.");
  assert.equal(jsonLd.image, "https://www.seasonedzgroup.co.za/images/product-1.jpg");
  assert.equal(jsonLd.datePublished, "2026-01-15");
  assert.equal(jsonLd.author.name, "Seasonedz Group");
  assert.equal(jsonLd.publisher.name, "Seasonedz Group");
});

// ---------------------------------------------------------------------------
// extractRouteMeta — router.js's own route table, read as plain text
// ---------------------------------------------------------------------------

const FAKE_ROUTER_SOURCE = `
export const routes = [
  { pattern: "/", title: "Home", description: "The real homepage description." },
  {
    pattern: "/about",
    render: renderAbout,
    title: "About Seasonedz Group",
    description: "A South African creative publishing business.",
  },
  { pattern: "/policies", render: renderPolicies, title: "Policies" },
];
`;

test("extractRouteMeta reads the real title and description for a route with both", () => {
  const meta = extractRouteMeta(FAKE_ROUTER_SOURCE, "/about");
  assert.equal(meta.title, "About Seasonedz Group");
  assert.equal(meta.description, "A South African creative publishing business.");
});

test("extractRouteMeta falls back to the shared default description for a route with a title but no description of its own — same as the client-side app would show", () => {
  const meta = extractRouteMeta(FAKE_ROUTER_SOURCE, "/policies");
  assert.equal(meta.title, "Policies");
  assert.match(meta.description, /Educational colouring books/);
});

test("extractRouteMeta returns a null title for a route pattern that genuinely does not exist in the source — never a guessed title", () => {
  const meta = extractRouteMeta(FAKE_ROUTER_SOURCE, "/this-route-does-not-exist");
  assert.equal(meta.title, null);
});
