// Admin product create/edit form (Version 7, Milestone 67). One
// shared template for both /admin/products/new and
// /admin/products/:id/edit — the two differ only in whether SKU/slug/
// id are editable inputs (create) or read-only display (edit), and in
// which API call the submit handler in app.js makes. No image upload
// control exists here — image management stays deferred to Milestones
// 68-69, per VERSION_7_PRODUCT_MANAGEMENT_PLAN.md Section 11.

import { getAdminProduct, getProductImages } from "../js/api/adminDashboardApi.js";
import { getCurrentAdmin } from "../js/api/adminAuthApi.js";
import { apiGet } from "../js/apiClient.js";
import { ApiError } from "../js/apiClient.js";
import {
  consumePendingAdminMessage,
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { escapeHtml } from "../js/search.js";
import { withBase } from "../js/paths.js";

const STATUS_HELP = {
  DRAFT: "Draft — not visible publicly.",
  ACTIVE: "Active — visible publicly.",
  ARCHIVED: "Archived — hidden but kept for history.",
  OUT_OF_STOCK: "Out of stock — unavailable, or shown according to current public behaviour.",
};

function renderCategoryOptions(categories, selectedId) {
  return categories
    .map((category) => `<option value="${category.id}"${category.id === selectedId ? " selected" : ""}>${escapeHtml(category.name)}</option>`)
    .join("");
}

function renderStatusOptions(selectedStatus) {
  return Object.keys(STATUS_HELP)
    .map((status) => `<option value="${status}"${status === selectedStatus ? " selected" : ""}>${escapeHtml(status)}</option>`)
    .join("");
}

function renderNotFound(id) {
  return `
    <section class="container admin-page">
      ${renderAdminNav("products")}
      <h1 class="admin-page__title">Product Not Found</h1>
      <p class="admin-page__subtitle">No product found with id &ldquo;${escapeHtml(id)}&rdquo;.</p>
      <a class="btn btn--secondary" href="#/admin/products">Back to Products</a>
    </section>
  `;
}

// mode is "create" or "edit". product is null for create.
function renderProductForm(mode, product, categories) {
  const isEdit = mode === "edit";
  const featuresText = product?.features && Array.isArray(product.features) ? product.features.join("\n") : "";

  return `
    <form
      class="admin-product-form"
      data-admin-product-form
      data-mode="${mode}"
      ${isEdit ? `data-product-id="${escapeHtml(product.id)}"` : ""}
      novalidate
    >
      ${
        isEdit
          ? `
        <div class="admin-readonly-field">
          <span class="form-field__label">Product ID</span>
          <span class="admin-readonly-value">${escapeHtml(product.id)}</span>
        </div>
        <div class="admin-readonly-field">
          <span class="form-field__label">SKU</span>
          <span class="admin-readonly-value">${escapeHtml(product.sku || "—")}</span>
        </div>
        <div class="admin-readonly-field">
          <span class="form-field__label">Slug</span>
          <span class="admin-readonly-value">${escapeHtml(product.slug)}</span>
        </div>
      `
          : `
        <div class="form-field">
          <label class="form-field__label" for="productSku">SKU <span class="form-field__required">*</span></label>
          <input type="text" id="productSku" class="form-field__input" required maxlength="100" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="productSlug">Slug <span class="form-field__optional">(optional — auto-generated from name if left blank)</span></label>
          <input type="text" id="productSlug" class="form-field__input" maxlength="200" />
        </div>
      `
      }

      <div class="form-field">
        <label class="form-field__label" for="productName">Name <span class="form-field__required">*</span></label>
        <input type="text" id="productName" class="form-field__input" required maxlength="200" value="${escapeHtml(product?.name || "")}" />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="productCategory">Category <span class="form-field__required">*</span></label>
        <select id="productCategory" class="form-field__input" required>
          <option value="">Select a category</option>
          ${renderCategoryOptions(categories, product?.categoryId)}
        </select>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="productShortDescription">Short Description</label>
        <textarea id="productShortDescription" class="form-field__input form-field__textarea" rows="2" maxlength="200">${escapeHtml(product?.shortDescription || "")}</textarea>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="productDescription">Full Description</label>
        <textarea id="productDescription" class="form-field__input form-field__textarea" rows="4" maxlength="5000">${escapeHtml(product?.description || "")}</textarea>
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="productPrice">Price (R) <span class="form-field__required">*</span></label>
          <input type="number" id="productPrice" class="form-field__input" required min="0.01" step="0.01" value="${product?.price ?? ""}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="productOldPrice">Old Price (R) <span class="form-field__optional">(optional)</span></label>
          <input type="number" id="productOldPrice" class="form-field__input" min="0.01" step="0.01" value="${product?.oldPrice ?? ""}" />
        </div>
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="productStock">Stock Quantity <span class="form-field__required">*</span></label>
          <input type="number" id="productStock" class="form-field__input" required min="0" step="1" value="${product?.stockQuantity ?? 0}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="productLowStockThreshold">Low Stock Threshold</label>
          <input type="number" id="productLowStockThreshold" class="form-field__input" min="0" step="1" value="${product?.lowStockThreshold ?? 5}" />
        </div>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="productStatus">Status</label>
        <select id="productStatus" class="form-field__input">
          ${renderStatusOptions(product?.status || "DRAFT")}
        </select>
        <p class="admin-product-form__hint" data-admin-product-status-hint></p>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="productAgeRange">Age Range <span class="form-field__optional">(optional)</span></label>
        <input type="text" id="productAgeRange" class="form-field__input" maxlength="100" value="${escapeHtml(product?.ageRange || "")}" />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="productFeatures">Features <span class="form-field__optional">(one per line)</span></label>
        <textarea id="productFeatures" class="form-field__input form-field__textarea" rows="4">${escapeHtml(featuresText)}</textarea>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="productDiscountLabel">Discount Label <span class="form-field__optional">(optional, e.g. "Save 20%")</span></label>
        <input type="text" id="productDiscountLabel" class="form-field__input" maxlength="100" value="${escapeHtml(product?.discountLabel || "")}" />
      </div>

      <div class="admin-product-form__checkboxes">
        <label><input type="checkbox" id="productIsFeatured" ${product?.isFeatured ? "checked" : ""} /> Featured</label>
        <label><input type="checkbox" id="productIsBestSeller" ${product?.isBestSeller ? "checked" : ""} /> Best Seller</label>
        <label><input type="checkbox" id="productIsNewArrival" ${product?.isNewArrival ? "checked" : ""} /> New Arrival</label>
      </div>

      <div class="admin-product-form__image-note">
        Image upload is coming later. For now, product images are managed separately.
      </div>

      <div class="form-banner form-banner--error" data-admin-product-banner hidden></div>

      <button type="submit" class="btn btn--primary">${isEdit ? "Save Changes" : "Create Product"}</button>
    </form>
  `;
}

// ---------------------------------------------------------------------------
// Product Images section (Version 7, Milestone 70). Edit page only —
// a product must already exist (have an id) before it can have
// images, so this never appears on the create page. Uses the
// protected image routes already live from Milestone 69
// (GET/POST/PATCH /api/admin/products/:id/images) — still no DELETE
// anywhere, and no drag-and-drop/bulk upload, matching this
// milestone's explicit scope.
// ---------------------------------------------------------------------------

function renderProductImageCard(image) {
  const resolvedUrl = withBase(image.url);
  const altText = image.altText ? escapeHtml(image.altText) : "";

  return `
    <li class="admin-image-card" data-admin-image-card="${escapeHtml(image.id)}">
      <img class="admin-image-card__preview" src="${escapeHtml(resolvedUrl)}" alt="${altText}" loading="lazy" />
      <div class="admin-image-card__meta">
        ${image.isPrimary ? '<span class="admin-badge admin-badge--success">Main image</span>' : ""}
        <p class="admin-image-card__alt">${altText || '<span class="admin-image-card__alt--empty">No alt text</span>'}</p>
        <p class="admin-image-card__order">Sort order: ${Number(image.sortOrder)}</p>
      </div>
      <div class="admin-image-card__actions">
        ${
          image.isPrimary
            ? ""
            : `<button type="button" class="btn btn--secondary" data-admin-image-set-primary="${escapeHtml(image.id)}">Set as main</button>`
        }
        <button type="button" class="btn btn--secondary" data-admin-image-alt-toggle="${escapeHtml(image.id)}">Edit alt text</button>
        <button type="button" class="btn btn--danger" data-admin-image-remove="${escapeHtml(image.id)}">Remove</button>
      </div>
      <form class="admin-image-alt-form" data-admin-image-alt-form="${escapeHtml(image.id)}" hidden>
        <label class="form-field__label" for="altText-${escapeHtml(image.id)}">Alt text</label>
        <input
          type="text"
          id="altText-${escapeHtml(image.id)}"
          class="form-field__input"
          maxlength="200"
          value="${altText}"
          data-admin-image-alt-input
        />
        <div class="admin-image-alt-form__actions">
          <button type="submit" class="btn btn--primary">Save</button>
          <button type="button" class="btn btn--secondary" data-admin-image-alt-cancel="${escapeHtml(image.id)}">Cancel</button>
        </div>
      </form>
    </li>
  `;
}

function renderImageUploadForm(productId) {
  return `
    <form class="admin-image-upload-form" data-admin-image-upload-form data-product-id="${escapeHtml(productId)}" novalidate>
      <h3 class="admin-page__section-subtitle">Upload New Image</h3>

      <div class="form-field">
        <label class="form-field__label" for="productImageFile">Image file <span class="form-field__required">*</span></label>
        <input type="file" id="productImageFile" accept="image/jpeg,image/png,image/webp" />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="productImageAltText">Alt text <span class="form-field__required">*</span></label>
        <input type="text" id="productImageAltText" class="form-field__input" maxlength="200" />
      </div>

      <div class="form-field">
        <span class="form-field__label">Image type</span>
        <div class="admin-image-upload-form__kind">
          <label><input type="radio" name="productImageKind" value="gallery" checked /> Gallery image</label>
          <label><input type="radio" name="productImageKind" value="main" /> Main image</label>
        </div>
      </div>

      <p class="admin-product-form__hint">
        Allowed files: JPG, PNG or WebP, up to 5 MB. Product images are public once uploaded.
        Image upload uses Supabase Storage and must be configured first.
      </p>

      <div class="form-banner form-banner--error" data-admin-image-upload-banner hidden></div>

      <button type="submit" class="btn btn--primary">Upload Image</button>
    </form>
  `;
}

function renderProductImagesSection(productId, images) {
  return `
    <section class="admin-product-images" data-admin-product-images data-product-id="${escapeHtml(productId)}">
      <h2 class="admin-page__section-title">Product Images</h2>
      ${
        images.length > 0
          ? `<ul class="admin-image-card-list">${images.map(renderProductImageCard).join("")}</ul>`
          : `<p class="admin-product-images__empty">No images uploaded yet for this product.</p>`
      }
      ${renderImageUploadForm(productId)}
    </section>
  `;
}

export async function renderAdminProductCreate() {
  try {
    // GET /categories is public (no auth needed) — unlike the edit
    // page, this page has no admin-only data fetch of its own to fail
    // with a 401, so getCurrentAdmin() is called explicitly here
    // purely as the auth check, matching every other protected admin
    // page's behaviour of redirecting to login before rendering
    // anything when logged out.
    const [, categoriesResponse] = await Promise.all([getCurrentAdmin(), apiGet("/categories")]);
    const categories = categoriesResponse.data.categories;

    return `
      <section class="container admin-page">
        ${renderAdminNav("products")}
        <a class="admin-back-link" href="#/admin/products">&larr; Back to Products</a>
        <h1 class="admin-page__title">Add Product</h1>
        ${renderProductForm("create", null, categories)}
      </section>
    `;
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return renderAdminRedirecting();
    }
    return renderAdminConnectionError(isBackendUnavailable(error));
  }
}

