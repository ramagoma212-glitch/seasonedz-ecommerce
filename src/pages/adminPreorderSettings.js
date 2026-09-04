// Milestone 181, Part D: admin form for the store-wide preorder
// programme settings — the first-registered-customer preorder discount
// rate. Only ADMIN may change this (backend-enforced, see
// adminPreorder.routes.ts's requireAdminRole); STAFF may view it, same
// as Part D's explicit "STAFF may view but must not change discount
// policy" instruction — enforced here by disabling the form for a
// signed-in STAFF member, and backed up by the backend's own 403
// regardless of what this page renders.

import { getPreorderSettings } from "../js/api/adminPreorderApi.js";
import { getCurrentAdmin } from "../js/api/adminAuthApi.js";
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

export async function renderAdminPreorderSettings() {
  try {
    const [adminResponse, settingsResponse] = await Promise.all([getCurrentAdmin(), getPreorderSettings()]);
    const admin = adminResponse.data.admin;
    const settings = settingsResponse.data;
    const isAdmin = admin.role === "ADMIN";
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("products")}
        <a class="admin-back-link" href="/admin/products">&larr; Back to Products</a>
        <h1 class="admin-page__title">Preorder Settings</h1>
        <p class="admin-page__subtitle">
          Controls the store-wide first-registered-customer preorder discount. A registered customer's first order
          containing at least one eligible preorder Product receives this percentage off those Product lines only —
          never delivery, gift wrap, or non-eligible lines. Changing the rate here only ever applies to
          <strong>future</strong> orders; a past order permanently keeps the exact rate that applied when it was placed.
        </p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        ${!isAdmin ? `<div class="form-banner form-banner--error">Only Administrators can change preorder discount settings. You can view the current settings below.</div>` : ""}

        <form class="admin-product-form" data-admin-preorder-settings-form novalidate>
          <div class="admin-product-form__checkboxes">
            <label>
              <input type="checkbox" id="preorderSettingsDiscountEnabled" ${settings.firstRegisteredPreorderDiscountEnabled ? "checked" : ""} ${isAdmin ? "" : "disabled"} />
              First preorder discount enabled
            </label>
          </div>

          <div class="form-field">
            <label class="form-field__label" for="preorderSettingsDiscountPercent">First Preorder Discount %</label>
            <input
              type="number"
              id="preorderSettingsDiscountPercent"
              class="form-field__input"
              min="0"
              max="50"
              step="0.01"
              value="${settings.firstRegisteredPreorderDiscountPercent}"
              ${isAdmin ? "" : "disabled"}
            />
            <p class="admin-product-form__hint">
              Applied automatically to a registered customer's first qualifying preorder order. Individual Products
              never set their own rate — only whether they participate, under Preorder Settings on that Product's
              edit page.
            </p>
          </div>

          <div class="form-banner form-banner--error" data-admin-preorder-settings-banner hidden></div>

          ${isAdmin ? `<button type="submit" class="btn btn--primary">Save Settings</button>` : ""}
        </form>
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
