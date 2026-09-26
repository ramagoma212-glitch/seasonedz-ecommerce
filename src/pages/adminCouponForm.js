// Milestone 197, Part 4/5: admin coupon create/edit form. One shared
// template for /admin/coupons/new and /admin/coupons/:id/edit — same
// "create" vs "edit" split as adminReferralAffiliateForm.js. Every
// validation error shown here is only a UX convenience: coupon.service.ts's
// parseCouponInput() independently re-validates every field server-side
// and remains the final authority (Part 8's own "never trust the frontend"
// requirement) — this form's job is just to surface that same specific
// message quickly, not to invent a second set of rules.

import { getAdminCoupon } from "../js/api/adminCouponApi.js";
import { getAdminProducts } from "../js/api/adminDashboardApi.js";
import { getCurrentAdmin } from "../js/api/adminAuthApi.js";
import { apiGet, ApiError } from "../js/apiClient.js";
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

// Milestone 197's own restriction pickers only ever offer up to this many
// products — the same MAX_LIST_LIMIT adminProduct.controller.ts already
// enforces server-side. The live catalog is well under this (14 products
// at the time of writing) — a V1, practical limitation (Part 12), not a
// silent truncation: if the catalog ever grows past it, this picker would
// need a real search control rather than "load every product".
const PRODUCT_PICKER_LIMIT = 50;

