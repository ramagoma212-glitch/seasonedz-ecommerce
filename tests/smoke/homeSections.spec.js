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
      ".gift-card",
      ".digital-grid",
      ".marketplace-section",
      ".google-reviews",
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

    // Version 7, Milestone 167: homepage cards show a shorter display
    // title (productCard.js's displayTitle option, set from
    // home.js's HOMEPAGE_SHORT_TITLES) — the real, full database name
    // is unchanged and still used on the product page itself/SEO.
    const titles = await cards.locator(".card__title").allTextContents();
    expect(titles[0]).toContain("ABC Colouring Book for Kids");
    expect(titles[1]).toContain("New Testament Bible Colouring Book");
    expect(titles[2]).toContain("Old Testament Bible Colouring Book");

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
    await expect(section).toContainText("A4 alphabet tracing and early learning activity book");
    await expect(section.locator(".best-seller__price")).toContainText("R");
    await expect(section.locator("img")).toBeVisible();

    await expect(section.getByRole("link", { name: "View the Book" })).toHaveAttribute("href", /\/product\//);
    await expect(section.locator('[data-action="add-to-cart"]')).toBeVisible();
    await expect(section.locator(".best-seller__wishlist")).toBeVisible();
  });
});

test.describe("Thoughtful Gifts Made With Purpose section", () => {
  test("shows the heading, disclosure and exactly three real gift cards, no View More", async ({ page }) => {
    await page.goto("/");
    const section = page.locator(".gifting-section");

    await expect(page.locator("#gifting-section-heading")).toHaveText("Thoughtful Gifts Made With Purpose");
    await expect(section).toContainText("Choose a meaningful colouring book for someone special");
    await expect(section).toContainText("Gift wrapping is optional and charged separately.");

    const cards = page.locator(".gift-card");
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      await expect(card.locator(".card__image")).toBeVisible();
      await expect(card.locator(".gift-card__notice")).toHaveText("Optional gift wrapping available.");
      const viewProductLink = card.getByRole("link", { name: "View Product" });
      await expect(viewProductLink).toBeVisible();
      const href = await viewProductLink.getAttribute("href");
      expect(href).toMatch(/^\/product\//);
      // No fake "Choose Gift Options" button — no paid gift-wrapping
      // selector exists on the product page yet (see this milestone's
      // own report), so only View Product renders.
      await expect(card.getByRole("link", { name: "Choose Gift Options" })).toHaveCount(0);
    }

    // Exactly 3 real gift products are configured today, so the
    // reusable View More control must not render at all.
    await expect(page.locator('[data-action="toggle-gift-view-more"]')).toHaveCount(0);
  });

  test("has the three expected gift titles in order and no unverified gift-wrapping price", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".gift-card").first()).toBeVisible();
    const titles = await page.locator(".gift-card .card__title").allTextContents();
    expect(titles.map((t) => t.trim())).toEqual([
      "ABC Colouring Book Gift Idea",
      "New Testament Bible Colouring Book Gift Idea",
      "Old Testament Bible Colouring Book Gift Idea",
    ]);

    const bodyText = await page.locator(".gifting-section").textContent();
    expect(bodyText).not.toMatch(/gift wrapped as standard/i);
    expect(bodyText).not.toMatch(/ready to gift/i);
    expect(bodyText).not.toMatch(/free gift wrapping/i);
    expect(bodyText).not.toMatch(/gift wrapping included/i);
  });

  test("View Product opens the normal, real product page (no fake gift product/route)", async ({ page }) => {
    await page.goto("/");
    const firstCard = page.locator(".gift-card").first();
    const href = await firstCard.getByRole("link", { name: "View Product" }).getAttribute("href");
    await firstCard.getByRole("link", { name: "View Product" }).click();
    await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await expect(page.locator(".product-details")).toBeVisible();
  });

  test("gift card image area does not crop the wrapped photo (object-fit: contain)", async ({ page }) => {
    await page.goto("/");
    const image = page.locator(".gift-card .card__image").first();
    await expect(image).toBeVisible();
    const objectFit = await image.evaluate((el) => getComputedStyle(el).objectFit);
    expect(objectFit).toBe("contain");
  });
});

