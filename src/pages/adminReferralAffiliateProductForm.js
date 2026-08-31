// Milestone 178, Part C: Affiliate Products create/edit form. Create
// mode requires picking a real product via a searchable picker (never
// a manually typed Product ID) — search reuses the existing admin
// product list search (getAdminProducts), the same endpoint the
// Products admin area already uses. Edit mode shows the already-
// chosen product read-only (Product itself is never edited from here)
// and only ever changes commission configuration.

import { getAdminAffiliateProductSetting } from "../js/api/adminReferralsApi.js";
import { getAdminProducts } from "../js/api/adminDashboardApi.js";
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
import { renderReferralsSubNav } from "../components/referralsSubNav.js";
import { escapeHtml } from "../js/search.js";

function toDateInputValue(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toISOString().slice(0, 10);
}

function renderNotFound(id) {
  return `
    <section class="container admin-page">
      ${renderAdminNav("referrals")}
      <h1 class="admin-page__title">Affiliate Product Not Found</h1>
      <p class="admin-page__subtitle">No affiliate product configuration found with id &ldquo;${escapeHtml(id)}&rdquo;.</p>
      <a class="btn btn--secondary" href="/admin/referrals/affiliate-products">Back to Affiliate Products</a>
    </section>
  `;
}

// Create mode only — a live search box over the real Product catalogue.
// Selecting a result fills the hidden productId field and the
// read-only preview card; nothing here is ever typed as a raw id.
function renderProductPicker() {
  return `
    <div class="form-field" data-affiliate-product-picker>
      <label class="form-field__label" for="affiliateProductSearch">Find Product <span class="form-field__required">*</span></label>
      <div class="admin-product-filters">
        <input type="search" id="affiliateProductSearch" class="form-field__input" placeholder="Search product name or SKU" />
        <button type="button" class="btn btn--secondary btn--sm" data-action="search-affiliate-product-candidates">Search</button>
      </div>
      <div data-affiliate-product-search-results></div>
      <input type="hidden" id="affiliateProductId" required />
      <div data-affiliate-product-selected-preview></div>
      <span class="form-field__error" data-error-for="affiliateProductId"></span>
    </div>
  `;
}

function renderSelectedProductPreview(product) {
  return `
    <div class="admin-readonly-field" data-affiliate-product-preview>
      <span class="form-field__label">Selected Product</span>
      <span class="admin-readonly-value">${escapeHtml(product.name)}, SKU ${escapeHtml(product.sku || "N/A")}, R${Number(product.price).toFixed(2)}</span>
    </div>
  `;
}

function renderCommissionFields(item) {
  const commissionType = item?.commissionType || "PERCENTAGE";
  return `
    <div class="form-field">
      <label class="form-field__label" for="affiliateProductCommissionType">Commission Type <span class="form-field__required">*</span></label>
      <select id="affiliateProductCommissionType" class="form-field__input" data-affiliate-product-commission-type>
        <option value="PERCENTAGE"${commissionType === "PERCENTAGE" ? " selected" : ""}>Percentage</option>
        <option value="FIXED_AMOUNT"${commissionType === "FIXED_AMOUNT" ? " selected" : ""}>Fixed Amount Per Unit</option>
      </select>
    </div>

    <div class="form-field" data-affiliate-product-percent-field ${commissionType === "FIXED_AMOUNT" ? "hidden" : ""}>
      <label class="form-field__label" for="affiliateProductCommissionPercent">Commission % <span class="form-field__optional">(optional)</span></label>
      <input type="number" id="affiliateProductCommissionPercent" class="form-field__input" min="0" max="100" step="0.01" value="${item?.commissionPercent ?? ""}" />
      <p class="admin-product-form__hint">Leave blank to use the affiliate's own rate (their override, or the programme default). Calculated on the qualifying amount after the existing referral discount, excluding delivery and gift wrap.</p>
    </div>

    <div class="form-field" data-affiliate-product-fixed-field ${commissionType === "PERCENTAGE" ? "hidden" : ""}>
      <label class="form-field__label" for="affiliateProductFixedAmount">Fixed Commission Per Unit (R) <span class="form-field__required">*</span></label>
      <input type="number" id="affiliateProductFixedAmount" class="form-field__input" min="0" step="0.01" value="${item?.fixedCommissionAmount ?? ""}" />
      <p class="admin-product-form__hint">Multiplied by the quantity ordered, e.g. R10 &times; 3 units = R30. Never affected by the referral discount.</p>
    </div>

    <div class="form-field">
      <label class="form-field__label" for="affiliateProductMaxCommission">Maximum Commission Per Order Line (R) <span class="form-field__optional">(optional)</span></label>
      <input type="number" id="affiliateProductMaxCommission" class="form-field__input" min="0" step="0.01" value="${item?.maximumCommission ?? ""}" />
      <p class="admin-product-form__hint">Caps this product's own commission within a single order line. Not a lifetime cap.</p>
    </div>

    <div class="admin-product-form__row">
      <div class="form-field">
        <label class="form-field__label" for="affiliateProductStartsAt">Starts <span class="form-field__optional">(optional)</span></label>
        <input type="date" id="affiliateProductStartsAt" class="form-field__input" value="${toDateInputValue(item?.startsAt)}" />
      </div>
      <div class="form-field">
        <label class="form-field__label" for="affiliateProductEndsAt">Ends <span class="form-field__optional">(optional)</span></label>
        <input type="date" id="affiliateProductEndsAt" class="form-field__input" value="${toDateInputValue(item?.endsAt)}" />
      </div>
    </div>

    <label class="account-preferences__field">
      <input type="checkbox" id="affiliateProductAvailable" ${item?.isAffiliateAvailable !== false ? "checked" : ""} />
      <span>Available to the Affiliate Programme</span>
    </label>
  `;
}

