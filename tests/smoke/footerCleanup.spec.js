// Version 7, Milestone 171B.0.2: footer rebuilt to match an owner-
// supplied reference layout (structure/spacing only — no CUM Books
// wording, branding or copy was copied; every link/contact detail here
// is Seasonedz Group's own real, pre-existing information). Replaced
// the old four-group layout (Help / Seasonedz Group / Legal / Contact
// Us) with a support strip + three link columns (General / Orders &
// Support / Account) + an individual payment-logo grid.
//
// Version 7, Milestone 171B.0.3: owner layout refinement. The separate
// brand/logo/description column is gone (its content isn't a
// navigation column, so there's nothing to test for there beyond its
// absence); "Contact Us" moved from a removed standalone footer column
// into a link inside Account; a real "Blog" link was added to General;
// payment logos moved from a full-width strip below the columns into
// a fourth "Payment Methods" column, in two rows on desktop/tablet and
// a 3-column grid on mobile — this suite guards the new structure.
import { test, expect } from "@playwright/test";

const PAYMENT_LOGO_NAMES = [
  "Visa",
  "Mastercard",
  "Apple Pay",
  "Google Pay",
  "Samsung Pay",
  "Instant EFT by PayFast",
  "SnapScan",
  "Zapper",
  "Payflex",
];

