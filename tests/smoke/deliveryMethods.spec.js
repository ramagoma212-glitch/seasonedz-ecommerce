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

  test("More panel contains real internal links to Colouring Books, the 5 real category pages, Schools & Churches, Affiliate Programme, About", async ({ page }) => {
    await page.goto("/");
    await page.locator("#nav-more-trigger").click();
    const panel = page.locator("#nav-more-panel");

    // Version 7, Milestone 175: Affiliate Programme added between
    // Schools & Churches and About — see components/header.js's own
    // NAV_LINKS.
    // Milestone 196: 4 more real /category/:slug links added (Kids,
    // Bible, Mindfulness, Bundles) alongside the pre-existing Markers &
    // Crayons one (renamed from the vague "Creative Supplies") — see
    // components/header.js's own NAV_LINKS.
    const links = panel.locator("a");
    await expect(links).toHaveCount(9);
    // Exact-text (:text-is), not the substring :has-text used elsewhere
    // in this file — "Colouring Books" is now itself a substring of
    // "Kids Colouring Books"/"Bible Colouring Books", which would
    // otherwise match more than one link and fail Playwright's strict
    // mode.
    await expect(panel.locator('a:text-is("Colouring Books")')).toHaveAttribute("href", "/shop");
    await expect(panel.locator('a:text-is("Kids Colouring Books")')).toHaveAttribute("href", "/category/kids-colouring-books");
    await expect(panel.locator('a:text-is("Bible Colouring Books")')).toHaveAttribute("href", "/category/bible-colouring-books");
    await expect(panel.locator('a:text-is("Adult & Mindfulness Colouring")')).toHaveAttribute("href", "/category/mindfulness-colouring");
    // Version 7, Milestone 171I: real /category/:slug page now, not a
    // "/shop?category=" query filter — see categoryPage.js.
    await expect(panel.locator('a:text-is("Markers & Crayons")')).toHaveAttribute("href", "/category/markers-and-crayons");
    await expect(panel.locator('a:text-is("Colouring Book Bundles")')).toHaveAttribute("href", "/category/bundles");
    await expect(panel.locator('a:has-text("Schools & Churches")')).toHaveAttribute("href", "/schools");
    await expect(panel.locator('a:has-text("Affiliate Programme")')).toHaveAttribute("href", "/account");
    await expect(panel.locator('a:has-text("About")')).toHaveAttribute("href", "/about");

    // Position: Affiliate Programme sits between Schools & Churches and About.
    const labels = await links.allTextContents();
    const schoolsIndex = labels.findIndex((label) => label.includes("Schools & Churches"));
    const affiliateIndex = labels.findIndex((label) => label.includes("Affiliate Programme"));
    const aboutIndex = labels.findIndex((label) => label.includes("About"));
    expect(affiliateIndex).toBe(schoolsIndex + 1);
    expect(aboutIndex).toBe(affiliateIndex + 1);
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

test.describe("Mobile header keeps all 13 links directly visible", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // Version 7, Milestone 175: Affiliate Programme is now a direct
  // mobile link (between Schools & Churches and About) — see
  // components/header.js's own NAV_LINKS.
  // Milestone 196: 4 more real /category/:slug links (Kids, Bible,
  // Mindfulness, Bundles) plus the renamed Markers & Crayons link
  // bring the mobile total from 9 to 13 — same NAV_LINKS array, so
  // mobile and desktop can never drift apart.
  test("no More trigger on mobile; all 13 destinations are direct links in the open menu", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#nav-more-trigger")).toBeHidden();

    await page.locator(".site-header__mobile-toggle").click();
    const panel = page.locator("#site-header-collapsible");
    await expect(panel).toBeVisible();

    for (const label of [
      "Home",
      "Shop",
      "Colouring Books",
      "Kids Colouring Books",
      "Bible Colouring Books",
      "Adult & Mindfulness Colouring",
      "Markers & Crayons",
      "Colouring Book Bundles",
      "Digital Downloads",
      "Schools & Churches",
      "Affiliate Programme",
      "About",
      "Contact",
    ]) {
      await expect(panel.locator(`a.nav-link:text-is("${label}")`)).toBeVisible();
    }
  });

  test("Affiliate Programme mobile link points at the existing account entry point, positioned between Schools & Churches and About", async ({ page }) => {
    await page.goto("/");
    await page.locator(".site-header__mobile-toggle").click();
    const panel = page.locator("#site-header-collapsible");

    await expect(panel.locator('a.nav-link:has-text("Affiliate Programme")')).toHaveAttribute("href", "/account");

    const labels = await panel.locator(".site-header__nav-list > li > a").allTextContents();
    const schoolsIndex = labels.findIndex((label) => label.includes("Schools & Churches"));
    const affiliateIndex = labels.findIndex((label) => label.includes("Affiliate Programme"));
    const aboutIndex = labels.findIndex((label) => label.includes("About"));
    expect(affiliateIndex).toBe(schoolsIndex + 1);
    expect(aboutIndex).toBe(affiliateIndex + 1);
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
    // Version 7, Milestone 171E: no method is pre-selected — the
    // customer must make an explicit choice (see checkoutPage.js's own
    // comment on why the old default-checked COURIER_DOOR was removed).
    await expect(fieldset.locator('input[type=radio][name=deliveryMethod]:checked')).toHaveCount(0);
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

  // Version 7, Milestone 168C.1: no real Courier Guy locker-picker
  // exists yet, so Locker to Locker only asks for city/province (never
  // a full street address, which would misleadingly imply it's the
  // real delivery destination) — only Door to Door needs the full
  // address, since it genuinely delivers to one.
  test("Door to Door requires the full address fields; Locker to Locker only needs city/province", async ({ page }) => {
    await addPhysicalItemAndGoToCheckout(page);

    await page.locator('input[name="deliveryMethod"][value="COURIER_DOOR"]').check();
    await expect(page.locator("[data-delivery-address-fields]")).toBeVisible();
    await expect(page.locator("[data-collection-fields]")).toBeHidden();
    await expect(page.locator("#street")).toBeVisible();
    await expect(page.locator("#street")).toHaveAttribute("required", "");
    await expect(page.locator("#city")).toHaveAttribute("required", "");

    await page.locator('input[name="deliveryMethod"][value="COURIER_LOCKER"]').check();
    await expect(page.locator("[data-delivery-address-fields]")).toBeVisible();
    await expect(page.locator("#street")).toBeHidden();
    await expect(page.locator("#city")).toBeVisible();
    await expect(page.locator("#city")).toHaveAttribute("required", "");
    await expect(page.locator("[data-locker-area-note]")).toBeVisible();
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

  test("Locker to Locker passes client-side validation with only city/province filled, and sends no street/suburb/postal code to the backend", async ({ page }) => {
    await addPhysicalItemAndGoToCheckout(page);

    // Intercepts the real order-creation call so this test can prove
    // what the client WOULD send without ever creating a real order —
    // same "never submit checkout for real" discipline as
    // giftWrap.spec.js. Responds with a syntactically valid (but
    // fake) success so the page doesn't error out.
    let capturedPayload = null;
    await page.route("**/api/orders", (route) => {
      capturedPayload = route.request().postDataJSON();
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "OK", data: { orderNumber: "SG-2026-TESTONLY" } }),
      });
    });

    await page.locator("#firstName").fill("Thandiwe");
    await page.locator("#lastName").fill("Nkosi");
    await page.locator("#email").fill("thandiwe@example.com");
    await page.locator("#phone").fill("0821234567");
    await page.locator('input[name="deliveryMethod"][value="COURIER_LOCKER"]').check();
    await page.locator("#city").fill("Pretoria");
    await page.locator("#province").selectOption("Gauteng");
    // Deliberately never fill #street/#suburb/#postalCode — they're
    // hidden and not required for Locker.
    await page.locator('input[name="paymentMethod"][value="bank-transfer"]').check();

    await page.locator('#checkout-form button[type="submit"]').click();
    await expect(page).toHaveURL(/order-confirmation/);

    expect(capturedPayload.deliveryMethod).toBe("COURIER_LOCKER");
    expect(capturedPayload.deliveryAddress.city).toBe("Pretoria");
    expect(capturedPayload.deliveryAddress.province).toBe("Gauteng");
    expect(capturedPayload.deliveryAddress.streetAddress).toBeFalsy();
    expect(capturedPayload.deliveryAddress.suburb).toBeFalsy();
    expect(capturedPayload.deliveryAddress.postalCode).toBeFalsy();
  });
});

