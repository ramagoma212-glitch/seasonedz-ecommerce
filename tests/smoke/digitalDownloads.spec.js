// Version 7, Milestone 152: secure digital downloads. Admin pages
// require a logged-in session this "local" project build has no real
// backend to provide — every admin API call here is mocked via
// page.route(), the same pattern tests/smoke/richTextDescription.spec.js
// already uses. Order/payment-dependent access-control logic (paid
// gating, wrong-customer/guest-token checks, Courier Guy digital-only
// gating) is intentionally NOT exercised here against a real backend —
// doing so would require creating real Order/Payment rows, which this
// milestone explicitly forbids; that logic is covered by direct code
// review and a one-off Prisma verification script (run once, then
// deleted) documented in this milestone's own final report.
import { test, expect } from "@playwright/test";

const MOCK_CATEGORIES = [{ id: "cat-1", slug: "kids-colouring-books", name: "Kids Colouring Books", description: "", productCount: 1 }];

async function mockAdminAuth(page) {
  await page.route("**/api/admin/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { id: "admin-1", email: "owner@example.invalid" } }) })
  );
  await page.route("**/api/categories", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { categories: MOCK_CATEGORIES } }) })
  );
}

// Shape matching backend/src/services/adminProduct.service.ts's admin
// list/detail output — used only by the admin-panel tests below.
const MOCK_ADMIN_DIGITAL_PRODUCT = {
  id: "prod-digital-1",
  name: "Mock Digital Colouring Book",
  slug: "mock-digital-colouring-book",
  sku: "MOCK-DIGITAL-1",
  shortDescription: "A mock digital product for testing.",
  description: "A mock digital product for testing.",
  price: 49.99,
  oldPrice: null,
  stockQuantity: 0,
  lowStockThreshold: 5,
  status: "ACTIVE",
  categoryId: "cat-1",
  category: { id: "cat-1", name: "Kids Colouring Books", slug: "kids-colouring-books" },
  ageRange: "3-8 years",
  features: [],
  discountLabel: null,
  isFeatured: false,
  isBestSeller: false,
  isNewArrival: false,
  productType: "DIGITAL",
  digitalTermsNote: null,
  downloadEnabled: true,
  hasDigitalFile: true,
  digitalFileMissingWarning: false,
  images: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Shape matching backend/src/services/product.service.ts's PUBLIC
// ProductOutput (GET /api/products) — used only by the storefront
// (shop/cart/checkout/homepage) tests below. Deliberately a different
// shape from the admin mock above — the two backend endpoints really
// do return different shapes, and mixing them up here would silently
// mask a frontend mapping bug instead of catching one.
const MOCK_PUBLIC_DIGITAL_PRODUCT = {
  id: "mock-digital-colouring-book",
  name: "Mock Digital Colouring Book",
  slug: "mock-digital-colouring-book",
  sku: "MOCK-DIGITAL-1",
  category: { id: "cat-1", name: "Kids Colouring Books", slug: "kids-colouring-books" },
  price: 49.99,
  oldPrice: null,
  stockQuantity: 0,
  stockStatus: "In Stock",
  image: "/images/product-1.jpg",
  gallery: ["/images/product-1.jpg"],
  shortDescription: "A mock digital product for testing.",
  description: "A mock digital product for testing.",
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
  digitalDownload: {
    displayName: "Mock Digital Colouring Book (PDF)",
    fileType: "PDF",
    fileSizeBytes: 51200,
    pageCount: 8,
    version: null,
    termsNote: null,
  },
};

test.describe("Admin: digital product management", () => {
  test("admin can create a digital product draft", async ({ page }) => {
    await mockAdminAuth(page);

    let capturedPayload = null;
    await page.route("**/api/admin/products", (route) => {
      if (route.request().method() === "POST") {
        capturedPayload = route.request().postDataJSON();
        route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ success: true, message: "Product created successfully", data: { ...MOCK_ADMIN_DIGITAL_PRODUCT, status: "DRAFT" } }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto("/admin/products/new");
    await page.locator("#productName").fill("Test Digital Product");
    await page.locator("#productCategory").selectOption("cat-1");
    await page.locator("#productPrice").fill("49.99");
    await page.locator("#productStock").fill("0");
    await page.locator("#productSku").fill("TEST-DIGITAL-1");
    await page.locator("#productType").selectOption("DIGITAL");
    await expect(page.locator("[data-admin-digital-fields]")).toBeVisible();

    await page.locator("[data-admin-product-form] button[type=submit]").click();
    await expect.poll(() => capturedPayload).not.toBeNull();
    expect(capturedPayload.productType).toBe("DIGITAL");
    expect(capturedPayload.status).toBe("DRAFT");
  });

  test("admin cannot publish a digital product without a file (client-side, no network call)", async ({ page }) => {
    await mockAdminAuth(page);

    let postWasCalled = false;
    await page.route("**/api/admin/products", (route) => {
      if (route.request().method() === "POST") postWasCalled = true;
      route.continue();
    });

    await page.goto("/admin/products/new");
    await page.locator("#productName").fill("Test Digital Product");
    await page.locator("#productCategory").selectOption("cat-1");
    await page.locator("#productPrice").fill("49.99");
    await page.locator("#productStock").fill("0");
    await page.locator("#productSku").fill("TEST-DIGITAL-2");
    await page.locator("#productType").selectOption("DIGITAL");
    await page.locator("#productStatus").selectOption("ACTIVE");

    await page.locator("[data-admin-product-form] button[type=submit]").click();
    await expect(page.locator("[data-admin-product-banner]")).toBeVisible();
    await expect(page.locator("[data-admin-product-banner]")).toContainText("digital file has been uploaded");
    expect(postWasCalled).toBe(false);
  });

  test("physical product create still works and does not require a digital file", async ({ page }) => {
    await mockAdminAuth(page);

    let capturedPayload = null;
    await page.route("**/api/admin/products", (route) => {
      if (route.request().method() === "POST") {
        capturedPayload = route.request().postDataJSON();
        route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ success: true, message: "Product created successfully", data: { ...MOCK_ADMIN_DIGITAL_PRODUCT, productType: "PHYSICAL", status: "ACTIVE" } }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto("/admin/products/new");
    await page.locator("#productName").fill("Test Physical Product");
    await page.locator("#productCategory").selectOption("cat-1");
    await page.locator("#productPrice").fill("99.99");
    await page.locator("#productStock").fill("10");
    await page.locator("#productSku").fill("TEST-PHYSICAL-1");
    await page.locator("#productStatus").selectOption("ACTIVE");
    // productType left at its default (Physical) — digital fields never shown.
    await expect(page.locator("[data-admin-digital-fields]")).toBeHidden();

    await page.locator("[data-admin-product-form] button[type=submit]").click();
    await expect.poll(() => capturedPayload).not.toBeNull();
    expect(capturedPayload.productType).toBe("PHYSICAL");
    expect(capturedPayload.status).toBe("ACTIVE");
  });

  test("admin can upload a digital file for an existing digital product", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/products/prod-digital-1", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { ...MOCK_ADMIN_DIGITAL_PRODUCT, status: "DRAFT" } }) })
    );
    await page.route("**/api/admin/products/prod-digital-1/images", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { images: [] } }) })
    );
    await page.route("**/api/admin/products/prod-digital-1/digital-asset", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { digitalAsset: null } }) });
      } else if (route.request().method() === "POST") {
        route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "Digital file uploaded successfully",
            data: { digitalAsset: { id: "asset-1", displayName: "My Book (PDF)", mimeType: "application/pdf", fileSizeBytes: 102400, pageCount: 10, version: null, isActive: true } },
          }),
        });
      }
    });

    await page.goto("/admin/products/prod-digital-1/edit");
    await expect(page.locator("[data-admin-digital-asset-upload-form]")).toBeVisible();

    await page.setInputFiles("#digitalAssetFile", { name: "book.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
    await page.locator("#digitalAssetDisplayName").fill("My Book (PDF)");
    await page.locator("[data-admin-digital-asset-upload-form] button[type=submit]").click();

    // Success re-renders the whole edit page (same pattern as product
    // images) — the pending-message banner confirms the request
    // completed without a client-side validation error blocking it.
    await expect(page.locator(".form-banner--success")).toContainText("Digital file uploaded successfully");
  });

  test("admin blocks an unsafe file extension on the digital upload form", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/products/prod-digital-1", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { ...MOCK_ADMIN_DIGITAL_PRODUCT, status: "DRAFT" } }) })
    );
    await page.route("**/api/admin/products/prod-digital-1/images", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { images: [] } }) })
    );
    let postWasCalled = false;
    await page.route("**/api/admin/products/prod-digital-1/digital-asset", (route) => {
      if (route.request().method() === "POST") {
        postWasCalled = true;
        route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ success: false, message: "Should never be called" }) });
      } else {
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { digitalAsset: null } }) });
      }
    });

    await page.goto("/admin/products/prod-digital-1/edit");
    await page.setInputFiles("#digitalAssetFile", { name: "malware.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ fake exe") });
    await page.locator("#digitalAssetDisplayName").fill("Not allowed");
    await page.locator("[data-admin-digital-asset-upload-form] button[type=submit]").click();

    await expect(page.locator("[data-admin-digital-asset-upload-banner]")).toBeVisible();
    await expect(page.locator("[data-admin-digital-asset-upload-banner]")).toContainText("Unsupported file type");
    expect(postWasCalled).toBe(false);
  });

  test("admin can replace an existing digital file", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/products/prod-digital-1", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { ...MOCK_ADMIN_DIGITAL_PRODUCT, status: "ACTIVE" } }) })
    );
    await page.route("**/api/admin/products/prod-digital-1/images", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { images: [] } }) })
    );
    await page.route("**/api/admin/products/prod-digital-1/digital-asset", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, message: "OK", data: { digitalAsset: { id: "asset-1", displayName: "Old File", mimeType: "application/pdf", fileSizeBytes: 1000, pageCount: null, version: null, isActive: true } } }),
        });
      } else if (route.request().method() === "POST") {
        route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ success: true, message: "Digital file uploaded successfully", data: { digitalAsset: { id: "asset-1", displayName: "New File", mimeType: "application/pdf", fileSizeBytes: 2000, pageCount: null, version: "v2", isActive: true } } }),
        });
      }
    });

    await page.goto("/admin/products/prod-digital-1/edit");
    await expect(page.locator("[data-admin-digital-asset-card]")).toContainText("Old File");
    await expect(page.locator("[data-admin-digital-asset-upload-form] h3")).toHaveText("Replace Digital File");

    await page.setInputFiles("#digitalAssetFile", { name: "new-book.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 new") });
    await page.locator("#digitalAssetDisplayName").fill("New File");
    await page.locator("[data-admin-digital-asset-upload-form] button[type=submit]").click();
    await expect(page.locator(".form-banner--success")).toContainText("Digital file uploaded successfully");
  });

  test("admin product list shows Physical/Digital type and file-attached status", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/products?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "OK",
          data: { products: [MOCK_ADMIN_DIGITAL_PRODUCT], total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      })
    );

    await page.goto("/admin/products");
    await expect(page.locator(".admin-table")).toContainText("Digital");
    await expect(page.locator(".admin-table")).toContainText("File attached");
  });
});