export async function renderAdminProductEdit({ id } = {}) {
  if (!id) return renderNotFound("");

  try {
    const [productResponse, categoriesResponse, imagesResponse] = await Promise.all([
      getAdminProduct(id),
      apiGet("/categories"),
      getProductImages(id),
    ]);
    const product = productResponse.data;
    const categories = categoriesResponse.data.categories;
    const images = imagesResponse.data.images;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("products")}
        <a class="admin-back-link" href="#/admin/products">&larr; Back to Products</a>
        <h1 class="admin-page__title">Edit ${escapeHtml(product.name)}</h1>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        ${renderProductForm("edit", product, categories)}
        ${renderProductImagesSection(product.id, images)}
      </section>
    `;
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return renderAdminRedirecting();
    }
    if (error instanceof ApiError && error.status === 404) {
      return renderNotFound(id);
    }
    return renderAdminConnectionError(isBackendUnavailable(error));
  }
}

// /admin/products/:id (no separate read-only detail view — redirects
// straight to the edit page, per the milestone's explicit "keep it
// simple" allowance).
export function renderAdminProductRedirectToEdit({ id } = {}) {
  window.location.hash = `/admin/products/${encodeURIComponent(id || "")}/edit`;
  return `
    <section class="stub-page container">
      <p class="stub-page__text">Redirecting to the product edit page...</p>
    </section>
  `;
}
