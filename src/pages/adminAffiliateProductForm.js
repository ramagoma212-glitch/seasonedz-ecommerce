// Version 7, Milestone 172B: admin affiliate-product create/edit form.
// One shared template for both /admin/affiliate/new and
// /admin/affiliate/:id/edit — same "create" vs "edit" split as
// adminProductForm.js. No image upload control: imageUrl is a plain
// HTTPS link field (Step 15 of this milestone's brief explicitly
// rules out a new image-storage platform), matching how imageUrl is
// stored and validated on the backend.

import { getAdminAffiliateProduct } from "../js/api/adminAffiliateApi.js";
import { getCurrentAdmin } from "../js/api/adminAuthApi.js";
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

function renderNotFound(id) {
  return `
    <section class="container admin-page">
      ${renderAdminNav("affiliate")}
      <h1 class="admin-page__title">Affiliate Product Not Found</h1>
      <p class="admin-page__subtitle">No affiliate product found with id &ldquo;${escapeHtml(id)}&rdquo;.</p>
      <a class="btn btn--secondary" href="/admin/affiliate">Back to Affiliate Products</a>
    </section>
  `;
}

// mode is "create" or "edit". product is null for create.
function renderAffiliateProductForm(mode, product) {
  const isEdit = mode === "edit";

  return `
    <form
      class="admin-product-form"
      data-admin-affiliate-form
      data-mode="${mode}"
      ${isEdit ? `data-affiliate-product-id="${escapeHtml(product.id)}"` : ""}
      novalidate
    >
      ${
        isEdit
          ? `
        <div class="admin-readonly-field">
          <span class="form-field__label">Affiliate Product ID</span>
          <span class="admin-readonly-value">${escapeHtml(product.id)}</span>
        </div>
      `
          : ""
      }

      <div class="form-field">
        <label class="form-field__label" for="affiliateTitle">Title <span class="form-field__required">*</span></label>
        <input type="text" id="affiliateTitle" class="form-field__input" required maxlength="200" value="${escapeHtml(product?.title || "")}" />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="affiliateAuthor">Author <span class="form-field__optional">(optional)</span></label>
        <input type="text" id="affiliateAuthor" class="form-field__input" maxlength="150" value="${escapeHtml(product?.author || "")}" />
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="affiliateSlug">Slug <span class="form-field__optional">(optional &mdash; auto-generated from title if left blank)</span></label>
          <input type="text" id="affiliateSlug" class="form-field__input" maxlength="100" value="${escapeHtml(product?.slug || "")}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="affiliateTrackingSlug">Tracking Slug <span class="form-field__optional">(optional &mdash; used later by /go/ links)</span></label>
          <input type="text" id="affiliateTrackingSlug" class="form-field__input" maxlength="80" value="${escapeHtml(product?.trackingSlug || "")}" />
          <p class="admin-product-form__hint">Changing this on an already-shared link will break it. Leave it alone unless you mean to change the link.</p>
        </div>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="affiliateDescription">Description <span class="form-field__optional">(optional, plain text)</span></label>
        <textarea id="affiliateDescription" class="form-field__input form-field__textarea" rows="3" maxlength="2000">${escapeHtml(product?.description || "")}</textarea>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="affiliateImageUrl">Cover Image URL <span class="form-field__optional">(optional, must be https://)</span></label>
        <input type="url" id="affiliateImageUrl" class="form-field__input" maxlength="2000" value="${escapeHtml(product?.imageUrl || "")}" />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="affiliateCategory">Category <span class="form-field__optional">(optional, free text &mdash; not linked to the Seasonedz shop categories)</span></label>
        <input type="text" id="affiliateCategory" class="form-field__input" maxlength="100" value="${escapeHtml(product?.category || "")}" />
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="affiliateMerchantName">Merchant <span class="form-field__required">*</span></label>
          <input type="text" id="affiliateMerchantName" class="form-field__input" required maxlength="100" placeholder="e.g. Amazon, Takealot" value="${escapeHtml(product?.merchantName || "")}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="affiliateNetwork">Affiliate Network <span class="form-field__optional">(optional)</span></label>
          <input type="text" id="affiliateNetwork" class="form-field__input" maxlength="100" placeholder="e.g. Amazon Associates" value="${escapeHtml(product?.affiliateNetwork || "")}" />
        </div>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="affiliateUrl">Affiliate URL <span class="form-field__required">*</span></label>
        <input type="url" id="affiliateUrl" class="form-field__input" required maxlength="2000" placeholder="https://..." value="${escapeHtml(product?.affiliateUrl || "")}" />
        <p class="admin-product-form__hint">
          Must be a real https:// link. This is stored on the server only &mdash; it is never shown directly to site visitors,
          and no public redirect uses it yet (that is a later milestone).
        </p>
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="affiliatePrice">Price <span class="form-field__optional">(optional)</span></label>
          <input type="number" id="affiliatePrice" class="form-field__input" min="0" step="0.01" value="${product?.price ?? ""}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="affiliateCurrency">Currency</label>
          <input type="text" id="affiliateCurrency" class="form-field__input" maxlength="3" value="${escapeHtml(product?.currency || "ZAR")}" />
        </div>
      </div>
      <p class="admin-product-form__hint">
        External merchant prices can change at any time &mdash; Seasonedz never checks or updates this automatically.
        Setting a price here also records today as the date it was checked, so the future public page can hide a price
        once it goes stale. Leave price blank if you are not sure it is current.
      </p>

      <div class="form-field">
        <label class="form-field__label" for="affiliateDiscountText">Discount Text <span class="form-field__optional">(optional, e.g. "Save 20%")</span></label>
        <input type="text" id="affiliateDiscountText" class="form-field__input" maxlength="100" value="${escapeHtml(product?.discountText || "")}" />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="affiliateRating">Rating <span class="form-field__optional">(optional, 0&ndash;5 &mdash; only enter a genuine rating)</span></label>
        <input type="number" id="affiliateRating" class="form-field__input" min="0" max="5" step="0.1" value="${product?.rating ?? ""}" />
      </div>

      <div class="admin-product-form__checkboxes">
        <label><input type="checkbox" id="affiliateIsFeatured" ${product?.isFeatured ? "checked" : ""} /> Featured</label>
        <label><input type="checkbox" id="affiliateIsActive" ${product === null || product?.isActive ? "checked" : ""} /> Active</label>
      </div>
      <p class="admin-product-form__hint">
        Nothing on this page is shown on the public site yet. Active/Inactive and Featured only control how this
        product will behave once the Recommended Books page is built in a later milestone.
      </p>

      <div class="form-banner form-banner--error" data-admin-affiliate-form-banner hidden></div>

      <button type="submit" class="btn btn--primary">${isEdit ? "Save Changes" : "Create Affiliate Product"}</button>
    </form>
  `;
}

export async function renderAdminAffiliateProductCreate() {
  try {
    await getCurrentAdmin();

    return `
      <section class="container admin-page">
        ${renderAdminNav("affiliate")}
        <a class="admin-back-link" href="/admin/affiliate">&larr; Back to Affiliate Products</a>
        <h1 class="admin-page__title">Add Affiliate Product</h1>
        ${renderAffiliateProductForm("create", null)}
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

export async function renderAdminAffiliateProductEdit({ id } = {}) {
  if (!id) return renderNotFound("");

  try {
    const response = await getAdminAffiliateProduct(id);
    const product = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("affiliate")}
        <a class="admin-back-link" href="/admin/affiliate">&larr; Back to Affiliate Products</a>
        <h1 class="admin-page__title">Edit ${escapeHtml(product.title)}</h1>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        ${renderAffiliateProductForm("edit", product)}
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
