// URGENT OWNER UPDATE (24 August 2026): About page and the four legal
// pages (Cookie, Terms, Privacy, Returns) were replaced in full with
// owner-approved text. These tests confirm the key content facts the
// brief itself asked to be pinned down: the About page's opening,
// Mission, Vision and print on demand wording; each document's last
// updated date; the registration number, email, phone and .co.za
// website appearing where the owner's text puts them; no stale .com
// reference anywhere; and that all five routes render successfully.
import { test, expect } from "@playwright/test";

const REGISTRATION_NUMBER = "2024/618215/07";
const EMAIL = "seasonedzgroup@outlook.com";
const PHONE = "069 526 9941";
const WEBSITE_DISPLAY = "www.seasonedzgroup.co.za";
const LAST_UPDATED = "Last updated: 24 August 2026";

const LEGAL_PAGES = [
  { path: "/terms", h1: "Terms and Conditions" },
  { path: "/privacy-policy", h1: "Privacy Policy" },
  { path: "/returns-policy", h1: "Returns, Refunds and Exchanges Policy" },
  { path: "/cookies-policy", h1: "Cookie Policy" },
];

test.describe("Owner About + Legal content update (24 August 2026)", () => {
  test("About page renders with the new owner-approved H1 and section order", async ({ page }) => {
    await page.goto("/about");
    await expect(page.locator("h1")).toHaveText("About Seasonedz Group");

    const headings = await page.locator(".info-page__body h2").allInnerTexts();
    expect(headings).toEqual([
      "Where Creativity Meets Purpose",
      "Our Story",
      "What We Do Today",
      "Our Mission",
      "Our Vision",
      "The Future We Are Building",
      "Creating Opportunities Through Creativity",
      "What We Stand For",
      "Where Creativity Meets Purpose",
    ]);
  });

  test("About page opening distinguishes today's products from the future print on demand vision", async ({ page }) => {
    await page.goto("/about");
    const body = page.locator(".info-page__body");
    await expect(body).toContainText("Seasonedz Group is a South African creative publishing and growing print business");
    await expect(body).toContainText("Today, we create educational colouring books for children");
    await expect(body).toContainText("But our vision goes far beyond the products we create today.");
    await expect(body).toContainText("trusted print on demand and printing business");
  });

  test("About page preserves the Seasoned / Nedz / Nedzamba brand origin explanation", async ({ page }) => {
    await page.goto("/about");
    const body = page.locator(".info-page__body");
    await expect(body).toContainText("Seasoned");
    await expect(body).toContainText("Nedz");
    await expect(body).toContainText("Nedzamba");
  });

  test("About page's Mission and Vision sections carry the owner's exact wording", async ({ page }) => {
    await page.goto("/about");
    const body = page.locator(".info-page__body");
    await expect(body).toContainText("Our mission is to create meaningful educational and creative products");
    await expect(body).toContainText("one of Africa");
    await expect(body).toContainText("most trusted print on demand and printing businesses");
    await expect(body).toContainText("Idea");
    await expect(body).toContainText("Product");
    await expect(body).toContainText("Opportunity");
  });

  for (const { path, h1 } of LEGAL_PAGES) {
    test(`${path} renders successfully with the correct H1 and last updated date`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.ok()).toBe(true);
      await expect(page.locator("h1")).toHaveText(h1);
      await expect(page.locator(".stub-page__text")).toHaveText(LAST_UPDATED);
    });

    test(`${path} shows the correct registration number, email, phone and secure .co.za website, and no stale .com reference`, async ({ page }) => {
      await page.goto(path);
      const body = page.locator(".info-page__body");
      await expect(body).toContainText(REGISTRATION_NUMBER);
      await expect(body).toContainText(EMAIL);
      await expect(body).toContainText(PHONE);
      await expect(body).toContainText(WEBSITE_DISPLAY);
      await expect(page.locator(`a[href="https://${WEBSITE_DISPLAY}"]`).first()).toBeVisible();

      const html = await page.content();
      expect(html).not.toContain("seasonedzgroup.com");
    });

    test(`${path} has a unique title ending in "| Seasonedz Group"`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveTitle(/Seasonedz Group$/);
    });
  }

  test("Terms and Conditions preserves specific legal references and internal links to the other real policy routes", async ({ page }) => {
    await page.goto("/terms");
    const body = page.locator(".info-page__body");
    await expect(body).toContainText("Consumer Protection Act");
    await expect(body).toContainText("Electronic Communications and Transactions Act");
    await expect(page.locator('.info-page__body a[href="/privacy-policy"]')).toHaveCount(1);
    await expect(page.locator('.info-page__body a[href="/cookies-policy"]')).toHaveCount(0);
  });

  test("Privacy Policy preserves POPIA wording and links to the real Cookie Policy route", async ({ page }) => {
    await page.goto("/privacy-policy");
    const body = page.locator(".info-page__body");
    await expect(body).toContainText("Protection of Personal Information Act 4 of 2013");
    await expect(body).toContainText("Information Regulator");
    // Was 2 before Milestone 172B.6: the new "14. Affiliate Programme"
    // section added its own genuine, non-duplicate Cookie Policy
    // cross-reference (for the seasonedz_referral local storage entry),
    // on top of the two that already existed (Cart/Wishlist/Preferences
    // and Cookies and Similar Technologies).
    await expect(page.locator('.info-page__body a[href="/cookies-policy"]')).toHaveCount(3);
  });

  test("Returns, Refunds and Exchanges Policy preserves the specific statutory time periods without alteration", async ({ page }) => {
    await page.goto("/returns-policy");
    const body = page.locator(".info-page__body");
    await expect(body).toContainText("six months after delivery");
    await expect(body).toContainText("10 business days after delivery");
    await expect(body).toContainText("seven days after receiving the goods");
    await expect(body).toContainText("five business day cooling off period");
  });

  test("Cookie Policy still opens from the existing /cookies-policy route, and /cookie-policy (singular) is not a duplicate page", async ({ page }) => {
    await page.goto("/cookies-policy");
    await expect(page.locator("h1")).toHaveText("Cookie Policy");

    const response = await page.goto("/cookie-policy");
    const status = response?.status();
    if (status && status < 400) {
      await expect(page.locator("h1")).not.toHaveText("Cookie Policy");
    }
  });

  test("Policies hub page links out to the four legal-adjacent pages with their current labels", async ({ page }) => {
    await page.goto("/policies");
    const grid = page.locator(".policies-grid");
    await expect(grid.locator('a[href="/returns-policy"]')).toContainText("Returns, Refunds and Exchanges");
    await expect(grid.locator('a[href="/terms"]')).toContainText("Terms and Conditions");
    await expect(grid.locator('a[href="/privacy-policy"]')).toContainText("Privacy Policy");
    await expect(grid.locator('a[href="/cookies-policy"]')).toContainText("Cookie Policy");
  });
});
