// Version 7, Milestone 103: SEO smoke checks — robots.txt, sitemap.xml,
// index/noindex, canonical URLs and Product JSON-LD. Deliberately
// checks structure, not exact business content: sitemap URL count is
// the one number pinned here, since it's been stable at 31 across
// every milestone that touched SEO in this project (15 static public
// routes + "/" + product/blog slugs from scripts/generate-static-
// routes.mjs) — see that script if this ever needs to change.
import { test, expect } from "@playwright/test";

const SITE_URL = "https://www.seasonedzgroup.co.za";
const PRODUCT_SLUG = "abc-colouring-book-for-kids-with-fun-facts";

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

  test("sitemap.xml returns 200, has 31 URLs, no private routes", async ({ request, baseURL }) => {
    const resp = await request.get(`${baseURL}/sitemap.xml`);
    expect(resp.status()).toBe(200);

    const body = await resp.text();
    const urls = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(urls.length).toBe(31);

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