// Milestone 181, Part T's own datetime-local convention, reused verbatim
// (see adminProductForm.js's identical helper) — a datetime-local input
// has no timezone of its own, so reading/writing local wall-clock values
// here agrees with the backend's own SAST display convention
// (utils/southAfricaTime.ts) with no separate conversion library.
function toDatetimeLocalValue(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderNotFound(id) {
  return `
    <section class="container admin-page">
      ${renderAdminNav("coupons")}
      <h1 class="admin-page__title">Coupon Not Found</h1>
      <p class="admin-page__subtitle">No coupon found with id &ldquo;${escapeHtml(id)}&rdquo;.</p>
      <a class="btn btn--secondary" href="/admin/coupons">Back to Coupons</a>
    </section>
  `;
}

function renderProductCheckboxes(name, products, selectedIds) {
  if (products.length === 0) return `<p class="admin-product-form__hint">No products in the catalog yet.</p>`;
  return `
    <div class="admin-product-form__checkboxes">
      ${products
        .map(
          (product) => `
        <label><input type="checkbox" name="${name}" value="${escapeHtml(product.id)}"${selectedIds.has(product.id) ? " checked" : ""} /> ${escapeHtml(product.name)}</label>
      `
        )
        .join("")}
    </div>
  `;
}

function renderCategoryCheckboxes(categories, selectedIds) {
  if (categories.length === 0) return `<p class="admin-product-form__hint">No categories yet.</p>`;
  return `
    <div class="admin-product-form__checkboxes">
      ${categories
        .map(
          (category) => `
        <label><input type="checkbox" name="couponCategoryIds" value="${escapeHtml(category.id)}"${selectedIds.has(category.id) ? " checked" : ""} /> ${escapeHtml(category.name)}</label>
      `
        )
        .join("")}
    </div>
  `;
}

// mode is "create" or "edit". coupon is null for create.
function renderCouponForm(mode, coupon, products, categories) {
  const isEdit = mode === "edit";
  const includedProductIds = new Set((coupon?.includedProducts || []).map((row) => row.productId));
  const includedCategoryIds = new Set((coupon?.includedCategories || []).map((row) => row.categoryId));
  const excludedProductIds = new Set((coupon?.excludedProducts || []).map((row) => row.productId));
  const discountType = coupon?.discountType || "PERCENTAGE";

  return `
    <form
      class="admin-product-form"
      data-admin-coupon-form
      data-mode="${mode}"
      ${isEdit ? `data-coupon-id="${escapeHtml(coupon.id)}"` : ""}
      novalidate
    >
      ${
        isEdit
          ? `
        <div class="admin-readonly-field">
          <span class="form-field__label">Coupon ID</span>
          <span class="admin-readonly-value">${escapeHtml(coupon.id)}</span>
        </div>
        <div class="admin-readonly-field">
          <span class="form-field__label">Times Redeemed</span>
          <span class="admin-readonly-value">${coupon.timesRedeemed}${coupon.maxTotalUses !== null ? ` / ${coupon.maxTotalUses}` : ""}</span>
        </div>
      `
          : ""
      }

      <div class="form-field">
        <label class="form-field__label" for="couponCode">Coupon Code <span class="form-field__required">*</span></label>
        <input type="text" id="couponCode" class="form-field__input" required maxlength="32" value="${escapeHtml(coupon?.code || "")}" placeholder="e.g. WELCOME10" />
        <p class="admin-product-form__hint">3-32 characters: letters, numbers, hyphens or underscores only. Not case-sensitive — WELCOME10 and welcome10 are the same code.</p>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="couponDescription">Internal Description <span class="form-field__optional">(optional, never shown to customers)</span></label>
        <input type="text" id="couponDescription" class="form-field__input" maxlength="200" value="${escapeHtml(coupon?.description || "")}" />
      </div>

      <div class="admin-product-form__checkboxes">
        <label><input type="checkbox" id="couponIsActive" ${coupon?.isActive ?? true ? "checked" : ""} /> Active</label>
      </div>
      <p class="admin-product-form__hint">An inactive coupon can never be applied, even with the correct code.</p>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="couponDiscountType">Discount Type <span class="form-field__required">*</span></label>
          <select id="couponDiscountType" class="form-field__input" required data-admin-coupon-discount-type>
            <option value="PERCENTAGE"${discountType === "PERCENTAGE" ? " selected" : ""}>Percentage</option>
            <option value="FIXED_AMOUNT"${discountType === "FIXED_AMOUNT" ? " selected" : ""}>Fixed Amount (Rand)</option>
          </select>
        </div>
        <div class="form-field">
          <label class="form-field__label" for="couponDiscountValue">Discount Value <span class="form-field__required">*</span></label>
          <input type="number" id="couponDiscountValue" class="form-field__input" required min="0.01" step="0.01" value="${coupon?.discountValue ?? ""}" />
          <p class="admin-product-form__hint" data-admin-coupon-discount-value-hint>${discountType === "PERCENTAGE" ? "A whole percentage between 1 and 100." : "A Rand amount greater than 0."}</p>
        </div>
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="couponMinimumOrderSubtotal">Minimum Order Amount <span class="form-field__optional">(optional)</span></label>
          <input type="number" id="couponMinimumOrderSubtotal" class="form-field__input" min="0.01" step="0.01" value="${coupon?.minimumOrderSubtotal ?? ""}" />
          <p class="admin-product-form__hint">Judged against the coupon-eligible part of the order only (excludes delivery, gift wrap, and anything the coupon doesn't cover).</p>
        </div>
        <div class="form-field">
          <label class="form-field__label" for="couponMaximumDiscountAmount">Maximum Discount <span class="form-field__optional">(optional, percentage only)</span></label>
          <input type="number" id="couponMaximumDiscountAmount" class="form-field__input" min="0.01" step="0.01" value="${coupon?.maximumDiscountAmount ?? ""}" />
          <p class="admin-product-form__hint">E.g. "10% off, up to R100". Ignored for a fixed-amount coupon, which already has its own cap.</p>
        </div>
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="couponStartsAt">Starts <span class="form-field__optional">(optional, South African time)</span></label>
          <input type="datetime-local" id="couponStartsAt" class="form-field__input" value="${toDatetimeLocalValue(coupon?.startsAt)}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="couponExpiresAt">Expires <span class="form-field__optional">(optional, South African time)</span></label>
          <input type="datetime-local" id="couponExpiresAt" class="form-field__input" value="${toDatetimeLocalValue(coupon?.expiresAt)}" />
        </div>
      </div>
      <p class="admin-product-form__hint">Leave either blank for no limit in that direction. A coupon with neither is usable any time it's Active.</p>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="couponMaxTotalUses">Maximum Total Uses <span class="form-field__optional">(optional)</span></label>
          <input type="number" id="couponMaxTotalUses" class="form-field__input" min="1" step="1" value="${coupon?.maxTotalUses ?? ""}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="couponMaxUsesPerCustomer">Maximum Uses Per Customer <span class="form-field__optional">(optional)</span></label>
          <input type="number" id="couponMaxUsesPerCustomer" class="form-field__input" min="1" step="1" value="${coupon?.maxUsesPerCustomer ?? ""}" />
          <p class="admin-product-form__hint">For a guest checkout this is enforced by email, a best-effort limit only.</p>
        </div>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="couponCustomerEligibility">Who Can Use This <span class="form-field__required">*</span></label>
        <select id="couponCustomerEligibility" class="form-field__input" required>
          <option value="ALL"${(coupon?.customerEligibility ?? "ALL") === "ALL" ? " selected" : ""}>Everyone</option>
          <option value="LOGGED_IN_ONLY"${coupon?.customerEligibility === "LOGGED_IN_ONLY" ? " selected" : ""}>Signed-in customers only</option>
        </select>
      </div>

      <div class="form-field">
        <span class="form-field__label">Restrict To Products <span class="form-field__optional">(optional — leave all unchecked to allow every product)</span></span>
        ${renderProductCheckboxes("couponProductIds", products, includedProductIds)}
      </div>

      <div class="form-field">
        <span class="form-field__label">Restrict To Categories <span class="form-field__optional">(optional — leave all unchecked to allow every category)</span></span>
        ${renderCategoryCheckboxes(categories, includedCategoryIds)}
      </div>

      <div class="form-field">
        <span class="form-field__label">Exclude These Products <span class="form-field__optional">(optional — always removed, even if covered by a restriction above)</span></span>
        ${renderProductCheckboxes("couponExcludedProductIds", products, excludedProductIds)}
      </div>

      <div class="form-banner form-banner--error" data-admin-coupon-form-banner hidden></div>

      <button type="submit" class="btn btn--primary">${isEdit ? "Save Changes" : "Create Coupon"}</button>
    </form>
  `;
}

async function loadPickerData() {
  const [productsResponse, categoriesResponse] = await Promise.all([getAdminProducts({ limit: PRODUCT_PICKER_LIMIT }), apiGet("/categories")]);
  return { products: productsResponse.data.products, categories: categoriesResponse.data.categories };
}

export async function renderAdminCouponCreate() {
  try {
    const [, pickerData] = await Promise.all([getCurrentAdmin(), loadPickerData()]);

    return `
      <section class="container admin-page">
        ${renderAdminNav("coupons")}
        <a class="admin-back-link" href="/admin/coupons">&larr; Back to Coupons</a>
        <h1 class="admin-page__title">Add Coupon</h1>
        ${renderCouponForm("create", null, pickerData.products, pickerData.categories)}
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

export async function renderAdminCouponEdit({ id } = {}) {
  if (!id) return renderNotFound("");

  try {
    const [couponResponse, pickerData] = await Promise.all([getAdminCoupon(id), loadPickerData()]);
    const coupon = couponResponse.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("coupons")}
        <a class="admin-back-link" href="/admin/coupons">&larr; Back to Coupons</a>
        <h1 class="admin-page__title">Edit ${escapeHtml(coupon.code)}</h1>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        ${renderCouponForm("edit", coupon, pickerData.products, pickerData.categories)}
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
