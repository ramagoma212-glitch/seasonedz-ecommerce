// Version 7, Milestone 177: website and email copy cleanup — brief
// section 20's "safe copy audit test... catch future accidental use of
// em dash/en dash in customer facing copy without scanning technical
// files." This deliberately reads each page's REAL RENDERED TEXT
// (page.locator("body").innerText()), never the source file — a
// browser's own innerText never includes HTML comments or <script>/
// <style> content, so this can never be tripped up by a legitimate
// developer comment or by CSS/JS syntax. Only what a visitor actually
// sees is ever inspected.
import { test, expect } from "@playwright/test";

const EM_DASH = "—";
const EN_DASH = "–";
const DASH_PATTERN = new RegExp(`[${EM_DASH}${EN_DASH}]`);

async function assertNoDecorativeDashes(page, label) {
  const text = await page.locator("body").innerText();
  const match = text.match(new RegExp(`.{0,40}[${EM_DASH}${EN_DASH}].{0,40}`));
  expect(match, `${label} contains an em/en dash in its visible text: ${match?.[0]}`).toBeNull();
}

const PUBLIC_PAGES = [
  "/",
  "/shop",
  "/cart",
  "/about",
  "/contact",
  "/faq",
  "/schools",
  "/blog",
  "/terms",
  "/privacy-policy",
  "/cookies-policy",
  "/returns-policy",
  "/affiliate-terms",
  "/track-order",
  "/account",
  "/account/forgot-password",
  "/account/affiliate-application",
  "/admin/login",
  "/this-page-does-not-exist",
];

test.describe("Copy audit: no decorative em/en dash in visible page text", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} has no em/en dash in its rendered body text`, async ({ page }) => {
      await page.goto(path);
      await assertNoDecorativeDashes(page, path);
    });
  }

  test("a real blog post has no em/en dash in its rendered body text", async ({ page }) => {
    await page.goto("/blog");
    const firstPostLink = page.locator(".blog-card a, a[href^='/blog/']").first();
    await firstPostLink.click();
    await assertNoDecorativeDashes(page, "blog post");
  });

  test("a real product detail page has no em/en dash in its rendered body text", async ({ page }) => {
    await page.goto("/shop");
    await page.locator(".product-card a, a[href^='/product/']").first().click();
    await assertNoDecorativeDashes(page, "product detail page");
  });

  // Version 7, Milestone 177, brief section 14: the browser tab title
  // itself (document.title) is a distinct, standard SEO/browser
  // convention ("Page | Site Name") — explicitly preserved per brief
  // section 15 ("do not damage SEO... preserve keywords and page
  // meaning"), not a "decorative separator between sentences." This is
  // deliberately NOT asserted dash-free here; see MILESTONE_177 final
  // report for the full reasoning.
});