function renderForm(mode, item) {
  const isEdit = mode === "edit";

  return `
    <form class="admin-product-form" data-admin-affiliate-product-form data-mode="${mode}" ${isEdit ? `data-affiliate-product-id="${escapeHtml(item.id)}"` : ""} novalidate>
      ${isEdit ? renderSelectedProductPreview({ name: item.productName, sku: item.productSku, price: item.productPrice }) : renderProductPicker()}
      ${renderCommissionFields(item)}

      <div class="form-banner form-banner--error" data-admin-affiliate-product-form-banner hidden></div>

      <button type="submit" class="btn btn--primary">${isEdit ? "Save Changes" : "Add Affiliate Product"}</button>
    </form>
  `;
}

export async function renderAdminReferralAffiliateProductCreate() {
  try {
    await getCurrentAdmin();

    return `
      <section class="container admin-page">
        ${renderAdminNav("referrals")}
        <h1 class="admin-page__title">Referrals</h1>
        ${renderReferralsSubNav("affiliate-products")}
        <a class="admin-back-link" href="/admin/referrals/affiliate-products">&larr; Back to Affiliate Products</a>
        <h2 class="admin-page__section-title">Add Affiliate Product</h2>
        <p class="admin-page__subtitle">Search for a real product, then configure its commission. Name, price and image always stay live from the product catalogue.</p>
        ${renderForm("create", null)}
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

export async function renderAdminReferralAffiliateProductEdit({ id } = {}) {
  if (!id) return renderNotFound("");

  try {
    const response = await getAdminAffiliateProductSetting(id);
    const item = response.data.item;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("referrals")}
        <h1 class="admin-page__title">Referrals</h1>
        ${renderReferralsSubNav("affiliate-products")}
        <a class="admin-back-link" href="/admin/referrals/affiliate-products">&larr; Back to Affiliate Products</a>
        <h2 class="admin-page__section-title">Edit ${escapeHtml(item.productName)}</h2>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        ${renderForm("edit", item)}
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

// Exported for app.js's search-result rendering (kept here so the
// result-card markup and the selected-preview markup can never drift
// apart from each other).
export function renderProductSearchResults(products) {
  if (products.length === 0) {
    return `<p class="admin-product-form__hint">No matching products found.</p>`;
  }
  return `
    <ul class="admin-search-results">
      ${products
        .map(
          (product) => `
        <li class="admin-search-results__item">
          <span>${escapeHtml(product.name)}, SKU ${escapeHtml(product.sku || "N/A")}, R${Number(product.price).toFixed(2)}</span>
          <button type="button" class="btn btn--secondary btn--sm" data-action="select-affiliate-product-candidate" data-product-id="${escapeHtml(product.id)}" data-product-name="${escapeHtml(product.name)}" data-product-sku="${escapeHtml(product.sku || "")}" data-product-price="${product.price}">Select</button>
        </li>
      `
        )
        .join("")}
    </ul>
  `;
}

export { renderSelectedProductPreview };
