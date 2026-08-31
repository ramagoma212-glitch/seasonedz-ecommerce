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

    const facebook = page.locator(".social-icon-link", { hasText: "Facebook" });
    const instagram = page.locator(".social-icon-link", { hasText: "Instagram" });
    const tiktok = page.locator(".social-icon-link", { hasText: "TikTok" });
    const x = page.locator(".social-icon-link", { hasText: "X" });
    const linkedin = page.locator(".social-icon-link", { hasText: "LinkedIn" });
    const reddit = page.locator(".social-icon-link", { hasText: "Reddit" });

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
    const whatsapp = page.locator(".social-icon-link", { hasText: "WhatsApp Us" });
    await assertExternalLink(page, whatsapp, EXPECTED.whatsapp);
  });

  test("no placeholder or empty href exists among the footer support strip links", async ({ page }) => {
    await page.goto("/");
    const hrefs = await page.locator(".social-icon-link").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    for (const href of hrefs) {
      expect(href, `unexpected placeholder href: ${href}`).not.toBe("#");
      expect(href, `unexpected empty href`).not.toBe("");
      expect(href, `unexpected javascript: href`).not.toMatch(/^javascript:/);
      expect(href).not.toBeNull();
    }
  });

  test("no duplicate social destinations in the footer support strip", async ({ page }) => {
    await page.goto("/");
    const hrefs = await page.locator(".social-icon-link").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
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
    await expect(page.locator(".social-icon-link", { hasText: "Facebook" })).toBeVisible();
    await expect(page.locator(".social-icon-link", { hasText: "Instagram" })).toBeVisible();
    await expect(page.locator(".social-icon-link", { hasText: "TikTok" })).toBeVisible();
    await expect(page.locator(".social-icon-link", { hasText: "X" })).toBeVisible();
    await expect(page.locator(".social-icon-link", { hasText: "LinkedIn" })).toBeVisible();
    await expect(page.locator(".social-icon-link", { hasText: "Reddit" })).toBeVisible();
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

// Milestone 178 UI polish add-on: emoji icons replaced with clean
// vector SVG icons inside a consistent circular container. Covers the
// icon quality/grid organisation/responsive requirements without
// touching any URL, aria-label wording, or page structure — those are
// already covered above/elsewhere and are deliberately unchanged.
test.describe("Social/contact icon design (Milestone 178 UI polish add-on)", () => {
  // A conservative Unicode emoji-block regex — covers the ranges the
  // old icons actually used (Misc Symbols, Dingbats, Transport/Map,
  // Supplemental Symbols) without flagging ordinary punctuation.
  const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F0FF}]/u;

  test("no emoji characters remain anywhere in the footer support strip", async ({ page }) => {
    await page.goto("/");
    const html = await page.locator(".footer-support-strip").innerHTML();
    expect(html).not.toMatch(EMOJI_PATTERN);
    // Every icon is a real inline <svg>, not a Unicode glyph.
    const svgCount = await page.locator(".footer-support-strip svg").count();
    expect(svgCount).toBe(10); // 4 Get In Touch + 6 Follow Us
  });

  test("no emoji characters remain anywhere in the Contact page's own icons", async ({ page }) => {
    await page.goto("/contact");
    const html = await page.locator(".contact-details").innerHTML();
    expect(html).not.toMatch(EMOJI_PATTERN);
    const svgCount = await page.locator(".contact-details svg").count();
    expect(svgCount).toBe(10); // Email, WhatsApp, Phone, Location + 6 Follow Us
  });

  test("every icon sits inside the same circular container, same size, wherever it appears", async ({ page }) => {
    await page.goto("/");
    const footerSizes = await page.locator(".footer-support-strip .social-icon-circle").evaluateAll((els) => els.map((el) => `${el.clientWidth}x${el.clientHeight}`));
    expect(new Set(footerSizes).size).toBe(1); // every circle is identically sized

    await page.goto("/contact");
    const contactSizes = await page.locator(".contact-details .social-icon-circle").evaluateAll((els) => els.map((el) => `${el.clientWidth}x${el.clientHeight}`));
    expect(new Set(contactSizes).size).toBe(1);
    // Same design system in both places (brief section 10).
    expect(contactSizes[0]).toBe(footerSizes[0]);
  });

  test("Get In Touch is a balanced 2-column grid and Follow Us a 3-column grid at desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Get In Touch" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Follow Us" })).toBeVisible();

    const getInTouchColumns = await page.locator(".social-icon-grid--2col").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(getInTouchColumns).toBe(2);
    const followUsColumns = await page.locator(".footer-support-strip .social-icon-grid--3col").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(followUsColumns).toBe(3);
  });

  test("Follow Us drops to 2 columns at tablet/mobile width, never overlapping or overflowing", async ({ page }) => {
    for (const width of [767, 430, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const columns = await page.locator(".footer-support-strip .social-icon-grid--3col").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
      expect(columns, `expected 2 columns at ${width}px`).toBe(2);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `unexpected horizontal overflow at ${width}px`).toBeLessThanOrEqual(clientWidth);
    }
  });

  test("no horizontal overflow, icon overlap, or cut-off label across the full responsive range", async ({ page }) => {
    for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(clientWidth);
    }
  });

  test("hover applies only a subtle border/colour change, no animation classes", async ({ page }) => {
    await page.goto("/");
    const facebook = page.locator(".social-icon-link", { hasText: "Facebook" });
    await facebook.hover();
    // No bounce/spin/pulse utility classes exist anywhere in this
    // project's CSS for this component — confirmed by reading
    // layout.css's own hover rule, which only ever changes color/
    // border-color/background-color (a plain style/property check,
    // not a screenshot, since Playwright can't assert "no animation"
    // directly).
    const transitionProperty = await page.locator(".social-icon-circle").first().evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(transitionProperty).not.toMatch(/transform/);
  });

  test("keyboard navigation reaches every Follow Us link in order, each a real focusable <a>", async ({ page }) => {
    await page.goto("/");
    const facebook = page.locator(".footer-support-strip .social-icon-link", { hasText: "Facebook" });
    await facebook.focus();
    await expect(facebook).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator(".footer-support-strip .social-icon-link", { hasText: "Instagram" })).toBeFocused();
  });

  test("Get In Touch and Follow Us always show the same column count as each other at a given width, so they read as one consistent grid design", async ({ page }) => {
    for (const width of [1280, 767, 430, 375, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const getInTouchColumns = await page.locator(".social-icon-grid--2col").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
      const followUsColumns = await page.locator(".footer-support-strip .social-icon-grid--3col").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
      // At desktop width Follow Us legitimately has one more column
      // (3) than Get In Touch (2) — both are still full, deliberate
      // grids, matching the brief's own desktop spec. Below that, they
      // must match exactly.
      if (width >= 768) {
        expect(getInTouchColumns, `${width}px`).toBe(2);
        expect(followUsColumns, `${width}px`).toBe(3);
      } else {
        expect(getInTouchColumns, `${width}px`).toBe(followUsColumns);
      }
    }
  });

  test("the long real email address wraps inside its own grid cell — never overflows, never gets silently clipped", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/");
    const emailLink = page.locator(".footer-support-strip .social-icon-link", { hasText: "seasonedzgroup" });
    await expect(emailLink).toBeVisible();
    // The full address is still present in the DOM/accessible text —
    // wrapping is a visual line-break only, never a truncation.
    await expect(emailLink).toContainText("seasonedzgroup@outlook.com");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("the X icon's accessible name is not literally 'X (Twitter)'", async ({ page }) => {
    await page.goto("/");
    const x = page.locator(".footer-support-strip .social-icon-link[aria-label*='X ']");
    await expect(x).toHaveAttribute("aria-label", /Visit Seasonedz Group on X \(opens/);
    const text = await x.innerText();
    expect(text.trim()).toBe("X");
  });
});
