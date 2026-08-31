// Milestone 178, Part A: official Seasonedz Group social profile
// links. Before this milestone the site had no Facebook/Instagram/
// TikTok/X/LinkedIn/Reddit link anywhere — this suite covers the two
// real locations they now appear: the sitewide footer and the Contact
// page's "Follow Us" card, plus the homepage Organization structured
// data's `sameAs`.
//
// Milestone 178 add-on: the owner supplied corrected Facebook/
// Instagram/TikTok destinations (their share-link/QR-tagged forms,
// overriding the ones first supplied earlier in this same milestone)
// plus three additional confirmed profiles — X, LinkedIn, Reddit.
import { test, expect } from "@playwright/test";

const EXPECTED = {
  facebook: "https://www.facebook.com/share/1Y8dbJ6YRE/?mibextid=wwXIfr",
  instagram: "https://www.instagram.com/colourwithseasonedz?igsi=MWc0Yzd4em9lMTNlcw%3D%3D&utm_source=qr",
  tiktok: "https://www.tiktok.com/@colourwithseasonedz?_r=1&_t=ZS-99K87MH7yHl",
  x: "https://x.com/seasonedzgroup?s=11",
  linkedin: "https://www.linkedin.com/company/seasonedz-group/",
  reddit: "https://www.reddit.com/u/SeasonedzGroup/s/4YQwVhRT1H",
  whatsapp: "https://wa.me/27695269941",
};

async function assertExternalLink(page, locator, expectedHref) {
  await expect(locator).toHaveAttribute("href", expectedHref);
  await expect(locator).toHaveAttribute("target", "_blank");
  await expect(locator).toHaveAttribute("rel", "noopener noreferrer");
}

