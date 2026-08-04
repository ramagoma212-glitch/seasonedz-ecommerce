// Version 7, Milestone 168C: header "More" navigation menu, the
// product page's payment-methods/delivery-accordion purchase-area
// additions, and checkout's three delivery methods (Locker to Locker,
// Door to Door, Customer Collection). Never submits checkout or
// creates a real order — same discipline as giftWrap.spec.js.
import { test, expect } from "@playwright/test";

const PHYSICAL_SLUG = "abc-colouring-book-for-kids-with-fun-facts";

test.describe("Desktop header More menu", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("shows exactly Home / Shop / Digital Downloads / Contact / More on desktop", async ({ page }) => {
    await page.goto("/");
    const visibleLinks = page.locator(".site-header__nav-list > li > a:visible, .site-header__nav-list > li > button:visible");
    await expect(visibleLinks).toHaveCount(5);
    await expect(visibleLinks.nth(0)).toHaveText("Home");
    await expect(visibleLinks.nth(1)).toHaveText("Shop");
    await expect(visibleLinks.nth(2)).toHaveText("Digital Downloads");
    await expect(visibleLinks.nth(3)).toHaveText("Contact");
    await expect(visibleLinks.nth(4)).toContainText("More");
  });

  test("More is a real button with aria-expanded/aria-controls; opens on click, closes on second click", async ({ page }) => {
    await page.goto("/");
    const trigger = page.locator("#nav-more-trigger");
    const panel = page.locator("#nav-more-panel");

    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger.evaluate((el) => el.tagName)).resolves.toBe("BUTTON");
    await expect(panel).toBeHidden();

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
  });

  test("More panel contains real internal links to Colouring Books, Creative Supplies, Schools & Churches, About", async ({ page }) => {
    await page.goto("/");
    await page.locator("#nav-more-trigger").click();
    const panel = page.locator("#nav-more-panel");

    const links = panel.locator("a");
    await expect(links).toHaveCount(4);
    await expect(panel.locator('a:has-text("Colouring Books")')).toHaveAttribute("href", "/shop");
    await expect(panel.locator('a:has-text("Creative Supplies")')).toHaveAttribute("href", /category=markers-and-crayons/);
    await expect(panel.locator('a:has-text("Schools & Churches")')).toHaveAttribute("href", "/schools");
    await expect(panel.locator('a:has-text("About")')).toHaveAttribute("href", "/about");
  });

  test("clicking outside the open panel closes it", async ({ page }) => {
    await page.goto("/");
    const trigger = page.locator("#nav-more-trigger");
    await trigger.click();
    await expect(page.locator("#nav-more-panel")).toBeVisible();

    await page.locator("body").click({ position: { x: 10, y: 10 } });
    await expect(page.locator("#nav-more-panel")).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("Escape closes the panel and returns focus to the trigger", async ({ page }) => {
    await page.goto("/");
    const trigger = page.locator("#nav-more-trigger");
    await trigger.click();
    await expect(page.locator("#nav-more-panel")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("#nav-more-panel")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("selecting a More destination navigates and the panel is closed afterwards", async ({ page }) => {
    await page.goto("/");
    await page.locator("#nav-more-trigger").click();
    await page.locator('#nav-more-panel a:has-text("About")').click();

    await expect(page).toHaveURL(/\/about$/);
    await expect(page.locator("#nav-more-panel")).toBeHidden();
    await expect(page.locator("#nav-more-trigger")).toHaveAttribute("aria-expanded", "false");
  });

  test("Enter activates the More trigger via keyboard", async ({ page }) => {
    await page.goto("/");
    const trigger = page.locator("#nav-more-trigger");
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#nav-more-panel")).toBeVisible();
  });
});

test.describe("Mobile header keeps all 8 links directly visible", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("no More trigger on mobile; all 8 destinations are direct links in the open menu", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#nav-more-trigger")).toBeHidden();

    await page.locator(".site-header__mobile-toggle").click();
    const panel = page.locator("#site-header-collapsible");
    await expect(panel).toBeVisible();

    for (const label of ["Home", "Shop", "Colouring Books", "Creative Supplies", "Digital Downloads", "Schools & Churches", "About", "Contact"]) {
      await expect(panel.locator(`a.nav-link:has-text("${label}")`)).toBeVisible();
    }
  });
});

test.describe("Product page: payment methods and delivery accordion", () => {
  test("secure payment methods artwork is visible with descriptive alt text", async ({ page }) => {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    const img = page.locator(".product-details__payment-logos");
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute("alt", /Visa.*Mastercard.*Apple Pay.*Google Pay.*Samsung Pay.*Instant EFT.*SnapScan.*Zapper.*Payflex/s);
  });

  test("delivery/returns accordion shows all four rows, collapsed by default, expands on click", async ({ page }) => {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    const accordion = page.locator(".product-details__delivery-accordion");
    await expect(accordion).toBeVisible();

    const triggers = accordion.locator(".home-faq__trigger");
    await expect(triggers).toHaveCount(4);
    await expect(triggers.nth(0)).toContainText("Delivery Options");
    await expect(triggers.nth(1)).toContainText("Free delivery on orders of R600 or more");
    await expect(triggers.nth(2)).toContainText("Free Collection");
    await expect(triggers.nth(3)).toContainText("Returns & Exchanges");

    for (let i = 0; i < 4; i++) {
      await expect(triggers.nth(i)).toHaveAttribute("aria-expanded", "false");
    }

    await triggers.nth(0).click();
    await expect(triggers.nth(0)).toHaveAttribute("aria-expanded", "true");
    const firstPanel = page.locator(`#${await triggers.nth(0).getAttribute("aria-controls")}`);
    await expect(firstPanel).toBeVisible();
    await expect(firstPanel).toContainText("Courier Guy Locker to Locker: R100");
    await expect(firstPanel).toContainText("Courier Guy Door to Door: R120");
  });

  test("Returns & Exchanges row links to the real Returns Policy page", async ({ page }) => {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    const returnsTrigger = page.locator(".product-details__delivery-accordion .home-faq__trigger", { hasText: "Returns & Exchanges" });
    await returnsTrigger.click();
    const panelId = await returnsTrigger.getAttribute("aria-controls");
    const link = page.locator(`#${panelId} a[href="/returns-policy"]`);
    await expect(link).toBeVisible();
  });

  test("digital product does not show the delivery/returns accordion", async ({ page }) => {
    await page.route("**/api/products", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "OK",
          data: {
            products: [
              {
                id: "mock-digital",
                name: "Mock Digital Book",
                slug: "mock-digital-book",
                sku: "MOCK-1",
                category: { id: "c1", name: "Kids", slug: "kids" },
                price: 49.99,
                oldPrice: null,
                stockQuantity: 0,
                stockStatus: "In Stock",
                image: "/images/product-1.jpg",
                gallery: ["/images/product-1.jpg"],
                shortDescription: "Mock",
                description: "Mock",
                features: [],
                ageRange: "3-8 years",
                tags: [],
                ratingAverage: 0,
                reviewCount: 0,
                isFeatured: false,
                isBestSeller: false,
                isNewArrival: false,
                discountLabel: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                productType: "DIGITAL",
                digitalDownload: { displayName: "Mock", fileType: "PDF", fileSizeBytes: 100, pageCount: 1, version: null, termsNote: null },
              },
            ],
          },
        }),
      })
    );
    await page.route("**/api/categories", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { categories: [{ id: "c1", slug: "kids", name: "Kids", description: "", productCount: 1 }] } }) })
    );

    await page.goto("/product/mock-digital-book");
    await expect(page.locator(".product-details__delivery-accordion")).toHaveCount(0);
    // Payment methods still show — PayFast still processes digital purchases.
    await expect(page.locator(".product-details__payment-logos")).toBeVisible();
  });
});