// Version 7, Milestone 167: "Coming Soon" cards now share the exact
// same .product-card shell as New Releases (real book cover image,
// same grid/card CSS) — see pages/home.js's renderDigitalComingSoonCard()
// — with "Digital PDF Edition" + a "Coming Soon" badge + "Notify Me"
// in place of price/stock/Add to Cart. There are 4 configured titles,
// so only 3 show initially (INITIAL_VISIBLE_COUNT via
// components/expandableGrid.js) with a real View More button to
// reveal the 4th, same reusable mechanism Digital shares with any
// future homepage section that needs it.
test.describe("Digital Colouring Books section", () => {
  test("shows 3 Coming Soon cards initially, with real book covers and Notify Me", async ({ page }) => {
    await page.goto("/");
    const grid = page.locator("#digital-grid");
    const visibleCards = grid.locator(".product-card:not([hidden])");
    await expect(visibleCards).toHaveCount(3);

    for (const card of await visibleCards.all()) {
      await expect(card.locator(".digital-card__badge")).toHaveText("Coming Soon");
      await expect(card.locator(".product-card__category")).toHaveText("Digital PDF Edition");
      await expect(card.locator("img.card__image")).toBeVisible();
      await expect(card.getByRole("button", { name: "Notify Me" })).toBeVisible();
      // Never a fake/disconnected Add to Cart button.
      await expect(card.locator('[data-action="add-to-cart"]')).toHaveCount(0);
    }
  });

  test("View More reveals the 4th digital title, View Less hides it again", async ({ page }) => {
    await page.goto("/");
    const grid = page.locator("#digital-grid");
    const viewMoreBtn = page.locator('.expandable-grid__view-more [data-action="toggle-view-more"]');

    await expect(grid.locator(".product-card:not([hidden])")).toHaveCount(3);
    await expect(viewMoreBtn).toHaveText("View More");
    await expect(viewMoreBtn).toHaveAttribute("aria-expanded", "false");

    await viewMoreBtn.click();
    await expect(grid.locator(".product-card:not([hidden])")).toHaveCount(4);
    await expect(viewMoreBtn).toHaveText("View Less");
    await expect(viewMoreBtn).toHaveAttribute("aria-expanded", "true");

    await viewMoreBtn.click();
    await expect(grid.locator(".product-card:not([hidden])")).toHaveCount(3);
    await expect(viewMoreBtn).toHaveText("View More");
  });

  test("Notify Me scrolls to the newsletter form and focuses the email field", async ({ page }) => {
    await page.goto("/");
    await page.locator("#digital-grid").locator('[data-action="scroll-to-newsletter"]').first().click();
    await expect(page.locator("#newsletter-email")).toBeFocused();
  });
});

test.describe("Also Available On section", () => {
  // Version 7, Milestone 151: Amazon.com now has a genuinely verified,
  // distinct storefront link (was "coming soon" through Milestone 150)
  // — all three marketplace cards are clickable now, none unavailable.
  test("Takealot, Amazon.co.za and Amazon.com are all clickable", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator(".marketplace-card");
    await expect(cards).toHaveCount(3);

    const clickable = page.locator(".marketplace-card[href]");
    await expect(clickable).toHaveCount(3);
    for (const link of await clickable.all()) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      const href = await link.getAttribute("href");
      expect(href).toMatch(/^https:\/\//);
    }

    await expect(page.locator(".marketplace-card--unavailable")).toHaveCount(0);

    const amazonComLink = page.locator('.marketplace-card[href*="amazon.com"]');
    await expect(amazonComLink).toHaveAttribute("aria-label", /Shop Seasonedz Group on Amazon\.com/);
  });
});