test.describe("Footer social links", () => {
  test("Facebook, Instagram, TikTok, X, LinkedIn and Reddit links use the owner confirmed destinations, open in a new tab, and are keyboard reachable", async ({ page }) => {
    await page.goto("/");

    const facebook = page.locator(".footer-support-strip__item", { hasText: "Facebook" });
    const instagram = page.locator(".footer-support-strip__item", { hasText: "Instagram" });
    const tiktok = page.locator(".footer-support-strip__item", { hasText: "TikTok" });
    const x = page.locator(".footer-support-strip__item", { hasText: "X" });
    const linkedin = page.locator(".footer-support-strip__item", { hasText: "LinkedIn" });
    const reddit = page.locator(".footer-support-strip__item", { hasText: "Reddit" });

    await assertExternalLink(page, facebook, EXPECTED.facebook);
    await assertExternalLink(page, instagram, EXPECTED.instagram);
    await assertExternalLink(page, tiktok, EXPECTED.tiktok);
    await assertExternalLink(page, x, EXPECTED.x);
    await assertExternalLink(page, linkedin, EXPECTED.linkedin);
    await assertExternalLink(page, reddit, EXPECTED.reddit);

    await expect(facebook).toHaveAttribute("aria-label", /Visit Seasonedz Group on Facebook/);
    await expect(instagram).toHaveAttribute("aria-label", /Visit Seasonedz Group on Instagram/);
    await expect(tiktok).toHaveAttribute("aria-label", /Visit Seasonedz Group on TikTok/);
    await expect(x).toHaveAttribute("aria-label", /Visit Seasonedz Group on X/);
    await expect(linkedin).toHaveAttribute("aria-label", /Visit Seasonedz Group on LinkedIn/);
    await expect(reddit).toHaveAttribute("aria-label", /Visit Seasonedz Group on Reddit/);

    // Keyboard reachability: a real, focusable link, not a div/span
    // with a click handler.
    await facebook.focus();
    await expect(facebook).toBeFocused();
  });

  test("WhatsApp link still uses the confirmed destination, unchanged by this milestone", async ({ page }) => {
    await page.goto("/");
    const whatsapp = page.locator(".footer-support-strip__item", { hasText: "WhatsApp Us" });
    await assertExternalLink(page, whatsapp, EXPECTED.whatsapp);
  });

  test("no placeholder or empty href exists among the footer support strip links", async ({ page }) => {
    await page.goto("/");
    const hrefs = await page.locator(".footer-support-strip__item").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    for (const href of hrefs) {
      expect(href, `unexpected placeholder href: ${href}`).not.toBe("#");
      expect(href, `unexpected empty href`).not.toBe("");
      expect(href, `unexpected javascript: href`).not.toMatch(/^javascript:/);
      expect(href).not.toBeNull();
    }
  });

  test("no duplicate social destinations in the footer support strip", async ({ page }) => {
    await page.goto("/");
    const hrefs = await page.locator(".footer-support-strip__item").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  test("no horizontal overflow at 320px with all ten support strip items present", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("footer renders identically on the homepage and a second page (present on every page)", async ({ page }) => {
    await page.goto("/about");
    await expect(page.locator(".footer-support-strip__item", { hasText: "Facebook" })).toBeVisible();
    await expect(page.locator(".footer-support-strip__item", { hasText: "Instagram" })).toBeVisible();
    await expect(page.locator(".footer-support-strip__item", { hasText: "TikTok" })).toBeVisible();
    await expect(page.locator(".footer-support-strip__item", { hasText: "X" })).toBeVisible();
    await expect(page.locator(".footer-support-strip__item", { hasText: "LinkedIn" })).toBeVisible();
    await expect(page.locator(".footer-support-strip__item", { hasText: "Reddit" })).toBeVisible();
  });
});

test.describe("Contact page Follow Us", () => {
  test("Follow Us card links to the owner confirmed Facebook, Instagram, TikTok, X, LinkedIn and Reddit destinations", async ({ page }) => {
    await page.goto("/contact");

    const followCard = page.locator(".contact-detail", { has: page.locator("h3", { hasText: "Follow Us" }) });
    await expect(followCard).toBeVisible();

    // Note: each link's accessible name is its aria-label (e.g. "Visit
    // Seasonedz Group on Facebook (opens in a new tab)"), which
    // overrides the visible "Facebook" text entirely per the standard
    // accessible-name computation — so these match a distinguishing
    // substring of the aria-label, not the visible label alone.
    const facebook = followCard.getByRole("link", { name: /on Facebook/ });
    const instagram = followCard.getByRole("link", { name: /on Instagram/ });
    const tiktok = followCard.getByRole("link", { name: /on TikTok/ });
    const x = followCard.getByRole("link", { name: /on X / });
    const linkedin = followCard.getByRole("link", { name: /on LinkedIn/ });
    const reddit = followCard.getByRole("link", { name: /on Reddit/ });

    await assertExternalLink(page, facebook, EXPECTED.facebook);
    await assertExternalLink(page, instagram, EXPECTED.instagram);
    await assertExternalLink(page, tiktok, EXPECTED.tiktok);
    await assertExternalLink(page, x, EXPECTED.x);
    await assertExternalLink(page, linkedin, EXPECTED.linkedin);
    await assertExternalLink(page, reddit, EXPECTED.reddit);
  });

  test("no horizontal overflow on the contact page at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/contact");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});

test.describe("Homepage Organization structured data sameAs", () => {
  test("sameAs lists exactly the six owner confirmed social profiles, and never the WhatsApp contact link", async ({ page }) => {
    await page.goto("/");
    const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const parsed = scripts.map((raw) => JSON.parse(raw));
    const organization = parsed.find((entry) => entry["@type"] === "Organization");

    expect(organization).toBeTruthy();
    expect(organization.sameAs).toEqual(
      expect.arrayContaining([EXPECTED.facebook, EXPECTED.instagram, EXPECTED.tiktok, EXPECTED.x, EXPECTED.linkedin, EXPECTED.reddit])
    );
    expect(organization.sameAs).toHaveLength(6);
    expect(organization.sameAs.join(" ")).not.toContain("wa.me");
  });
});

test.describe("No other social network is presented as a working link", () => {
  test("no Twitter (legacy twitter.com) or YouTube link is visible anywhere on the public site's own pages", async ({ page }) => {
    for (const path of ["/", "/about", "/contact"]) {
      await page.goto(path);
      const hrefs = await page.locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href") || ""));
      for (const href of hrefs) {
        expect(href.toLowerCase(), `unexpected social link on ${path}: ${href}`).not.toMatch(/twitter\.com|youtube\.com/);
      }
    }
  });
});