test.describe("Digital product storefront display", () => {
  async function mockCatalogWithDigitalProduct(page) {
    await page.route("**/api/products", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { products: [MOCK_PUBLIC_DIGITAL_PRODUCT] } }) })
    );
    await page.route("**/api/categories", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { categories: MOCK_CATEGORIES } }) })
    );
  }

  test("digital product shows a Digital Download badge on its card and detail page", async ({ page }) => {
    await mockCatalogWithDigitalProduct(page);

    await page.goto("/shop");
    await expect(page.locator(".product-card").first()).toBeVisible();
    await expect(page.locator(".product-card__badge--digital")).toContainText("Digital Download");

    await page.goto(`/product/${MOCK_PUBLIC_DIGITAL_PRODUCT.slug}`);
    await expect(page.locator(".product-details__digital-badge")).toContainText("Digital Download");
    await expect(page.locator(".product-details__description")).toContainText("No physical book will be delivered");
  });

  test("digital product can be added to cart and shows Digital Download label", async ({ page }) => {
    await mockCatalogWithDigitalProduct(page);

    await page.goto("/shop");
    await page.locator('[data-action="add-to-cart"]').first().click();
    await expect(page.locator('[data-badge="cart"]')).toHaveText("1");

    await page.goto("/cart");
    await expect(page.locator(".cart-item__digital-badge")).toContainText("Digital Download");
  });

  test("digital-only cart shows the no-physical-delivery message and R0 delivery fee", async ({ page }) => {
    await mockCatalogWithDigitalProduct(page);

    await page.goto("/shop");
    await page.locator('[data-action="add-to-cart"]').first().click();
    await page.goto("/cart");
    await expect(page.locator(".cart-composition-notice")).toContainText("No physical delivery is required for digital downloads");

    // Version 7, Milestone 152B: a digital-only cart is never charged a
    // delivery fee, and the note explains why (not a registered-account
    // discount) — see components/orderSummary.js's getDeliveryNote().
    const deliveryRow = page.locator(".order-summary__row", { hasText: "Delivery" });
    await expect(deliveryRow).toContainText("Free");
    await expect(page.locator(".order-summary__note")).toContainText("No delivery is needed");

    await page.goto("/checkout");
    await expect(page.locator(".cart-composition-notice")).toContainText("No physical delivery is required for digital downloads");
    await expect(page.locator(".order-summary__row", { hasText: "Delivery" })).toContainText("Free");
  });

  test("mixed cart (physical + digital) shows the combined delivery message and correct total", async ({ page }) => {
    const MOCK_PHYSICAL_PRODUCT = {
      ...MOCK_PUBLIC_DIGITAL_PRODUCT,
      id: "mock-physical-book",
      slug: "mock-physical-book",
      name: "Mock Physical Book",
      productType: "PHYSICAL",
      digitalDownload: null,
      stockQuantity: 10,
      price: 100,
    };

    await page.route("**/api/products", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "OK", data: { products: [MOCK_PUBLIC_DIGITAL_PRODUCT, MOCK_PHYSICAL_PRODUCT] } }),
      })
    );
    await page.route("**/api/categories", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { categories: MOCK_CATEGORIES } }) })
    );

    await page.goto("/shop");
    const addButtons = page.locator('[data-action="add-to-cart"]');
    await addButtons.nth(0).click();
    await addButtons.nth(1).click();
    await expect(page.locator('[data-badge="cart"]')).toHaveText("2");

    await page.goto("/cart");
    await expect(page.locator(".cart-composition-notice")).toContainText("Physical items will be delivered. Digital items will be available after payment.");

    // Version 7, Milestone 152 (test 12): PayFast/checkout total math is
    // unchanged by digital items — subtotal (49.99 + 100) + the
    // existing guest delivery fee (R80) must still add up correctly.
    const expectedSubtotal = MOCK_PUBLIC_DIGITAL_PRODUCT.price + MOCK_PHYSICAL_PRODUCT.price;
    await expect(page.locator(".order-summary__row", { hasText: "Subtotal" })).toContainText(expectedSubtotal.toFixed(2));
    await expect(page.locator(".order-summary__row--total")).toContainText((expectedSubtotal + 80).toFixed(2));

    // Version 7, Milestone 152B (fix 3): a mixed cart is still charged
    // the normal delivery fee, precisely because it contains a
    // physical item — never silently waived just because a digital
    // item is also present.
    await expect(page.locator(".order-summary__row", { hasText: "Delivery" })).toContainText("R80.00");
  });
});

