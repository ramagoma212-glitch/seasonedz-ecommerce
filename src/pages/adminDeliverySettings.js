// Milestone 205: admin form for the delivery settings singleton row —
// mirrors adminReferralSettings.js exactly. Changing a fee or the
// free-delivery threshold here only ever affects FUTURE orders — it
// can never alter a historical order, which snapshots its own
// deliveryFee permanently at creation time.

import { getAdminDeliverySettings } from "../js/api/adminDeliveryApi.js";
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

export async function renderAdminDeliverySettings() {
  try {
    const response = await getAdminDeliverySettings();
    const settings = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("delivery")}
        <h1 class="admin-page__title">Delivery Settings</h1>
        <p class="admin-page__subtitle">
          Changing a fee or the free-delivery threshold here only ever applies to <strong>future</strong> orders. It never
          alters a historical order, which permanently keeps the exact delivery fee that applied when it was placed.
        </p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}

        <form class="admin-product-form" data-admin-delivery-settings-form novalidate>
          <div class="admin-product-form__row">
            <div class="form-field">
              <label class="form-field__label" for="deliverySettingsLockerFee">Courier Guy Locker to Locker Fee (R)</label>
              <input type="number" id="deliverySettingsLockerFee" class="form-field__input" min="0" step="0.01" value="${settings.courierLockerFee}" />
            </div>
            <div class="form-field">
              <label class="form-field__label" for="deliverySettingsDoorFee">Courier Guy Door to Door Fee (R)</label>
              <input type="number" id="deliverySettingsDoorFee" class="form-field__input" min="0" step="0.01" value="${settings.courierDoorFee}" />
            </div>
          </div>

          <div class="admin-product-form__row">
            <div class="form-field">
              <label class="form-field__label" for="deliverySettingsThreshold">Free Delivery Threshold (R)</label>
              <input type="number" id="deliverySettingsThreshold" class="form-field__input" min="0" step="0.01" value="${settings.freeDeliveryThreshold}" />
              <p class="admin-product-form__hint">Applies to every customer equally — guest or signed in.</p>
            </div>
          </div>

          <div class="form-banner form-banner--error" data-admin-delivery-settings-banner hidden></div>

          <button type="submit" class="btn btn--primary">Save Settings</button>
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
