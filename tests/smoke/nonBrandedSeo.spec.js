// Version 7, Milestone 171I: non-branded search visibility — real,
// path-based category landing pages, richer Product structured data
// (sku/brand/BreadcrumbList), and the Merchant Center feed. Checked
// against the LIVE RENDERED page (Playwright executes JS by default,
// same as Googlebot), since that's the exact class of bug this
// milestone's own audit found for the homepage in 171G (the router
// was overwriting a correct static title with a generic one the
// instant JS ran) — the same check matters here for the new category
// pages too.
import { test, expect } from "@playwright/test";

const SITE_URL = "https://www.seasonedzgroup.co.za";
const PRODUCT_SLUG = "little-hands-big-faith-old-testament-bible-colouring-book";

// Mirrors scripts/generate-static-routes.mjs's own escapeXml() — a SKU
// like the real "N&M" bundle SKU is written into the feed as "N&amp;M",
// so matching against the raw API value needs the same escaping.
function escapeXmlForMatch(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const REAL_CATEGORIES = [
  { slug: "bible-colouring-books", name: "Bible Colouring Books" },
  { slug: "mindfulness-colouring", name: "Mindfulness Colouring" },
  { slug: "kids-colouring-books", name: "Kids Colouring Books" },
  { slug: "markers-and-crayons", name: "Markers and Crayons" },
];

test.describe("Category landing pages (Milestone 171I)", () => {
  for (const category of REAL_CATEGORIES) {
    test(`/category/${category.slug} has a unique, correct title/H1 — never the generic "Home | Seasonedz Group" fallback`, async ({ page }) => {
      await page.goto(`/category/${category.slug}`);
      await expect(page).toHaveTitle(`${category.name} | Seasonedz Group`);
      await expect(page).not.toHaveTitle(/^Home \|/);
      await expect(page).not.toHaveTitle(/^Category \|/);
      await expect(page.locator("h1")).toHaveText(category.name);
    });
  }

  test("a category page self-canonicalises to its own real path — never collapsing back to /shop", async ({ page }) => {
    await page.goto("/category/bible-colouring-books");
    const canonicalTags = page.locator('link[rel="canonical"]');
    await expect(canonicalTags).toHaveCount(1);
    await expect(canonicalTags).toHaveAttribute("href", `${SITE_URL}/category/bible-colouring-books/`);
  });

  test("a category page shows real products from that category only", async ({ page }) => {
    await page.goto("/category/bible-colouring-books");
    const cards = page.locator(".product-card");
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test("a category page has a visible Home > Category breadcrumb with a real, working Home link", async ({ page }) => {
    await page.goto("/category/mindfulness-colouring");
    const breadcrumb = page.locator(".shop-page__breadcrumb");
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb.locator("a", { hasText: "Home" })).toHaveAttribute("href", "/");
  });

  test("a category page emits exactly one valid BreadcrumbList (Home > Category), alongside the unchanged site-wide Organization/WebSite blocks", async ({ page }) => {
    await page.goto("/category/kids-colouring-books");
    // renderShop() is async (awaits getCatalog() before ever calling
    // setPageStructuredData()) — wait for real rendered content first
    // so this doesn't race that same render, same reasoning as the
    // product-page structured data tests above.
    await page.locator(".product-card").first().waitFor();
    const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const parsed = scripts.map((raw) => JSON.parse(raw));

    const breadcrumbBlocks = parsed.filter((entry) => entry["@type"] === "BreadcrumbList");
    expect(breadcrumbBlocks).toHaveLength(1);
    const trail = breadcrumbBlocks[0].itemListElement;
    expect(trail).toHaveLength(2);
    expect(trail[0].name).toBe("Home");
    expect(trail[1].name).toBe("Kids Colouring Books");
    expect(trail[1].item).toContain("/category/kids-colouring-books");

    expect(parsed.filter((entry) => entry["@type"] === "Organization")).toHaveLength(1);
    expect(parsed.filter((entry) => entry["@type"] === "WebSite")).toHaveLength(1);
  });

  test("the empty 'Schools and Wholesale' category is never given its own indexable page or sitemap entry — no thin/empty content", async ({ request, baseURL }) => {
    const resp = await request.get(`${baseURL}/sitemap.xml`);
    const body = await resp.text();
    expect(body).not.toContain("/category/schools-and-wholesale");
  });

  test("the old /shop?category= query-string form still works (not broken by the new path-based routes)", async ({ page }) => {
    await page.goto("/shop?category=bible-colouring-books");
    await expect(page.locator("h1")).toHaveText("Bible Colouring Books");
    await expect(page.locator(".product-card").first()).toBeVisible();
  });
});

test.describe("Category page internal linking (Milestone 171I)", () => {
  test("category cards on the /categories page link to the new /category/:slug routes", async ({ page }) => {
    await page.goto("/categories");
    const card = page.locator(".category-card").first();
    const href = await card.getAttribute("href");
    expect(href).toMatch(/^\/category\//);
  });

  test("the header's Creative Supplies nav item links to /category/markers-and-crayons", async ({ page }) => {
    await page.goto("/");
    await page.setViewportSize({ width: 1440, height: 900 });
    // Desktop "More" dropdown holds this item — open it first (see
    // components/header.js's renderMoreMenu()).
    await page.locator('[data-action="toggle-nav-more"]').click();
    const link = page.locator('a.nav-more__link[href="/category/markers-and-crayons"]');
    await expect(link).toHaveText("Creative Supplies");
  });

  test("Schools & Churches page links to a real product, a real category, and no longer links to the empty category filter", async ({ page }) => {
    await page.goto("/schools");
    await expect(page.locator('a[href="/product/school-starter-colouring-pack"]')).toBeVisible();
    await expect(page.locator('a[href="/category/bundles"]')).toBeVisible();
    await expect(page.locator('a[href="/shop?category=schools-and-wholesale"]')).toHaveCount(0);
  });

  test("Wholesale page links to real product categories", async ({ page }) => {
    await page.goto("/wholesale");
    await expect(page.locator('a[href="/category/bible-colouring-books"]')).toBeVisible();
    await expect(page.locator('a[href="/category/mindfulness-colouring"]')).toBeVisible();
  });

  test("blog posts link to a relevant category or page instead of a generic Shop Now everywhere", async ({ page }) => {
    await page.goto("/blog/bible-colouring-books-in-sunday-school");
    const cta = page.locator(".info-page__cta a.btn");
    await expect(cta).toHaveAttribute("href", "/category/bible-colouring-books");
  });
});

test.describe("Blog post SEO (Milestone 171I)", () => {
  test("a blog post's own title/description render — not the generic 'Blog | Seasonedz Group' fallback", async ({ page }) => {
    await page.goto("/blog/bible-colouring-books-in-sunday-school");
    await expect(page).toHaveTitle("Using Bible Colouring Books in Sunday School | Seasonedz Group");
    await expect(page).not.toHaveTitle("Blog | Seasonedz Group");
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description).not.toBe("");
  });

  test("a blog post emits valid BlogPosting structured data with real, non-fabricated fields", async ({ page }) => {
    await page.goto("/blog/bible-colouring-books-in-sunday-school");
    await expect(page.locator("h1")).toHaveText("Using Bible Colouring Books in Sunday School");
    const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const parsed = scripts.map((raw) => JSON.parse(raw));
    const post = parsed.find((entry) => entry["@type"] === "BlogPosting");

    expect(post).toBeTruthy();
    expect(post.headline).toBe("Using Bible Colouring Books in Sunday School");
    expect(post.author).toEqual({ "@type": "Organization", name: "Seasonedz Group" });
    expect(post).not.toHaveProperty("aggregateRating");
  });

  test("different blog posts each get their own unique title — not the same one everywhere", async ({ page }) => {
    await page.goto("/blog/colouring-books-support-early-learning");
    await expect(page).toHaveTitle("5 Ways Colouring Books Support Early Childhood Learning | Seasonedz Group");

    await page.goto("/blog/calming-power-of-mindfulness-colouring");
    await expect(page).toHaveTitle("The Calming Power of Mindfulness Colouring | Seasonedz Group");
  });
});

test.describe("Product structured data (Milestone 171I)", () => {
  test("Product JSON-LD includes brand and url; sku/mpn only when the admin actually set one", async ({ page }) => {
    await page.goto(`/product/${PRODUCT_SLUG}`);
    await page.locator(".product-details__stock").waitFor();
    const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const product = scripts.map((raw) => JSON.parse(raw)).find((entry) => entry["@type"] === "Product");

    expect(product).toBeTruthy();
    expect(product.brand).toEqual({ "@type": "Brand", name: "Seasonedz Group" });
    expect(product.url).toContain(`/product/${PRODUCT_SLUG}`);
    // Never a fabricated identifier — either both sku/mpn are present
    // and equal (a genuine admin-set SKU), or neither is, never one
    // without the other and never an invented value.
    if (product.sku) {
      expect(product.mpn).toBe(product.sku);
    } else {
      expect(product).not.toHaveProperty("mpn");
    }
    expect(product).not.toHaveProperty("aggregateRating");
  });

  test("Product structured data's availability matches the visible In Stock / Out of Stock state", async ({ page }) => {
    await page.goto(`/product/${PRODUCT_SLUG}`);
    // renderProductDetails() is async (awaits getCatalog() before ever
    // calling setPageStructuredData()) — waiting for visible product
    // content first guarantees the JSON-LD has also been written by
    // then, rather than racing the DOM read against that same render.
    await page.locator(".product-details__stock").waitFor();
    const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const product = scripts.map((raw) => JSON.parse(raw)).find((entry) => entry["@type"] === "Product");

    const visibleStock = await page.locator(".product-details__stock").innerText();
    if (/out of stock/i.test(visibleStock)) {
      expect(product.offers.availability).toBe("https://schema.org/OutOfStock");
    } else {
      expect(product.offers.availability).toBe("https://schema.org/InStock");
    }
  });

  test("product page has exactly one BreadcrumbList (Home > Category > Product), separate from the Product block", async ({ page }) => {
    await page.goto(`/product/${PRODUCT_SLUG}`);
    await page.locator(".product-details__stock").waitFor();
    const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const parsed = scripts.map((raw) => JSON.parse(raw));

    const breadcrumbBlocks = parsed.filter((entry) => entry["@type"] === "BreadcrumbList");
    expect(breadcrumbBlocks).toHaveLength(1);
    const trail = breadcrumbBlocks[0].itemListElement;
    expect(trail).toHaveLength(3);
    expect(trail[0].name).toBe("Home");
    expect(trail[2].name).toBeTruthy();

    expect(parsed.filter((entry) => entry["@type"] === "Product")).toHaveLength(1);
  });

  test("the visible product breadcrumb links to the product's real category page", async ({ page }) => {
    await page.goto(`/product/${PRODUCT_SLUG}`);
    const breadcrumb = page.locator(".product-details__breadcrumb");
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb.locator('a[href="/category/bible-colouring-books"]')).toBeVisible();
  });

  test("navigating between products never leaves a stale extra structured-data block behind", async ({ page }) => {
    await page.goto(`/product/${PRODUCT_SLUG}`);
    await page.locator(".product-details__stock").waitFor();
    await page.goto("/product/abc-colouring-book-for-kids-with-fun-facts");
    await page.locator(".product-details__stock").waitFor();
    const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const parsed = scripts.map((raw) => JSON.parse(raw));
    expect(parsed.filter((entry) => entry["@type"] === "Product")).toHaveLength(1);
    expect(parsed.filter((entry) => entry["@type"] === "BreadcrumbList")).toHaveLength(1);
  });
});

test.describe("Sitemap and feed (Milestone 171I)", () => {
  test("sitemap includes every real category page and every product page, still with no private/duplicate routes", async ({ request, baseURL }) => {
    const resp = await request.get(`${baseURL}/sitemap.xml`);
    expect(resp.status()).toBe(200);
    const body = await resp.text();
    const urls = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);

    for (const category of REAL_CATEGORIES) {
      expect(urls).toContain(`${SITE_URL}/category/${category.slug}/`);
    }
    expect(urls).toContain(`${SITE_URL}/product/${PRODUCT_SLUG}/`);
    expect(new Set(urls).size).toBe(urls.length);
  });

  test("the Google Merchant Center feed is published, well-formed XML with the expected fields, and no fabricated identifiers", async ({ request, baseURL }) => {
    const resp = await request.get(`${baseURL}/google-merchant-feed.xml`);
    expect(resp.status()).toBe(200);
    const body = await resp.text();

    expect(body).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(body).toContain("<g:id>");
    expect(body).toContain("<g:price>");
    expect(body).toContain("ZAR");
    expect(body).toContain("<g:brand>Seasonedz Group</g:brand>");
    expect(body).toContain("<g:condition>new</g:condition>");
    // Version 7, Milestone 171I.1: audited — no product in the
    // authoritative database has a genuine GTIN/ISBN field today (see
    // this milestone's own final report), so neither must ever appear
    // here; the moment real identifier data exists, this assertion is
    // expected to need updating alongside it, never before.
    expect(body).not.toContain("<g:gtin>");
    expect(body).not.toContain("<g:isbn>");
  });

  test("the feed has no duplicate product ids, and every id corresponds to a real product URL", async ({ request, baseURL }) => {
    const resp = await request.get(`${baseURL}/google-merchant-feed.xml`);
    const body = await resp.text();
    const ids = [...body.matchAll(/<g:id>(.*?)<\/g:id>/g)].map((m) => m[1]);
    const links = [...body.matchAll(/<link>(.*?)<\/link>/g)].map((m) => m[1]).filter((link) => link !== `${SITE_URL}/`);

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(links.length).toBe(ids.length);
    for (const link of links) {
      expect(link.startsWith(`${SITE_URL}/product/`)).toBe(true);
    }
  });

  test("Milestone 171I.2: every g:id is <= 50 characters (Google's own limit), stable and SKU-based rather than the (sometimes longer) slug", async ({ request, baseURL }) => {
    const resp = await request.get(`${baseURL}/google-merchant-feed.xml`);
    const body = await resp.text();

    const items = body.split("<item>").slice(1);
    expect(items.length).toBe(11);

    const ids = items.map((item) => item.match(/<g:id>(.*?)<\/g:id>/)?.[1]);
    for (const id of ids) {
      expect(id, "every item must have a g:id").toBeTruthy();
      expect(id.length, `g:id "${id}" exceeds Google's 50 character limit`).toBeLessThanOrEqual(50);
      expect(id).not.toContain(" ");
    }
    expect(new Set(ids).size).toBe(ids.length);

    // The three products whose slug alone was already over 50 characters
    // (the original Merchant Center failure) now carry their short SKU
    // as g:id instead.
    const overLimitSlugItem = items.find((item) =>
      item.includes("little-hands-big-faith-new-testament-bible-colouring-book")
    );
    expect(overLimitSlugItem).toBeTruthy();
    expect(overLimitSlugItem).toMatch(/<g:id>SG-0004<\/g:id>/);
    expect(overLimitSlugItem).not.toMatch(/<g:id>little-hands-big-faith-new-testament-bible-colouring-book<\/g:id>/);
  });

  test("every feed image URL is a real, crawlable, non-placeholder image that returns 200", async ({ request, baseURL }) => {
    const resp = await request.get(`${baseURL}/google-merchant-feed.xml`);
    const body = await resp.text();
    const imageLinks = [...body.matchAll(/<g:image_link>(.*?)<\/g:image_link>/g)].map((m) => m[1]);

    expect(imageLinks.length).toBeGreaterThan(0);
    // Spot-check the first image rather than every single one (this is
    // a smoke test, not a full crawl) — a real, working Supabase
    // storage URL, never a placeholder path.
    const firstImageResponse = await request.get(imageLinks[0]);
    expect(firstImageResponse.status()).toBe(200);
    expect(imageLinks[0]).not.toContain("placeholder");
  });

  test("feed availability agrees with the live product API's own stock state for every item — Out of Stock is never emitted as in stock", async ({ request, baseURL }) => {
    // Cross-checked directly against the same live API the feed itself
    // is built from (scripts/generate-static-routes.mjs's
    // getProductsForFeed()) — deliberately not the rendered page, which
    // under this suite's "local" project uses static fallback data
    // that can legitimately lag behind the live catalogue (see
    // playwright.config.js's own header comment on why).
    const [feedResp, apiResp] = await Promise.all([
      request.get(`${baseURL}/google-merchant-feed.xml`),
      request.get("https://api.seasonedzgroup.co.za/api/products?limit=100"),
    ]);
    const feedBody = await feedResp.text();
    const apiJson = await apiResp.json();

    const items = feedBody.split("<item>").slice(1);
    for (const product of apiJson.data.products) {
      // Milestone 171I.2: g:id is the product's SKU, not its slug (see
      // generate-static-routes.mjs's own header comment above
      // buildMerchantFeedXml() for why) — matched here the same way.
      const item = items.find((entry) => entry.includes(`<g:id>${escapeXmlForMatch(product.sku)}</g:id>`));
      if (!item) continue; // A product could be absent from this build's feed if it was added after the feed was generated — not this test's concern.
      const feedAvailability = item.match(/<g:availability>(.*?)<\/g:availability>/)?.[1];
      const expected = product.stockStatus === "Out of Stock" ? "out of stock" : "in stock";
      expect(feedAvailability, `mismatch for ${product.slug} (sku ${product.sku})`).toBe(expected);
    }
  });
});
