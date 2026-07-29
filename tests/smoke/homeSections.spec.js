// Version 7, Milestone 150: full homepage redesign. Covers the
// section order and each section's own core behaviour beyond what
// hero.spec.js already covers (hero image/text/CTAs). General
// customer-journey/section-flow inspiration only from the Coco Wyo
// homepage — nothing here tests copied code, layout, or content, only
// this project's own original sections.
import { test, expect } from "@playwright/test";

test.describe("Homepage section order", () => {
  test("sections appear in the required order", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".new-releases-grid")).toBeVisible();

    const sectionSelectors = [
      ".hero",
      ".hi-friend",
      ".new-releases-grid",
      ".best-seller",
      ".collection-card",
      ".digital-grid",
      ".marketplace-section",
      ".home-faq",
      ".newsletter-form",
    ];
    const positions = await Promise.all(
      sectionSelectors.map(async (selector) => (await page.locator(selector).first().boundingBox())?.y)
    );
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  test("no blog section or empty blog placeholder on the homepage", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".new-releases-grid")).toBeVisible();
    const blogMentions = await page.locator('a[href="/blog"], a[href^="/blog/"]').count();
    expect(blogMentions).toBe(0);
  });
});

test.describe("Hi, Friend section", () => {
  test("renders the editorial introduction", async ({ page }) => {
    await page.goto("/");
    const section = page.locator(".hi-friend");
    await expect(section.locator(".hi-friend__heading")).toHaveText("Hi, friend!");
    await expect(section).toContainText("We believe creativity can make learning, faith and quiet time");
  });
});

test.describe("New Releases section", () => {
  test("shows the three required products in order with real data", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator(".new-releases-grid .product-card");
    await expect(cards).toHaveCount(3);

    // Wording differs slightly between the "local" project's static
    // fixture data ("Little Hands Big Faith...", no comma) and the
    // real backend ("Little Hands, Big Faith...", with a comma) — this
    // checks the part both share.
    const titles = await cards.locator(".card__title").allTextContents();
    expect(titles[0]).toContain("ABC Colouring Book for Kids with Fun Facts");
    expect(titles[1]).toContain("New Testament");
    expect(titles[1]).toContain("Little Hands");
    expect(titles[2]).toContain("Old Testament");
    expect(titles[2]).toContain("Little Hands");

    // Real image, price, description, View Product and Add to Cart —
    // no invented sale price, review or stock messaging.
    const first = cards.first();
    await expect(first.locator("img.card__image")).toBeVisible();
    await expect(first.locator(".product-card__price")).toContainText("R");
    await expect(first.locator(".product-card__desc")).not.toBeEmpty();
    await expect(first.getByRole("link", { name: "View Product" })).toBeVisible();
    await expect(first.locator('[data-action="add-to-cart"]')).toBeVisible();
    await expect(first.locator('[data-action="toggle-wishlist"]')).toBeVisible();
  });

  test("Add to Cart works from the homepage", async ({ page }) => {
    await page.goto("/");
    const badge = page.locator('.icon-link__badge[data-badge="cart"]');
    const before = await badge.textContent();
    await page.locator(".new-releases-grid .product-card__actions .btn--primary").first().click();
    await expect(badge).not.toHaveText(before || "0");
  });

  test("Wishlist toggle works from the homepage", async ({ page }) => {
    await page.goto("/");
    const badge = page.locator('.icon-link__badge[data-badge="wishlist"]');
    const before = await badge.textContent();
    await page.locator(".new-releases-grid [data-action='toggle-wishlist']").first().click();
    await expect(badge).not.toHaveText(before || "0");
  });
});

test.describe("Best Seller section", () => {
  test("features the ABC book with real data and working actions", async ({ page }) => {
    await page.goto("/");
    const section = page.locator(".best-seller");
    await expect(section).toContainText("ABC Colouring Book for Kids with Fun Facts");
    await expect(section).toContainText("Trace, colour and learn from A to Z");
    await expect(section.locator(".best-seller__price")).toContainText("R");
    await expect(section.locator("img")).toBeVisible();

    await expect(section.getByRole("link", { name: "View the Book" })).toHaveAttribute("href", /\/product\//);
    await expect(section.locator('[data-action="add-to-cart"]')).toBeVisible();
    await expect(section.locator(".best-seller__wishlist")).toBeVisible();
  });
});

test.describe("Shop by Collection section", () => {
  test("shows four collection cards linking to real, working category routes", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator(".collection-card");
    await expect(cards).toHaveCount(4);

    for (const card of await cards.all()) {
      const href = await card.getAttribute("href");
      expect(href).toMatch(/^\/shop\?category=/);
      await expect(card.locator("img")).toBeVisible();
      await expect(card.locator(".collection-card__link")).toHaveText("View Collection");
    }
  });

  test("collection card link navigates to a working, filtered shop page", async ({ page }) => {
    await page.goto("/");
    await page.locator(".collection-card").first().click();
    await expect(page).toHaveURL(/\/shop\?category=/);
    await expect(page.locator(".product-card").first()).toBeVisible();
  });
});

