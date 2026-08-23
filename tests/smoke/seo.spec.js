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
    await expect(page).toHaveTitle("Shop | Seasonedz Group");
  });
});