// Version 7, Milestone 168E: informational payment-trust artwork in
// checkout (immediately under the PayFast option) and the footer —
// same owner-approved WebP already used on the product page. Purely
// informational: PayFast remains the only real payment integration,
// so these tests confirm the artwork is non-interactive plain content
// and that the existing PayFast radio option is unaffected.
test.describe("Checkout and footer payment trust (Milestone 168E)", () => {
  async function addPhysicalItemAndGoToCheckout(page) {
    await page.goto(`/product/${PHYSICAL_SLUG}`);
    await page.locator('[data-action="add-to-cart"]').click();
    await page.goto("/checkout");
  }

  test("checkout shows the PayFast trust panel immediately under the PayFast option, with heading, copy and artwork", async ({ page }) => {
    await addPhysicalItemAndGoToCheckout(page);

    const payfastLabel = page.locator(".payment-method", { hasText: "PayFast" });
    const panel = page.locator(".payment-trust-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".payment-trust-panel__heading")).toHaveText("Secure payments powered by PayFast");
    await expect(panel.locator(".payment-trust-panel__desc")).toContainText("Visa, Mastercard, Instant EFT, Apple Pay, Google Pay, Samsung Pay, SnapScan, Zapper or Payflex");

    // DOM order: the panel immediately follows the PayFast label, before Cash/Card on Delivery.
    const followingLabel = payfastLabel.locator("xpath=following-sibling::*[1]");
    await expect(followingLabel).toHaveClass(/payment-trust-panel/);

    const img = panel.locator(".payment-trust-panel__logos");
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute("src", /payment-methods-payfast\.webp/);
    await expect(img).toHaveAttribute("alt", /Visa.*Mastercard.*Apple Pay.*Google Pay.*Samsung Pay.*Instant EFT.*SnapScan.*Zapper.*Payflex/s);
  });

  test("payment trust artwork is purely informational: no button, link or input wraps or sits inside it", async ({ page }) => {
    await addPhysicalItemAndGoToCheckout(page);

    const panel = page.locator(".payment-trust-panel");
    await expect(panel.locator("button")).toHaveCount(0);
    await expect(panel.locator("a")).toHaveCount(0);
    await expect(panel.locator("input")).toHaveCount(0);
  });

  test("PayFast remains the only real payment integration: exactly 3 payment-method radios, PayFast still selectable/disabled per its own config", async ({ page }) => {
    await addPhysicalItemAndGoToCheckout(page);

    const radios = page.locator('fieldset.payment-methods input[type="radio"][name="paymentMethod"]');
    await expect(radios).toHaveCount(3);
    await expect(radios.nth(0)).toHaveValue("bank-transfer");
    await expect(radios.nth(1)).toHaveValue("payfast");
    await expect(radios.nth(2)).toHaveValue("cash-on-delivery");

    // No individual payment-method logo introduces a new selectable choice.
    await expect(page.locator('input[value*="visa" i], input[value*="mastercard" i], input[value*="applepay" i], input[value*="googlepay" i], input[value*="samsungpay" i], input[value*="snapscan" i], input[value*="zapper" i], input[value*="payflex" i]')).toHaveCount(0);
  });

  // Version 7, Milestone 171B.0.2: the footer's old single combined-
  // image "Secure Payments" trust section (.footer-payment-trust) was
  // replaced with an individual payment-logo grid — see
  // components/footer.js and tests/smoke/footerCleanup.spec.js for
  // dedicated coverage. The checkout page's own .payment-trust-panel
  // above is unaffected and still uses the combined artwork, per this
  // milestone's explicit footer-only scope.
  // Version 7, Milestone 171B.0.3: the payment logo grid moved from
  // its own full-width ".footer-payment" section (with a "We Accept"
  // heading) into a "Payment Methods" column alongside General/Orders
  // & Support/Account — see .site-footer__col--payment.
  test("footer shows the individual payment logo grid above the copyright line", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer.site-footer");
    const paymentSection = footer.locator(".site-footer__col--payment");
    await expect(paymentSection).toBeVisible();
    await expect(paymentSection.locator(".footer-heading")).toHaveText("Payment Methods");

    const grid = paymentSection.locator(".footer-payment-grid");
    await expect(grid.locator("img")).toHaveCount(9);

    // Payment section sits before the final bottom/copyright bar, not after it.
    const bottom = footer.locator(".site-footer__bottom");
    const paymentBox = await paymentSection.boundingBox();
    const bottomBox = await bottom.boundingBox();
    expect(paymentBox.y).toBeLessThan(bottomBox.y);
  });

  test("footer payment logos are informational only, not clickable elements", async ({ page }) => {
    await page.goto("/");
    const grid = page.locator(".footer-payment-grid");
    await expect(grid.locator("button")).toHaveCount(0);
    await expect(grid.locator("a")).toHaveCount(0);
  });

  for (const width of [430, 390, 375, 360, 320]) {
    test(`no horizontal scroll on checkout at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await addPhysicalItemAndGoToCheckout(page);
      await expect(page.locator(".payment-trust-panel")).toBeVisible();
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });

    test(`no horizontal scroll on footer payment section at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.locator(".site-footer__col--payment").scrollIntoViewIfNeeded();
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });
  }
});

