// Version 7, Milestone 172B.3: admin form for the affiliate
// programme's singleton settings row. Changing a default here only
// ever affects FUTURE qualifying orders — it can never alter a
// historical OrderAffiliateCommission, which snapshots its own rates
// permanently at creation time. That guarantee is stated plainly on
// this page, not just left implicit (§21 of the brief).

import { getReferralSettings } from "../js/api/adminReferralsApi.js";
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

export async function renderAdminReferralSettings() {
  try {
    const response = await getReferralSettings();
    const settings = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("referrals")}
        <h1 class="admin-page__title">Referrals</h1>
        ${renderReferralsSubNav("settings")}

        <h2 class="admin-page__section-title">Programme Settings</h2>
        <p class="admin-page__subtitle">
          Changing a default here only ever applies to <strong>future</strong> qualifying orders. It never alters a
          historical commission record. Every past commission permanently keeps the exact rates that applied
          when it was created.
        </p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}

        <form class="admin-product-form" data-admin-referral-settings-form novalidate>
          <div class="admin-product-form__row">
            <div class="form-field">
              <label class="form-field__label" for="referralSettingsCommissionRate">Default Affiliate Commission %</label>
              <input type="number" id="referralSettingsCommissionRate" class="form-field__input" min="0" max="50" step="0.01" value="${settings.defaultCommissionRate}" />
            </div>
            <div class="form-field">
              <label class="form-field__label" for="referralSettingsDiscountRate">Default Customer Referral Discount %</label>
              <input type="number" id="referralSettingsDiscountRate" class="form-field__input" min="0" max="50" step="0.01" value="${settings.defaultReferralDiscountRate}" />
            </div>
          </div>

          <div class="admin-product-form__row">
            <div class="form-field">
              <label class="form-field__label" for="referralSettingsAttributionWindow">Attribution Window (days)</label>
              <input type="number" id="referralSettingsAttributionWindow" class="form-field__input" min="1" max="365" step="1" value="${settings.attributionWindowDays}" />
            </div>
            <div class="form-field">
              <label class="form-field__label" for="referralSettingsValidationDays">Commission Validation Period (days)</label>
              <input type="number" id="referralSettingsValidationDays" class="form-field__input" min="0" max="365" step="1" value="${settings.commissionValidationDays}" />
            </div>
          </div>

          <div class="admin-product-form__row">
            <div class="form-field">
              <label class="form-field__label" for="referralSettingsMinimumPayout">Minimum Payout Amount (R)</label>
              <input type="number" id="referralSettingsMinimumPayout" class="form-field__input" min="0" step="0.01" value="${settings.minimumPayoutAmount}" />
            </div>
            <div class="form-field">
              <label class="form-field__label" for="referralSettingsPayoutDay">Payout Day of Month</label>
              <input type="number" id="referralSettingsPayoutDay" class="form-field__input" min="1" max="28" step="1" value="${settings.payoutDayOfMonth}" />
              <p class="admin-product-form__hint">1&ndash;28 only, so every month has that day.</p>
            </div>
          </div>

          <div class="admin-product-form__checkboxes">
            <label><input type="checkbox" id="referralSettingsProgrammeActive" ${settings.isProgrammeActive ? "checked" : ""} /> Programme active</label>
          </div>

          <div class="form-banner form-banner--error" data-admin-referral-settings-banner hidden></div>

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