test.describe("Homepage digital section", () => {
  test("keeps Coming Soon when no real digital products exist", async ({ page }) => {
    // Default catalog (no route mocking) — the static fallback data has
    // no DIGITAL products, so this exercises the real "no real records
    // yet" path.
    await page.goto("/");
    await expect(page.locator(".digital-card__badge").first()).toHaveText("Coming Soon");
  });

  test("shows real product cards once an active digital product exists", async ({ page }) => {
    await page.route("**/api/products", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { products: [MOCK_PUBLIC_DIGITAL_PRODUCT] } }) })
    );
    await page.route("**/api/categories", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { categories: MOCK_CATEGORIES } }) })
    );

    await page.goto("/");
    const digitalSection = page.locator(".digital-grid");
    await expect(digitalSection.locator(".product-card")).toHaveCount(1);
    await expect(digitalSection.locator(".digital-card")).toHaveCount(0);
  });
});

test.describe("Guest secure-token digital downloads", () => {
  test("invalid or expired token shows a friendly error, never a raw storage path", async ({ page }) => {
    await page.route("**/api/downloads/guest/*", (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, message: "This download link is invalid or has expired." } ) })
    );

    await page.goto("/download/invalid-token-value");
    await expect(page.locator(".form-banner--error")).toContainText("invalid or has expired");
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("digital-products");
    expect(bodyText).not.toContain("storagePath");
  });

  test("valid token shows purchased digital items with a working download button", async ({ page }) => {
    await page.route("**/api/downloads/guest/valid-token-value", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "OK",
          data: { items: [{ orderItemId: "item-1", productName: "Mock Digital Book", displayName: "Mock Digital Book (PDF)", fileType: "PDF", fileSizeBytes: 51200, pageCount: 5, version: null, downloadCount: 0, lastDownloadedAt: null }] },
        }),
      })
    );
    await page.route("**/api/downloads/guest/valid-token-value/item-1", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { url: "https://example.invalid/signed-url", expiresInSeconds: 300 } }) })
    );

    await page.goto("/download/valid-token-value");
    await expect(page.locator(".digital-download-item")).toContainText("Mock Digital Book");
    await expect(page.locator('[data-action="request-download"]')).toBeVisible();
  });
});

