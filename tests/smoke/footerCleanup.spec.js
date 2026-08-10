// Version 7, Milestone 171B.0.2: footer rebuilt to match an owner-
// supplied reference layout (structure/spacing only — no CUM Books
// wording, branding or copy was copied; every link/contact detail here
// is Seasonedz Group's own real, pre-existing information). Replaces
// the old four-group layout (Help / Seasonedz Group / Legal / Contact
// Us) with a support strip + three link columns (General / Orders &
// Support / Account) + an individual payment-logo grid. This suite
// guards the new structure the same way footerCleanup.spec.js guarded
// the old one.
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

test.describe("Footer reference recreation (Milestone 171B.0.2)", () => {
  test("old 'Seasonedz Group' and 'Contact Us' footer headings are gone", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer.site-footer");
    await expect(footer.locator(".footer-heading", { hasText: "Seasonedz Group" })).toHaveCount(0);
    await expect(footer.locator(".footer-heading", { hasText: "Contact Us" })).toHaveCount(0);
    await expect(footer.locator(".footer-heading", { hasText: "Help" })).toHaveCount(0);
    await expect(footer.locator(".footer-heading", { hasText: "Legal" })).toHaveCount(0);
  });

  test("new General / Orders & Support / Account headings are present", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer.site-footer");
    await expect(footer.locator(".footer-heading", { hasText: "General" })).toBeVisible();
    await expect(footer.locator(".footer-heading", { hasText: "Orders & Support" })).toBeVisible();
    await expect(footer.locator(".footer-heading", { hasText: "Account" })).toBeVisible();
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
    await expect(columns.getByRole("link", { name: "FAQ", exact: true })).toHaveAttribute("href", "/faq");
    await expect(columns.getByRole("link", { name: "Delivery Information" })).toHaveAttribute("href", "/shipping-policy");
    await expect(columns.getByRole("link", { name: "Returns Policy" })).toHaveAttribute("href", "/returns-policy");
    await expect(columns.getByRole("link", { name: "Terms & Conditions" })).toHaveAttribute("href", "/terms");
    await expect(columns.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy-policy");
    await expect(columns.getByRole("link", { name: "Track Order" })).toHaveAttribute("href", "/track-order");
    await expect(columns.getByRole("link", { name: "My Account" })).toHaveAttribute("href", "/account");
    await expect(columns.getByRole("link", { name: "Wishlist" })).toHaveAttribute("href", "/wishlist");
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
    // 4 real columns (Brand, General, Orders & Support, Account) in a
    // grid with exactly that many tracks — a clean single row, no
    // empty trailing gap.
    expect(colCount).toBe(4);
    expect(columnCount).toBe(4);
  });

  test("footer copyright line keeps real Seasonedz Group wording", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".site-footer__bottom")).toContainText("Seasonedz Group. All rights reserved.");
  });

  test("no horizontal overflow at any breakpoint (1440/1024/768/430/390/375/360/320)", async ({ page }) => {
    for (const width of [1440, 1024, 768, 430, 390, 375, 360, 320]) {
      await page.setViewportSize({ width, height: 1400 });
      await page.goto("/");
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `width=${width}`).toBeLessThanOrEqual(clientWidth + 1);
    }
  });
});