// Shipping Policy consistency fix (small SEO/copy improvement before
// Milestone 184): the page used to state a single universal R600
// threshold for every customer, guest or signed in — stale since
// Milestone 180, Part A introduced a lower R500 threshold for
// registered customers (src/config/delivery.js's own
// REGISTERED_FREE_DELIVERY_THRESHOLD). These checks read the real
// rendered page text directly, so a future edit that quietly drops one
// of the two thresholds (or reverts to the old single-threshold
// wording) fails here rather than only being caught by a human re-read.
test.describe("Shipping Policy page: registered vs guest thresholds (consistency fix)", () => {
  test("states both the R500 registered and R600 guest free-delivery thresholds, never a single universal figure", async ({ page }) => {
    await page.goto("/shipping-policy");
    const bodyText = await page.locator(".policy-page").innerText();

    expect(bodyText).toContain("Registered customers receive free Locker or Door delivery when");
    expect(bodyText).toContain("R500");
    expect(bodyText).toContain("Guest customers receive free Locker or Door delivery when");
    expect(bodyText).toContain("R600");
    // The old, now-stale wording this fix replaces — must never reappear.
    expect(bodyText).not.toContain("applies to every customer, guest or signed in");
  });

  test("states the real R100 Locker / R120 Door fees and free Customer Collection", async ({ page }) => {
    await page.goto("/shipping-policy");
    const bodyText = await page.locator(".policy-page").innerText();

    expect(bodyText).toContain("Courier Guy Locker to Locker");
    expect(bodyText).toContain("R100");
    expect(bodyText).toContain("Courier Guy Door to Door");
    expect(bodyText).toContain("R120");
    expect(bodyText).toContain("Customer Collection");
    expect(bodyText).toMatch(/Customer Collection[\s\S]{0,20}always free/);
    expect(bodyText).toContain("Pretoria");
    expect(bodyText).toContain("Thohoyandou");
  });

  test("states gift wrapping and digital products never count toward the free-delivery threshold", async ({ page }) => {
    await page.goto("/shipping-policy");
    const bodyText = await page.locator(".policy-page").innerText();

    expect(bodyText).toContain("Gift wrapping does not count toward the free-delivery threshold");
    expect(bodyText).toContain("Digital products do not count toward the free-delivery threshold");
  });

  // Regression guard for the explicit "keep the Merchant structured data
  // unchanged" instruction — this fix only ever touches customer-facing
  // copy on this one page, never index.html's Organization block.
  test("Merchant Listing structured data (Organization hasShippingService/hasMerchantReturnPolicy) is unaffected by the Shipping Policy copy fix", async ({ page }) => {
    await page.goto("/shipping-policy");
    const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const organization = scripts.map((raw) => JSON.parse(raw)).find((entry) => entry["@type"] === "Organization");

    expect(organization.hasMerchantReturnPolicy).toEqual({
      "@type": "MerchantReturnPolicy",
      merchantReturnLink: "https://www.seasonedzgroup.co.za/returns-policy",
    });

    const rates = organization.hasShippingService.shippingConditions.map((c) => c.shippingRate.value).sort((a, b) => a - b);
    expect(rates).toEqual([0, 100, 120]);
    const freeCondition = organization.hasShippingService.shippingConditions.find((c) => c.shippingRate.value === 0);
    expect(freeCondition.orderValue.minValue).toBe(600);
    for (const condition of organization.hasShippingService.shippingConditions) {
      expect(condition.shippingDestination.addressCountry).toBe("ZA");
      expect(condition.shippingRate.currency).toBe("ZAR");
    }
  });
});