test.describe("Google Reviews section", () => {
  test("appears after Also Available On and before FAQ, with real links and no fabricated review content", async ({ page }) => {
    await page.goto("/");
    const section = page.locator(".google-reviews");
    await expect(section).toBeVisible();
    await expect(section.locator("h2")).toHaveText("Loved by Our Customers");
    await expect(section).toContainText("Your support helps our small South African brand grow.");
    await expect(section).toContainText("Read our latest customer feedback on Google.");

    // No fabricated star rating, review count, reviewer name or quote.
    const text = await section.textContent();
    expect(text).not.toMatch(/★|out of 5|reviews?\s*\(\d/i);

    // The links carry a more descriptive aria-label than their visible
    // text ("clear accessible labels" per the brief), which becomes
    // the computed accessible name — so these are matched by visible
    // text instead of by accessible name.
    const readLink = section.locator("a", { hasText: "Read Our Google Reviews" });
    const leaveLink = section.locator("a", { hasText: "Leave a Google Review" });
    await expect(readLink).toHaveAttribute("target", "_blank");
    await expect(readLink).toHaveAttribute("rel", "noopener noreferrer");
    await expect(readLink).toHaveAttribute("href", /google\.com\/maps\/place/);
    await expect(leaveLink).toHaveAttribute("target", "_blank");
    await expect(leaveLink).toHaveAttribute("rel", "noopener noreferrer");
    await expect(leaveLink).toHaveAttribute("href", /g\.page\/r\//);
  });

  test("no AggregateRating or Review structured data exists anywhere on the homepage", async ({ page }) => {
    await page.goto("/");
    const jsonLdBlocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    for (const block of jsonLdBlocks) {
      expect(block).not.toContain("AggregateRating");
      expect(block).not.toContain('"@type": "Review"');
      expect(block).not.toContain('"@type":"Review"');
    }
  });
});

test.describe("Footer Google review link", () => {
  test("shows a working 'Review us on Google' link since the review request URL is present", async ({ page }) => {
    await page.goto("/");
    const link = page.locator(".site-footer a", { hasText: "Review us on Google" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toHaveAttribute("href", /g\.page\/r\//);
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

for (const width of [1440, 1366, 1280, 1200, 1024, 768, 430, 390, 375, 360, 320]) {
  test(`no horizontal scroll on homepage at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator(".new-releases-grid")).toBeVisible();
    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalScroll).toBe(false);
  });
}

// Version 7, Milestone 151: the desktop header gained a third action
// icon (Account) alongside Wishlist/Cart, which — before this
// milestone's spacing/min-width fixes — caused the 8-item nav's
// longer labels ("Colouring Books", "Schools and Churches", etc.) to
// wrap onto 2-3 lines at every viewport from 1200px up (this site's
// .container caps at 1200px there, so a wider viewport alone never
// gave the nav more room). Checks the actual per-line height, not just
// document scrollWidth, since wrapped text doesn't trigger a
// horizontal-scroll failure on its own.
for (const width of [1440, 1366, 1280, 1200]) {
  test(`desktop header nav does not wrap onto multiple lines at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const navList = page.locator(".site-header__nav-list");
    await expect(navList).toBeVisible();
    const navListHeight = await navList.evaluate((el) => el.getBoundingClientRect().height);
    // A single line of nav text (with this site's nav-link padding)
    // is well under 40px tall; a wrapped row is 60px+.
    expect(navListHeight).toBeLessThan(40);

    const account = page.locator('.site-header a.icon-link[aria-label="Account"]');
    const wishlist = page.locator('.site-header a.icon-link[aria-label="Wishlist"]');
    const cart = page.locator('.site-header a.icon-link[aria-label="Cart"]');
    await expect(account).toBeVisible();
    await expect(wishlist).toBeVisible();
    await expect(cart).toBeVisible();

    // Recommended order: Logo -> Nav -> Search -> Account -> Wishlist -> Cart.
    const accountX = await account.evaluate((el) => el.getBoundingClientRect().x);
    const wishlistX = await wishlist.evaluate((el) => el.getBoundingClientRect().x);
    const cartX = await cart.evaluate((el) => el.getBoundingClientRect().x);
    expect(accountX).toBeLessThan(wishlistX);
    expect(wishlistX).toBeLessThan(cartX);
  });
}

// Version 7, Milestone 151: the header wordmark ("Seasonedz" text next
// to the logo mark) was crowding small phone headers — hidden at
// 320-430px while the logo image itself (the actual brand mark) stays
// fully visible, per this milestone's brief.
for (const width of [320, 360, 375, 390, 430]) {
  test(`header wordmark text is hidden but the logo mark stays visible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const logoImg = page.locator(".site-header .logo img");
    const logoText = page.locator(".site-header .logo__text");
    await expect(logoImg).toBeVisible();
    await expect(logoText).toBeHidden();
  });
}