test.describe("Account order detail: digital downloads", () => {
  test("shows a download button for a paid order's digital item", async ({ page }) => {
    await page.route("**/api/customers/orders/SG-2026-TEST1", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "OK",
          data: {
            order: {
              orderNumber: "SG-2026-TEST1",
              status: "CONFIRMED",
              paymentStatus: "PAID",
              paymentMethod: "PAYFAST",
              subtotal: 49.99,
              deliveryFee: 0,
              discountTotal: 0,
              total: 49.99,
              createdAt: new Date().toISOString(),
              customer: { firstName: "Test", lastName: "Customer", email: "test@example.invalid", phone: "0821234567" },
              deliveryAddress: { streetAddress: "1 Test St", suburb: "Testville", city: "Pretoria", province: "Gauteng", postalCode: "0001", country: "South Africa", deliveryNotes: null },
              items: [{ productName: "Mock Digital Book", productSlug: "mock-digital-book", quantity: 1, unitPrice: 49.99, lineTotal: 49.99, imageUrl: null }],
              shipping: null,
              hasPhysicalItems: false,
              hasDigitalItems: true,
              isDigitalOnly: true,
            },
          },
        }),
      })
    );
    await page.route("**/api/customers/orders/SG-2026-TEST1/downloads", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "OK",
          data: { items: [{ orderItemId: "item-1", productName: "Mock Digital Book", displayName: "Mock Digital Book (PDF)", fileType: "PDF", fileSizeBytes: 51200, pageCount: 5, version: null, downloadCount: 0, lastDownloadedAt: null }] },
        }),
      })
    );

    await page.goto("/account/orders/SG-2026-TEST1");
    await expect(page.locator(".digital-downloads-card")).toContainText("Mock Digital Book");
    await expect(page.locator('[data-action="request-download"]')).toBeVisible();
    // Version 7, Milestone 157: digital-only paid order shows the
    // digital-only notice, never a courier tracking card.
    await expect(page.locator(".track-order-page__body")).toContainText("This is a digital download order. No courier delivery is required.");
    await expect(page.locator(".track-order-page__body")).not.toContainText("Tracking Number");
  });

  test("digital-only PENDING order shows pending download guidance, no download button", async ({ page }) => {
    await page.route("**/api/customers/orders/SG-2026-TEST2", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "OK",
          data: {
            order: {
              orderNumber: "SG-2026-TEST2",
              status: "PENDING",
              paymentStatus: "PENDING",
              paymentMethod: "PAYFAST",
              subtotal: 49.99,
              deliveryFee: 0,
              discountTotal: 0,
              total: 49.99,
              createdAt: new Date().toISOString(),
              customer: { firstName: "Test", lastName: "Customer", email: "test@example.invalid", phone: "0821234567" },
              deliveryAddress: { streetAddress: "1 Test St", suburb: "Testville", city: "Pretoria", province: "Gauteng", postalCode: "0001", country: "South Africa", deliveryNotes: null },
              items: [{ productName: "Mock Digital Book", productSlug: "mock-digital-book", quantity: 1, unitPrice: 49.99, lineTotal: 49.99, imageUrl: null }],
              shipping: null,
              hasPhysicalItems: false,
              hasDigitalItems: true,
              isDigitalOnly: true,
            },
          },
        }),
      })
    );
    // Unpaid order — backend correctly returns an empty downloads list.
    await page.route("**/api/customers/orders/SG-2026-TEST2/downloads", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { items: [] } }) })
    );

    await page.goto("/account/orders/SG-2026-TEST2");
    await expect(page.locator(".track-order-page__body")).toContainText("This is a digital download order. No courier delivery is required.");
    await expect(page.locator(".track-order-page__body")).toContainText("Downloads unlock automatically once payment is confirmed");
    await expect(page.locator('[data-action="request-download"]')).toHaveCount(0);
  });

  test("mixed order (physical + digital) shows both delivery and digital downloads", async ({ page }) => {
    await page.route("**/api/customers/orders/SG-2026-TEST3", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "OK",
          data: {
            order: {
              orderNumber: "SG-2026-TEST3",
              status: "CONFIRMED",
              paymentStatus: "PAID",
              paymentMethod: "PAYFAST",
              subtotal: 99.99,
              deliveryFee: 80,
              discountTotal: 0,
              total: 179.99,
              createdAt: new Date().toISOString(),
              customer: { firstName: "Test", lastName: "Customer", email: "test@example.invalid", phone: "0821234567" },
              deliveryAddress: { streetAddress: "1 Test St", suburb: "Testville", city: "Pretoria", province: "Gauteng", postalCode: "0001", country: "South Africa", deliveryNotes: null },
              items: [
                { productName: "Mock Physical Book", productSlug: "mock-physical-book", quantity: 1, unitPrice: 50, lineTotal: 50, imageUrl: null },
                { productName: "Mock Digital Book", productSlug: "mock-digital-book", quantity: 1, unitPrice: 49.99, lineTotal: 49.99, imageUrl: null },
              ],
              shipping: { status: "NOT_STARTED", courierName: null, trackingNumber: null, trackingUrl: null, estimatedDelivery: null, shippedAt: null, deliveredAt: null },
              hasPhysicalItems: true,
              hasDigitalItems: true,
              isDigitalOnly: false,
            },
          },
        }),
      })
    );
    await page.route("**/api/customers/orders/SG-2026-TEST3/downloads", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "OK",
          data: { items: [{ orderItemId: "item-2", productName: "Mock Digital Book", displayName: "Mock Digital Book (PDF)", fileType: "PDF", fileSizeBytes: 51200, pageCount: 5, version: null, downloadCount: 0, lastDownloadedAt: null }] },
        }),
      })
    );

    await page.goto("/account/orders/SG-2026-TEST3");
    // Both sections present: physical delivery card AND digital downloads card.
    await expect(page.locator(".track-order-page__body")).toContainText("Delivery");
    await expect(page.locator(".digital-downloads-card")).toContainText("Mock Digital Book");
    await expect(page.locator('[data-action="request-download"]')).toBeVisible();
    await expect(page.locator(".track-order-page__body")).not.toContainText("This is a digital download order. No courier delivery is required.");
  });

  test("historical digital-only order with an old Shipping row still hides tracking", async ({ page }) => {
    // Version 7, Milestone 157: a digital-only order created BEFORE
    // this milestone may still have an old Shipping row in the
    // database. isDigitalOnly is derived fresh from order.items on
    // every request, never from whether a Shipping row happens to
    // exist — so the UI must still hide/replace tracking even when the
    // backend mock includes a non-null `shipping` object here.
    await page.route("**/api/customers/orders/SG-2026-TEST4", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "OK",
          data: {
            order: {
              orderNumber: "SG-2026-TEST4",
              status: "CONFIRMED",
              paymentStatus: "PAID",
              paymentMethod: "PAYFAST",
              subtotal: 49.99,
              deliveryFee: 0,
              discountTotal: 0,
              total: 49.99,
              createdAt: new Date().toISOString(),
              customer: { firstName: "Test", lastName: "Customer", email: "test@example.invalid", phone: "0821234567" },
              deliveryAddress: { streetAddress: "1 Test St", suburb: "Testville", city: "Pretoria", province: "Gauteng", postalCode: "0001", country: "South Africa", deliveryNotes: null },
              items: [{ productName: "Mock Digital Book", productSlug: "mock-digital-book", quantity: 1, unitPrice: 49.99, lineTotal: 49.99, imageUrl: null }],
              shipping: { status: "NOT_STARTED", courierName: null, trackingNumber: null, trackingUrl: null, estimatedDelivery: null, shippedAt: null, deliveredAt: null },
              hasPhysicalItems: false,
              hasDigitalItems: true,
              isDigitalOnly: true,
            },
          },
        }),
      })
    );
    await page.route("**/api/customers/orders/SG-2026-TEST4/downloads", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "OK", data: { items: [{ orderItemId: "item-1", productName: "Mock Digital Book", displayName: "Mock Digital Book (PDF)", fileType: "PDF", fileSizeBytes: 51200, pageCount: 5, version: null, downloadCount: 0, lastDownloadedAt: null }] } }),
      })
    );

    await page.goto("/account/orders/SG-2026-TEST4");
    await expect(page.locator(".track-order-page__body")).toContainText("This is a digital download order. No courier delivery is required.");
    await expect(page.locator(".track-order-page__body")).not.toContainText("Tracking Number");
  });
});