test.describe("Checkout: three delivery methods", () => {
  async function addPhysicalItemAndGoToCheckout(page) {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator('[data-action="add-to-cart"]').click();
    await page.goto("/checkout");
  }

  test("all three delivery methods are presented as a real accessible radio group", async ({ page }) => {
    await addPhysicalItemAndGoToCheckout(page);
    const fieldset = page.locator("fieldset.delivery-methods");
    await expect(fieldset).toBeVisible();
    await expect(fieldset.locator('input[type=radio][name=deliveryMethod]')).toHaveCount(3);
    await expect(fieldset.locator('input[value=COURIER_LOCKER]')).toHaveCount(1);
    await expect(fieldset.locator('input[value=COURIER_DOOR]')).toHaveCount(1);
    await expect(fieldset.locator('input[value=COLLECTION]')).toHaveCount(1);
    await expect(fieldset.locator('input[value=COURIER_DOOR]')).toBeChecked();
  });

  test("Customer Collection hides the address fields and shows a Pretoria/Thohoyandou selector", async ({ page }) => {
    await addPhysicalItemAndGoToCheckout(page);
    await page.locator('input[name="deliveryMethod"][value="COLLECTION"]').check();

    await expect(page.locator("[data-delivery-address-fields]")).toBeHidden();
    const collectionFields = page.locator("[data-collection-fields]");
    await expect(collectionFields).toBeVisible();

    const citySelect = collectionFields.locator("select#collectionCity");
    const options = await citySelect.locator("option").allTextContents();
    expect(options).toContain("Pretoria");
    expect(options).toContain("Thohoyandou");

    await citySelect.selectOption("Pretoria");
    await expect(citySelect).toHaveValue("Pretoria");
  });

  test("Locker to Locker and Door to Door both require the delivery address fields", async ({ page }) => {
    await addPhysicalItemAndGoToCheckout(page);

    await page.locator('input[name="deliveryMethod"][value="COURIER_LOCKER"]').check();
    await expect(page.locator("[data-delivery-address-fields]")).toBeVisible();
    await expect(page.locator("[data-collection-fields]")).toBeHidden();
    await expect(page.locator("#street")).toHaveAttribute("required", "");

    await page.locator('input[name="deliveryMethod"][value="COURIER_DOOR"]').check();
    await expect(page.locator("[data-delivery-address-fields]")).toBeVisible();
    await expect(page.locator("#street")).toHaveAttribute("required", "");
  });

  test("submitting checkout with Collection selected but no city chosen shows a client-side validation error, never creates an order", async ({ page }) => {
    await addPhysicalItemAndGoToCheckout(page);

    await page.locator("#firstName").fill("Thandiwe");
    await page.locator("#lastName").fill("Nkosi");
    await page.locator("#email").fill("thandiwe@example.com");
    await page.locator("#phone").fill("0821234567");
    await page.locator('input[name="deliveryMethod"][value="COLLECTION"]').check();
    // Deliberately leave collectionCity empty.
    await page.locator('input[name="paymentMethod"][value="bank-transfer"]').check();

    await page.locator('#checkout-form button[type="submit"]').click();
    await expect(page.locator('[data-error-for="collectionCity"]')).not.toHaveText("");
    // Still on checkout — no order was created.
    await expect(page).toHaveURL(/\/checkout/);
  });
});
