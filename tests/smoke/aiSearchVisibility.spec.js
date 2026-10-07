// Milestone 203: AI search visibility / GEO work — covers what the
// pure file-content tests in scripts/organizationSchema.test.mjs can't
// (those check source content; these check what's actually served and
// actually rendered once JS runs, the same "live rendered page" check
// nonBrandedSeo.spec.js already uses for category/blog JSON-LD).
import { test, expect } from "@playwright/test";

test.describe("Static discovery files are actually served (Milestone 203)", () => {
  test("robots.txt is served with the named search-crawler blocks", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("User-agent: Googlebot");
    expect(body).toContain("User-agent: Bingbot");
    expect(body).toContain("User-agent: OAI-SearchBot");
    expect(body).toContain("Sitemap: https://www.seasonedzgroup.co.za/sitemap.xml");
  });

  test("llms.txt is served and names the real business", async ({ request }) => {
    const response = await request.get("/llms.txt");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("Seasonedz Group");
  });
});

test.describe("Blog post BreadcrumbList (Milestone 203)", () => {
  test("a blog post emits a Home > Blog > Post breadcrumb alongside its BlogPosting data", async ({ page, baseURL }) => {
    await page.goto("/blog/bible-colouring-books-in-sunday-school");
    const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const parsed = scripts.map((raw) => JSON.parse(raw));

    const breadcrumb = parsed.find((entry) => entry["@type"] === "BreadcrumbList");
    expect(breadcrumb).toBeTruthy();
    expect(breadcrumb.itemListElement).toHaveLength(3);
    // The client-side block builds `item` from window.location.origin (same
    // pattern productDetails.js's own breadcrumb already uses) — correctly
    // the test server's own origin here, the real production domain once
    // deployed. Asserting against `baseURL` rather than a hardcoded
    // production domain matches that, instead of wrongly asserting a
    // production URL this page was never rendered under.
    expect(breadcrumb.itemListElement[0]).toMatchObject({ position: 1, name: "Home", item: `${baseURL}/` });
    expect(breadcrumb.itemListElement[1]).toMatchObject({ position: 2, name: "Blog", item: `${baseURL}/blog` });
    expect(breadcrumb.itemListElement[2]).toMatchObject({ position: 3, name: "Using Bible Colouring Books in Sunday School" });

    // The existing BlogPosting block (Milestone 171I) must still be present
    // alongside the new breadcrumb — this milestone adds, never replaces.
    const post = parsed.find((entry) => entry["@type"] === "BlogPosting");
    expect(post).toBeTruthy();
  });
});

test.describe("Organization contactPoint renders on a real page (Milestone 203)", () => {
  test("the homepage's Organization JSON-LD includes a real, matching contactPoint", async ({ page }) => {
    await page.goto("/");
    const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const parsed = scripts.map((raw) => JSON.parse(raw));
    const org = parsed.find((entry) => entry["@type"] === "Organization");

    expect(org).toBeTruthy();
    expect(org.contactPoint).toMatchObject({
      "@type": "ContactPoint",
      telephone: "+27728445644",
      email: "seasonedzgroup@outlook.com",
    });
  });
});

test.describe("Category pages link back to their matching article (Milestone 203)", () => {
  const CASES = [
    { slug: "kids-colouring-books", articleHref: "/blog/colouring-books-support-early-learning" },
    { slug: "bible-colouring-books", articleHref: "/blog/bible-colouring-books-in-sunday-school" },
    { slug: "mindfulness-colouring", articleHref: "/blog/calming-power-of-mindfulness-colouring" },
    { slug: "markers-and-crayons", articleHref: "/blog/choosing-markers-and-crayons-for-little-hands" },
  ];

  for (const { slug, articleHref } of CASES) {
    test(`/category/${slug}/ links to its matching article, and the link resolves`, async ({ page }) => {
      await page.goto(`/category/${slug}/`);
      const link = page.locator(`.category-seo-content__related a[href="${articleHref}"]`);
      await expect(link).toBeVisible();

      await link.click();
      await expect(page).toHaveURL(new RegExp(`${articleHref}$`));
      await expect(page.locator("h1")).not.toHaveText("Post Not Found");
    });
  }

  test("the bundles category deliberately has no related-article link (no genuine single match)", async ({ page }) => {
    await page.goto("/category/bundles/");
    await expect(page.locator(".category-seo-content__related")).toHaveCount(0);
  });
});