test.describe("Track Order: digital-only vs physical orders", () => {
  test("digital-only order shows no courier tracking section", async ({ page }) => {
    await page.route("**/api/orders/SG-2026-DGTL/tracking", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "OK",
          data: {
            orderNumber: "SG-2026-DGTL",
            createdAt: new Date().toISOString(),
            status: "CONFIRMED",
            paymentStatus: "PAID",
            paymentMethod: "PAYFAST",
            fulfilmentStatus: "NOT_STARTED",
            shippingStatus: "NOT_STARTED",
            deliveryCity: "Pretoria",
            deliveryProvince: "Gauteng",
            trackingSteps: [],
            trackingSource: "backend-demo",
            hasPhysicalItems: false,
            hasDigitalItems: true,
            isDigitalOnly: true,
          },
        }),
      })
    );

    await page.goto("/track-order?order=SG-2026-DGTL");
    await expect(page.locator(".track-order-result")).toContainText("Digital download order");
    await expect(page.locator(".track-order-result")).toContainText("No courier delivery is required");
    await expect(page.locator(".tracking-progress")).toHaveCount(0);
  });

  test("physical order still shows the courier/tracking section", async ({ page }) => {
    await page.route("**/api/orders/SG-2026-PHYS/tracking", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "OK",
          data: {
            orderNumber: "SG-2026-PHYS",
            createdAt: new Date().toISOString(),
            status: "PROCESSING",
            paymentStatus: "PAID",
            paymentMethod: "PAYFAST",
            fulfilmentStatus: "PACKING",
            shippingStatus: "PACKING",
            deliveryCity: "Pretoria",
            deliveryProvince: "Gauteng",
            trackingSteps: [
              { key: "order-placed", label: "Order Placed", isComplete: true, isCurrent: false, isPending: false },
              { key: "order-confirmed", label: "Order Confirmed", isComplete: true, isCurrent: false, isPending: false },
              { key: "preparing-order", label: "Preparing Your Order", isComplete: false, isCurrent: true, isPending: false },
              { key: "ready-for-delivery", label: "Ready for Delivery", isComplete: false, isCurrent: false, isPending: true },
              { key: "out-for-delivery", label: "Out for Delivery", isComplete: false, isCurrent: false, isPending: true },
              { key: "delivered", label: "Delivered", isComplete: false, isCurrent: false, isPending: true },
            ],
            trackingSource: "backend-demo",
            hasPhysicalItems: true,
            hasDigitalItems: false,
            isDigitalOnly: false,
          },
        }),
      })
    );

    await page.goto("/track-order?order=SG-2026-PHYS");
    await expect(page.locator(".tracking-progress")).toBeVisible();
    await expect(page.locator(".track-order-result")).not.toContainText("Digital download order");
  });
});