test.describe("Footer owner layout refinement (Milestone 171B.0.3)", () => {
  test("old 'Seasonedz Group' brand column and standalone 'Contact Us' column are gone", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer.site-footer");
    await expect(footer.locator(".footer-heading", { hasText: "Seasonedz Group" })).toHaveCount(0);
    await expect(footer.locator(".footer-heading", { hasText: "Contact Us" })).toHaveCount(0);
    await expect(footer.locator(".footer-heading", { hasText: "Help" })).toHaveCount(0);
    await expect(footer.locator(".footer-heading", { hasText: "Legal" })).toHaveCount(0);
    await expect(footer.locator(".site-footer__col--brand")).toHaveCount(0);
  });

  test("General / Orders & Support / Account / Payment Methods headings are present", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer.site-footer");
    await expect(footer.locator(".footer-heading", { hasText: "General" })).toBeVisible();
    await expect(footer.locator(".footer-heading", { hasText: "Orders & Support" })).toBeVisible();
    await expect(footer.locator(".footer-heading", { hasText: "Account", exact: true })).toBeVisible();
    await expect(footer.locator(".footer-heading", { hasText: "Payment Methods" })).toBeVisible();
  });

  test("Contact Us is a link inside Account, not its own column", async ({ page }) => {
    await page.goto("/");
    const accountHeading = page.locator(".footer-heading", { hasText: "Account", exact: true });
    const accountCol = accountHeading.locator("xpath=..");
    await expect(accountCol.getByRole("link", { name: "Contact Us" })).toHaveAttribute("href", "/contact");
  });

  test("Review us on Google link remains, using the real existing Google review URL", async ({ page }) => {
    await page.goto("/");
    // Matched by visible text, not accessible role name — the link
    // carries its own descriptive aria-label ("Leave a Google review
    // for Seasonedz Group...") which overrides its accessible name for
    // getByRole(), even though its visible text is "Review us on Google".
    const link = page.locator("footer.site-footer a", { hasText: "Review us on Google" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /^https:\/\/g\.page\//);
  });

  test("new footer link columns use only real, existing Seasonedz routes", async ({ page }) => {
    await page.goto("/");
    // Scoped to the link-column grid, not the whole footer — the
    // support strip above it also has its own "FAQ" link to the same
    // real route, which would otherwise make getByRole("link", {name:
    // "FAQ"}) match two elements against the whole footer.
    const columns = page.locator(".site-footer__inner");
    await expect(columns.getByRole("link", { name: "About Us" })).toHaveAttribute("href", "/about");
    await expect(columns.getByRole("link", { name: "Schools & Churches" })).toHaveAttribute("href", "/schools");
    await expect(columns.getByRole("link", { name: "Blog", exact: true })).toHaveAttribute("href", "/blog");
    await expect(columns.getByRole("link", { name: "FAQ", exact: true })).toHaveAttribute("href", "/faq");
    await expect(columns.getByRole("link", { name: "Delivery Information" })).toHaveAttribute("href", "/shipping-policy");
    await expect(columns.getByRole("link", { name: "Returns Policy" })).toHaveAttribute("href", "/returns-policy");
    await expect(columns.getByRole("link", { name: "Terms & Conditions" })).toHaveAttribute("href", "/terms");
    await expect(columns.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy-policy");
    await expect(columns.getByRole("link", { name: "Track Order" })).toHaveAttribute("href", "/track-order");
    await expect(columns.getByRole("link", { name: "My Account" })).toHaveAttribute("href", "/account");
    await expect(columns.getByRole("link", { name: "Wishlist" })).toHaveAttribute("href", "/wishlist");
    await expect(columns.getByRole("link", { name: "Contact Us" })).toHaveAttribute("href", "/contact");
  });

  test("footer never links to Admin", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer.site-footer");
    await expect(footer.getByRole("link", { name: /admin/i })).toHaveCount(0);
  });

  test("support strip shows real Seasonedz FAQ/WhatsApp/Email/Phone contact info", async ({ page }) => {
    await page.goto("/");
    const strip = page.locator(".footer-support-strip");
    await expect(strip).toBeVisible();
    await expect(strip.getByRole("link", { name: /FAQ/ })).toHaveAttribute("href", "/faq");
    await expect(strip.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", /wa\.me/);
    await expect(strip.getByRole("link", { name: /seasonedzgroup@outlook\.com/ })).toHaveAttribute("href", /^mailto:/);
    await expect(strip.getByRole("link", { name: /069 526 9941/ })).toHaveAttribute("href", /^tel:/);
  });

  test("all 9 payment methods are shown as individual, non-interactive, non-linked images with descriptive alt text", async ({ page }) => {
    await page.goto("/");
    const grid = page.locator(".footer-payment-grid");
    await expect(grid).toBeVisible();
    const images = grid.locator("img");
    await expect(images).toHaveCount(PAYMENT_LOGO_NAMES.length);
    for (const name of PAYMENT_LOGO_NAMES) {
      await expect(grid.locator(`img[alt="${name}"]`)).toBeVisible();
    }
    // Informational only — never wrapped in a link or button.
    await expect(grid.locator("a")).toHaveCount(0);
    await expect(grid.locator("button")).toHaveCount(0);
  });

  test("desktop header still contains a real Shop link", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator(".site-header").getByRole("link", { name: "Shop", exact: true })).toBeVisible();
  });

  test("/shop still loads with real product cards", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator(".product-card").first()).toBeVisible();
  });

  test("/contact still loads", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("checkout payment trust panel (separate from the footer) is unaffected: still uses the combined artwork", async ({ page }) => {
    // Checkout redirects to an empty cart with nothing in it — a real
    // item must be added first, same as deliveryMethods.spec.js's own
    // addPhysicalItemAndGoToCheckout helper.
    await page.goto("/product/abc-colouring-book-for-kids-with-fun-facts");
    await page.locator('[data-action="add-to-cart"]').click();
    await page.goto("/checkout");
    const logos = page.locator(".payment-trust-panel__logos");
    await expect(logos).toHaveAttribute("src", /payment-methods-payfast\.webp$/);
  });

  test("footer's own grid has no empty trailing column at desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const inner = page.locator(".site-footer__inner");
    const columnCount = await inner.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length);
    const colCount = await page.locator(".site-footer__col").count();
    // 4 real sections (General, Orders & Support, Account, Payment
    // Methods) in a grid with exactly that many tracks — a clean
    // single row, no empty trailing gap.
    expect(colCount).toBe(4);
    expect(columnCount).toBe(4);
  });

  test("footer copyright line keeps real Seasonedz Group wording, with nothing else beside it", async ({ page }) => {
    await page.goto("/");
    const bottom = page.locator(".site-footer__bottom");
    await expect(bottom).toContainText("Seasonedz Group. All rights reserved.");
    await expect(bottom.locator("a")).toHaveCount(0);
  });

  test("no horizontal overflow at any breakpoint (1440/1280/1024/768/430/390/375/360/320)", async ({ page }) => {
    for (const width of [1440, 1280, 1024, 768, 430, 390, 375, 360, 320]) {
      await page.setViewportSize({ width, height: 1400 });
      await page.goto("/");
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `width=${width}`).toBeLessThanOrEqual(clientWidth + 1);
    }
  });

  test("tablet (1024px): all four sections still distribute across one row", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/");
    const inner = page.locator(".site-footer__inner");
    const columnCount = await inner.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length);
    expect(columnCount).toBe(4);
    await expect(page.locator(".footer-payment-grid img").first()).toBeVisible();
  });

  test("tablet (768px): sections stack 2x2, payment logos stay legible", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/");
    const inner = page.locator(".site-footer__inner");
    const columnCount = await inner.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length);
    expect(columnCount).toBe(2);
    const grid = page.locator(".footer-payment-grid");
    await expect(grid.locator("img")).toHaveCount(PAYMENT_LOGO_NAMES.length);
    for (const name of PAYMENT_LOGO_NAMES) {
      await expect(grid.locator(`img[alt="${name}"]`)).toBeVisible();
    }
  });

  test("mobile (375px): sections stack in order General -> Orders & Support -> Account -> Payment Methods, payment logos in a 3-column grid", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1600 });
    await page.goto("/");
    const headings = await page.locator("footer.site-footer .footer-heading").allTextContents();
    expect(headings).toEqual(["General", "Orders & Support", "Account", "Payment Methods"]);

    const columnCount = await page.locator(".footer-payment-grid").evaluate((el) =>
      getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length
    );
    expect(columnCount).toBe(3);
    await expect(page.locator(".footer-payment-grid img")).toHaveCount(PAYMENT_LOGO_NAMES.length);
  });

  test("footer links are keyboard-focusable and no footer-specific CSS suppresses the site's global focus outline", async ({ page }) => {
    await page.goto("/");
    const firstLink = page.locator("footer.site-footer").getByRole("link").first();
    await firstLink.focus();
    await expect(firstLink).toBeFocused();
    // The site defines one global `:focus-visible` outline rule
    // (base.css). Checking it statically (rather than the live
    // computed style, which depends on the `:focus-visible` heuristic
    // actually engaging for a programmatic .focus() call — inconsistent
    // across engines) confirms nothing this milestone added overrides
    // it to `none` anywhere.
    const hasVisibleFocusRule = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of rules) {
          if (rule.selectorText?.includes(":focus-visible") && rule.style.outline && !rule.style.outline.includes("none")) {
            return true;
          }
        }
      }
      return false;
    });
    expect(hasVisibleFocusRule).toBe(true);
  });
});