test.describe("Digital Colouring Books section", () => {
  test("shows Coming Soon and Notify Me for all four titles (no digital product records exist yet)", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator(".digital-card");
    await expect(cards).toHaveCount(4);

    for (const card of await cards.all()) {
      await expect(card.locator(".digital-card__badge")).toHaveText("Coming Soon");
      await expect(card.getByRole("button", { name: "Notify Me" })).toBeVisible();
      // Never a fake/disconnected Add to Cart button.
      await expect(card.locator('[data-action="add-to-cart"]')).toHaveCount(0);
    }
  });

  test("Notify Me scrolls to the newsletter form", async ({ page }) => {
    await page.goto("/");
    await page.locator(".digital-card").first().getByRole("button", { name: "Notify Me" }).click();
    await expect(page.locator("#newsletter-name")).toBeFocused();
  });
});

test.describe("Also Available On section", () => {
  test("Takealot and Amazon.co.za are clickable; Amazon.com shows as coming soon (no verified link)", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator(".marketplace-card");
    await expect(cards).toHaveCount(3);

    const clickable = page.locator(".marketplace-card[href]");
    await expect(clickable).toHaveCount(2);
    for (const link of await clickable.all()) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }

    const unavailable = page.locator(".marketplace-card--unavailable");
    await expect(unavailable).toHaveCount(1);
    await expect(unavailable).toContainText("Coming soon");
  });
});

test.describe("Homepage FAQ accordion", () => {
  test("uses accessible real buttons with aria-expanded/aria-controls and works with the keyboard", async ({ page }) => {
    await page.goto("/");
    const trigger = page.locator(".home-faq__trigger").first();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    const panelId = await trigger.getAttribute("aria-controls");
    await expect(page.locator(`#${panelId}`)).toBeHidden();

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(`#${panelId}`)).toBeVisible();
  });

  test("all six required questions are present", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".home-faq__trigger")).toHaveCount(6);
    await expect(page.locator(".home-faq")).toContainText("Where can I buy Seasonedz Group products?");
    await expect(page.locator(".home-faq")).toContainText("Do you deliver across South Africa?");
    await expect(page.locator(".home-faq")).toContainText("What age groups are the books suitable for?");
    await expect(page.locator(".home-faq")).toContainText("How do digital downloads work?");
    await expect(page.locator(".home-faq")).toContainText("Can schools and churches place larger orders?");
    await expect(page.locator(".home-faq")).toContainText("How can I contact Seasonedz Group?");
  });
});

test.describe("Newsletter section", () => {
  test("validates fields and shows an honest unavailable message, never a fake success", async ({ page }) => {
    await page.goto("/");
    await page.locator("#newsletter-name").fill("Test Person");
    await page.locator("#newsletter-email").fill("test@example.com");
    await page.locator(".newsletter-form button[type=submit]").click();

    const message = page.locator("[data-newsletter-message]");
    await expect(message).toBeVisible();
    await expect(message).not.toContainText(/success|subscribed|thank you/i);
    await expect(message).toContainText(/available/i);
  });

  test("rejects an invalid email without submitting", async ({ page }) => {
    await page.goto("/");
    await page.locator("#newsletter-name").fill("Test Person");
    await page.locator("#newsletter-email").fill("not-an-email");
    await page.locator(".newsletter-form button[type=submit]").click();
    await expect(page.locator("[data-newsletter-message]")).toContainText("valid email");
  });
});

test.describe("Homepage header nav and search", () => {
  test("announcement bar is present and readable", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".announcement-bar")).toContainText("Nationwide delivery across South Africa");
  });

  test("search still works from the homepage header", async ({ page }) => {
    await page.goto("/");
    await page.fill(".site-header__search input[type=search]", "ABC");
    await page.locator(".site-header__search button[type=submit]").click();
    await expect(page).toHaveURL(/\/search\?q=ABC/);
    await expect(page.locator(".product-card").first()).toBeVisible();
  });

  test("mobile menu opens, is keyboard accessible, and Escape closes it", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const toggle = page.locator(".site-header__mobile-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".site-header__nav-list")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});

for (const width of [1440, 1280, 1024, 768, 430, 390, 375, 360, 320]) {
  test(`no horizontal scroll on homepage at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator(".new-releases-grid")).toBeVisible();
    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalScroll).toBe(false);
  });
}