test.describe("Admin order detail: digital-only vs physical courier actions", () => {
  test("digital-only order does not show courier booking action", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/orders/SG-2026-TEST7", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "OK",
          data: {
            orderNumber: "SG-2026-TEST7",
            createdAt: new Date().toISOString(),
            status: "CONFIRMED",
            paymentStatus: "PAID",
            fulfilmentStatus: "NOT_STARTED",
            paymentMethod: "PAYFAST",
            customer: { firstName: "Test", lastName: "Customer", email: "test@example.invalid", phone: "0821234567" },
            deliveryAddress: { streetAddress: "1 Test St", suburb: "Testville", city: "Pretoria", province: "Gauteng", postalCode: "0001", country: "South Africa", deliveryNotes: null },
            items: [{ productSlug: "mock-digital-book", productName: "Mock Digital Book", sku: null, quantity: 1, unitPrice: 49.99, lineTotal: 49.99, productType: "DIGITAL" }],
            subtotal: 49.99,
            deliveryFee: 0,
            discountTotal: 0,
            total: 49.99,
            payment: { method: "PAYFAST", status: "PAID", amount: 49.99, provider: "payfast", paidAt: new Date().toISOString() },
            shipping: null,
            hasPhysicalItems: false,
            hasDigitalItems: true,
            isDigitalOnly: true,
          },
        }),
      })
    );
    await page.route("**/api/admin/orders/SG-2026-TEST7/status-history", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { statusHistory: [] } }) })
    );

    await page.goto("/admin/orders/SG-2026-TEST7");
    await expect(page.locator(".admin-page")).toContainText("Digital-only order, no delivery required");
    await expect(page.locator(".admin-courier-quote-form")).toHaveCount(0);
    await expect(page.locator(".admin-shipping-form")).toHaveCount(0);
  });

  test("physical order still shows courier booking action", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/orders/SG-2026-TEST8", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "OK",
          data: {
            orderNumber: "SG-2026-TEST8",
            createdAt: new Date().toISOString(),
            status: "CONFIRMED",
            paymentStatus: "PAID",
            fulfilmentStatus: "NOT_STARTED",
            paymentMethod: "PAYFAST",
            customer: { firstName: "Test", lastName: "Customer", email: "test@example.invalid", phone: "0821234567" },
            deliveryAddress: { streetAddress: "1 Test St", suburb: "Testville", city: "Pretoria", province: "Gauteng", postalCode: "0001", country: "South Africa", deliveryNotes: null },
            items: [{ productSlug: "mock-physical-book", productName: "Mock Physical Book", sku: null, quantity: 1, unitPrice: 50, lineTotal: 50, productType: "PHYSICAL" }],
            subtotal: 50,
            deliveryFee: 80,
            discountTotal: 0,
            total: 130,
            payment: { method: "PAYFAST", status: "PAID", amount: 130, provider: "payfast", paidAt: new Date().toISOString() },
            shipping: { status: "NOT_STARTED", courierName: null, trackingNumber: null, trackingUrl: null, estimatedDelivery: null, shippedAt: null, deliveredAt: null },
            hasPhysicalItems: true,
            hasDigitalItems: false,
            isDigitalOnly: false,
          },
        }),
      })
    );
    await page.route("**/api/admin/orders/SG-2026-TEST8/status-history", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { statusHistory: [] } }) })
    );

    await page.goto("/admin/orders/SG-2026-TEST8");
    await expect(page.locator(".admin-page")).not.toContainText("Digital-only order, no delivery required");
    await expect(page.locator(".admin-courier-quote-form")).toBeVisible();
  });
});
