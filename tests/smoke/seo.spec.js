// Version 7, Milestone 103: SEO smoke checks — robots.txt, sitemap.xml,
// index/noindex, canonical URLs and Product JSON-LD. Deliberately
// checks structure, not exact business content.
//
// Milestone 168D.5: the sitemap's total URL count is NOT pinned to an
// exact number — scripts/generate-static-routes.mjs generates product
// (and blog) routes dynamically from the live catalog, so the count
// legitimately grows whenever a product is added (this test broke at
// 31 -> 32 URLs purely because an 11th product went live, not because
// of any bug). Instead, the sitemap test below checks structure: every
// known static route is present, at least one product/blog route is
// present, every URL uses the canonical host, and there are no private
// or duplicate entries.
import { test, expect } from "@playwright/test";

const SITE_URL = "https://www.seasonedzgroup.co.za";
const PRODUCT_SLUG = "abc-colouring-book-for-kids-with-fun-facts";

// Mirrors PUBLIC_STATIC_ROUTES in scripts/generate-static-routes.mjs.
// Kept as a manual, obvious duplication rather than importing that
// script (which would pull its live-API fetch into the test file) —
// update both lists together if public static routes ever change.
const CORE_STATIC_ROUTES = [
  "/",
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

test.describe("SEO smoke checks", () => {
  test("homepage, shop and product detail load", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Seasonedz Group/);

    await page.goto("/shop");
    await expect(page.locator(".product-card").first()).toBeVisible();

    await page.goto(`/product/${PRODUCT_SLUG}`);
    await expect(page.locator(".product-details__main-image")).toBeVisible();
  });

  test("robots.txt returns 200", async ({ request, baseURL }) => {
    const resp = await request.get(`${baseURL}/robots.txt`);
    expect(resp.status()).toBe(200);
  });

  test("sitemap.xml returns 200, contains all core routes, no private or duplicate routes", async ({ request, baseURL }) => {
    const resp = await request.get(`${baseURL}/sitemap.xml`);
    expect(resp.status()).toBe(200);

    const body = await resp.text();
    const urls = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);

    for (const route of CORE_STATIC_ROUTES) {
      const expectedUrl = route === "/" ? `${SITE_URL}/` : `${SITE_URL}${route}/`;
      expect(urls).toContain(expectedUrl);
    }
    expect(urls).toContain(`${SITE_URL}/product/${PRODUCT_SLUG}/`);
    expect(urls.some((u) => u.startsWith(`${SITE_URL}/product/`))).toBe(true);
    expect(urls.some((u) => u.startsWith(`${SITE_URL}/blog/`))).toBe(true);
    // Floor, not a pinned total: core static routes plus at least one
    // dynamic product/blog route each. Real growth in the catalog only
    // ever raises this number, so it can't cause a false failure.
    expect(urls.length).toBeGreaterThanOrEqual(CORE_STATIC_ROUTES.length + 2);

    for (const url of urls) {
      expect(url.startsWith(SITE_URL)).toBe(true);
      expect(url).not.toContain("#");
    }
    expect(new Set(urls).size).toBe(urls.length);
    const normalized = urls.map((u) => u.replace(/\/$/, ""));
    expect(new Set(normalized).size).toBe(normalized.length);

    const privatePatterns = ["/cart", "/wishlist", "/checkout", "/admin", "/order-confirmation", "/payment-", "/track-order", "/search"];
    const privateInSitemap = urls.filter((u) => privatePatterns.some((p) => u.includes(p)));
    expect(privateInSitemap).toEqual([]);
  });

  test("public pages are index,follow", async ({ page }) => {
    for (const path of ["/", "/shop", "/categories"]) {
      await page.goto(path);
      const robots = await page.locator('meta[name="robots"]').getAttribute("content");
      expect(robots).toContain("index");
      expect(robots).not.toContain("noindex");
    }
  });

  test("private pages are noindex,nofollow", async ({ page }) => {
    for (const path of ["/cart", "/checkout", "/admin/login"]) {
      await page.goto(path);
      const robots = await page.locator('meta[name="robots"]').getAttribute("content");
      expect(robots).toContain("noindex");
    }
  });

  test("canonical URLs are correct for homepage, shop and product page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE_URL}/`);

    await page.goto("/shop");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE_URL}/shop/`);

    await page.goto(`/product/${PRODUCT_SLUG}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE_URL}/product/${PRODUCT_SLUG}/`);
  });

  test("Product JSON-LD is valid with no fake reviews", async ({ page }) => {
    await page.goto(`/product/${PRODUCT_SLUG}`);
    await expect(page.locator(".product-details__main-image")).toBeVisible();

    const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    let product = null;
    for (const raw of scripts) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed["@type"] === "Product") product = parsed;
      } catch {
        // Not this page's Product block (e.g. Organization/WebSite) — ignore.
      }
    }

    expect(product).not.toBeNull();
    expect(product.name).toBeTruthy();
    expect(product.offers).toBeTruthy();
    expect(product).not.toHaveProperty("aggregateRating");
    expect(product).not.toHaveProperty("review");
    // Small SEO improvement before Milestone 184: the return/shipping
    // policy now lives once at Organization level (see the homepage
    // structured-data tests below) — deliberately never duplicated onto
    // individual Product Offers, since no product has a policy that
    // differs from the standard one (per current Google Search Central
    // guidance, Offer-level shippingDetails/hasMerchantReturnPolicy is
    // only for exactly that override case). Preorder availability logic
    // itself (Milestone 183's own fix) stays completely untouched.
    expect(product.offers).not.toHaveProperty("shippingDetails");
    expect(product.offers).not.toHaveProperty("hasMerchantReturnPolicy");
    expect(product.offers.availability).toMatch(/^https:\/\/schema\.org\/(InStock|OutOfStock|PreOrder)$/);
  });

  // Organization structured data lives as a static block in index.html's
  // own shell and is never removed/regenerated by client-side JS (unlike
  // Product JSON-LD — see js/seo.js's clearPageStructuredData(), which
  // only ever touches the #page-structured-data id), so raw HTML and the
  // post-hydration DOM are structurally guaranteed to carry the exact
  // same Organization block. This test proves that directly rather than
  // relying on the architecture alone, exactly the kind of "raw HTML
  // said X, runtime JS said Y" drift Milestone 183's own preorder
  // schema-availability bug turned out to be.
  test("Organization return/shipping policy is identical in raw static HTML and the post-hydration runtime DOM", async ({ page, request, baseURL }) => {
    const rawResponse = await request.get(`${baseURL}/`);
    const rawHtml = await rawResponse.text();
    const rawMatch = rawHtml.match(/"@type":\s*"Organization"[\s\S]*?"hasShippingService"[\s\S]*?\]\s*\}\s*\}/);
    expect(rawMatch, "raw HTML must already contain the Organization hasShippingService block").not.toBeNull();

    await page.goto("/");
    const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const runtimeOrganization = scripts.map((raw) => JSON.parse(raw)).find((entry) => entry["@type"] === "Organization");

    // Re-parse the same raw HTML as real JSON (not the brittle regex
    // match above, which only proves presence) so both sides compare as
    // parsed objects.
    const rawScripts = [...rawHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    const rawOrganization = rawScripts.map((m) => JSON.parse(m[1])).find((entry) => entry["@type"] === "Organization");

    expect(runtimeOrganization.hasMerchantReturnPolicy).toEqual(rawOrganization.hasMerchantReturnPolicy);
    expect(runtimeOrganization.hasShippingService).toEqual(rawOrganization.hasShippingService);
  });
});

// Milestone 196: scripts/generate-static-routes.mjs's own title-
// replacement regex (applyRouteMetadata()) used to match the FIRST
// literal "<title>" substring anywhere in the built index.html shell —
// including one that appears as plain prose inside an unrelated
// Milestone 171G developer comment, well before the real tag. Because
// that match was non-greedy, it then searched forward for the next
// "</title>" (the real tag's own closing tag), consuming everything in
// between — the comment's own closing "-->", the real tag's opening
// "<title>", AND the <meta name="description"> tag that immediately
// follows it. The net effect: on every non-homepage generated route,
// the new title text got spliced into the middle of a still-open HTML
// comment that then swallowed the description tag too, and never
// closed until the NEXT unrelated comment's own "-->" — leaving both
// tags completely invisible to any non-JS-executing crawler or raw
// HTTP fetch reading the static file, even though a JS-executing
// browser (and therefore every existing Playwright test above, which
// all read the post-hydration DOM) never showed any symptom at all.
// These tests read the RAW response text directly (Playwright's
// `request` fixture never executes JS), which is the only way this
// class of bug is ever actually caught.
test.describe("Raw static HTML title/description (Milestone 196 regression guard)", () => {
  async function rawHead(request, baseURL, path) {
    const resp = await request.get(`${baseURL}${path}`);
    expect(resp.ok(), `${path} must return a successful response`).toBeTruthy();
    return resp.text();
  }

  test("a product page's raw HTML has a real, uncommented <title> and <meta name=\"description\">", async ({ request, baseURL }) => {
    const html = await rawHead(request, baseURL, "/product/abc-colouring-book-for-kids-with-fun-facts/");
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    expect(titleMatch, "a real <title>...</title> tag must exist").not.toBeNull();
    expect(titleMatch[1]).toContain("ABC Colouring Book for Kids with Fun Facts");
    expect(titleMatch[1]).not.toBe("Seasonedz Group | Colouring Books & Creative Products");

    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
    expect(descMatch, "a real <meta name=\"description\"> tag must exist").not.toBeNull();
    expect(descMatch[1].length).toBeGreaterThan(0);

    // The specific regression: neither tag's match may sit inside an
    // unclosed HTML comment — every "<!--" before the tag's own index
    // must have a "-->" before that same index too.
    for (const match of [titleMatch, descMatch]) {
      const before = html.slice(0, match.index);
      const opens = (before.match(/<!--/g) || []).length;
      const closes = (before.match(/-->/g) || []).length;
      expect(opens, `${match[0].slice(0, 30)}... must not be inside an unclosed HTML comment`).toBe(closes);
    }
  });

  test("a category page's and a blog post's raw HTML also have real, uncommented title/description tags", async ({ request, baseURL }) => {
    for (const path of ["/category/kids-colouring-books/", "/blog/colouring-books-support-early-learning/"]) {
      const html = await rawHead(request, baseURL, path);
      const titleMatch = html.match(/<title>([^<]*)<\/title>/);
      expect(titleMatch, `${path}: a real <title> tag must exist`).not.toBeNull();
      expect(titleMatch[1]).not.toBe("Seasonedz Group | Colouring Books & Creative Products");

      const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
      expect(descMatch, `${path}: a real <meta name="description"> tag must exist`).not.toBeNull();

      const before = html.slice(0, titleMatch.index);
      const opens = (before.match(/<!--/g) || []).length;
      const closes = (before.match(/-->/g) || []).length;
      expect(opens, `${path}: <title> must not be inside an unclosed HTML comment`).toBe(closes);
    }
  });
});

// Version 7, Milestone 171G: the target Google branded search
// appearance — exact homepage title/description/Open Graph/structured
// data, matching what's ultimately requested from Google (see the
// milestone's own final report — this is a target, never a guarantee
// of what Google will actually display). Checked against the LIVE
// rendered page (post-JS), not just the static HTML source, since
// that's what a JS-executing crawler like Googlebot actually sees —
// this exact distinction is what this milestone's audit found broken
// (js/router.js's home route was overwriting index.html's own title
// with a generic "Home | Seasonedz Group" on every render).
test.describe("Google branded search appearance (Milestone 171G)", () => {
  const HOMEPAGE_TITLE = "Seasonedz Group | Colouring Books & Creative Products";
  const HOMEPAGE_DESCRIPTION =
    "Shop educational, Bible and mindfulness colouring books, markers, crayons and creative products for kids, families, schools and churches in South Africa.";

  test("homepage title is exactly the target branded title, and there is exactly one <title>", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(HOMEPAGE_TITLE);
    expect(await page.locator("title").count()).toBe(1);
  });

  test("homepage meta description is exactly the target text, and there is exactly one description tag", async ({ page }) => {
    await page.goto("/");
    const descriptionTags = page.locator('meta[name="description"]');
    await expect(descriptionTags).toHaveCount(1);
    await expect(descriptionTags).toHaveAttribute("content", HOMEPAGE_DESCRIPTION);
  });

  test("homepage canonical is exactly https://www.seasonedzgroup.co.za/, and there is exactly one canonical tag", async ({ page }) => {
    await page.goto("/");
    const canonicalTags = page.locator('link[rel="canonical"]');
    await expect(canonicalTags).toHaveCount(1);
    await expect(canonicalTags).toHaveAttribute("href", `${SITE_URL}/`);
  });

  test("homepage Open Graph metadata matches the target branded appearance exactly", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "Seasonedz Group");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", HOMEPAGE_TITLE);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", HOMEPAGE_DESCRIPTION);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `${SITE_URL}/`);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "website");
  });

  test("homepage Twitter/X metadata mirrors the same title/description", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute("content", HOMEPAGE_TITLE);
    await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute("content", HOMEPAGE_DESCRIPTION);
  });

  test("homepage structured data: exactly one WebSite and one Organization block, both correctly identifying Seasonedz Group, no fake ratings", async ({ page }) => {
    await page.goto("/");
    const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();

    const parsed = scripts.map((raw) => JSON.parse(raw));
    const websiteBlocks = parsed.filter((entry) => entry["@type"] === "WebSite");
    const organizationBlocks = parsed.filter((entry) => entry["@type"] === "Organization");

    expect(websiteBlocks).toHaveLength(1);
    expect(organizationBlocks).toHaveLength(1);

    const website = websiteBlocks[0];
    expect(website.name).toBe("Seasonedz Group");
    expect(website.url).toBe(`${SITE_URL}/`);

    const organization = organizationBlocks[0];
    expect(organization.name).toBe("Seasonedz Group");
    expect(organization.url).toBe(`${SITE_URL}/`);

    // No fake review/rating SEO — see productReviews.js's own genuine-
    // reviews-only discipline; this applies equally to site-wide
    // Organization/WebSite structured data.
    for (const entity of [website, organization]) {
      expect(entity).not.toHaveProperty("aggregateRating");
      expect(entity).not.toHaveProperty("review");
      expect(entity).not.toHaveProperty("ratingValue");
      expect(entity).not.toHaveProperty("reviewCount");
    }
  });

  // Small SEO improvement before Milestone 184: Organization-level
  // hasMerchantReturnPolicy/hasShippingService, added to resolve two
  // non-critical Google Search Console Merchant listing warnings. Real
  // values only — see index.html's own comment on the Organization
  // block for exactly which source (src/pages/returnsPolicy.js,
  // src/config/delivery.js, src/pages/shippingPolicy.js) each field is
  // audited from, and which fields are deliberately omitted rather than
  // invented (delivery time estimates, Customer Collection, the
  // registered-customer R500 threshold).
  test("Organization structured data carries a real return policy link, never an invented return window", async ({ page }) => {
    await page.goto("/");
    const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const organization = scripts.map((raw) => JSON.parse(raw)).find((entry) => entry["@type"] === "Organization");

    expect(organization.hasMerchantReturnPolicy).toMatchObject({
      "@type": "MerchantReturnPolicy",
      merchantReturnLink: `${SITE_URL}/returns-policy`,
    });
    // The real Returns Policy has no single universal return window (see
    // returnsPolicy.js sections 7-13 — books/digital/personalised items
    // are wholly or partly excluded from the standard 7-day window), so
    // asserting a fixed returnPolicyCategory/merchantReturnDays here
    // would misrepresent it — the link-only form is deliberate.
    expect(organization.hasMerchantReturnPolicy).not.toHaveProperty("returnPolicyCategory");
    expect(organization.hasMerchantReturnPolicy).not.toHaveProperty("merchantReturnDays");
  });

  test("Organization structured data carries the real ZAR/South-Africa shipping rates and free-delivery threshold, with no invented delivery time", async ({ page }) => {
    await page.goto("/");
    const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const organization = scripts.map((raw) => JSON.parse(raw)).find((entry) => entry["@type"] === "Organization");

    const shipping = organization.hasShippingService;
    expect(shipping["@type"]).toBe("ShippingService");
    expect(shipping).not.toHaveProperty("handlingTime");
    expect(shipping).not.toHaveProperty("deliveryTime");

    const conditions = shipping.shippingConditions;
    for (const condition of conditions) {
      expect(condition.shippingDestination).toMatchObject({ "@type": "DefinedRegion", addressCountry: "ZA" });
      expect(condition.orderValue.currency).toBe("ZAR");
      expect(condition.shippingRate.currency).toBe("ZAR");
      expect(condition).not.toHaveProperty("transitTime");
    }

    // Real rates from src/config/delivery.js: R100 Locker, R120 Door,
    // both free at the real R600 guest threshold — never invented.
    const rates = conditions.map((c) => c.shippingRate.value).sort((a, b) => a - b);
    expect(rates).toEqual([0, 100, 120]);
    const freeCondition = conditions.find((c) => c.shippingRate.value === 0);
    expect(freeCondition.orderValue.minValue).toBe(600);
  });

  test("no stale seasonedzgroup.com or github.io references anywhere in the homepage's rendered HTML", async ({ page }) => {
    await page.goto("/");
    const html = await page.content();
    expect(html).not.toContain("seasonedzgroup.com");
    expect(html).not.toContain("github.io");
  });

  test("favicon references exist and the actual asset returns 200", async ({ page, request, baseURL }) => {
    await page.goto("/");
    const iconLink = page.locator('link[rel="icon"][sizes="any"]');
    await expect(iconLink).toHaveAttribute("href", "/favicon.ico");
    const svgIconLink = page.locator('link[rel="icon"][type="image/svg+xml"]');
    await expect(svgIconLink).toHaveAttribute("href", "/favicon.svg");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-touch-icon.png");

    const faviconResponse = await request.get(`${baseURL}/favicon.ico`);
    expect(faviconResponse.status()).toBe(200);
    const svgResponse = await request.get(`${baseURL}/favicon.svg`);
    expect(svgResponse.status()).toBe(200);
  });

  test("product and category pages keep their own unique titles — the homepage title never leaks onto other pages", async ({ page }) => {
    await page.goto(`/product/${PRODUCT_SLUG}`);
    await expect(page).not.toHaveTitle(HOMEPAGE_TITLE);
    await expect(page).toHaveTitle(/Seasonedz Group$/);

    await page.goto("/shop");
    await expect(page).not.toHaveTitle(HOMEPAGE_TITLE);
    // Milestone 196: title deliberately changed from the generic "Shop"
    // to a non-brand-search-targeted one — see router.js's own comment
    // on this route.
    await expect(page).toHaveTitle("Shop Colouring Books, Markers & Crayons | Seasonedz Group");
  });
});
