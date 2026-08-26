// Version 7, Milestone 172B.3: admin affiliate create/edit form. One
// shared template for /admin/referrals/affiliates/new and
// /admin/referrals/affiliates/:id/edit — same "create" vs "edit" split
// as adminAffiliateProductForm.js (172B). No hard-delete control
// anywhere on this page: approve/reject/suspend/reactivate (from the
// list page) are the only status changes.

import { getAdminAffiliate } from "../js/api/adminReferralsApi.js";
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

// Version 7, Milestone 172B.5: real commission totals — merged into
// GET /admin/referrals/affiliates/:id's own response (see
// adminReferralAffiliate.controller.ts). Never shown on the "create"
// form, which has no affiliate/history to summarise yet.
function renderCommissionSummary(affiliate) {
  const totals = affiliate.commissionTotals;
  if (!totals) return "";

  function statCard(label, value) {
    return `<div class="admin-card"><p class="admin-card__label">${label}</p><p class="admin-card__value">${value}</p></div>`;
  }

  return `
    <h2 class="admin-page__section-title">Commission Summary</h2>
    <div class="admin-cards">
      ${statCard("Pending", `R${totals.pendingTotal.toFixed(2)}`)}
      ${statCard("Approved, unpaid", `R${totals.approvedUnpaidTotal.toFixed(2)}`)}
      ${statCard("Paid (lifetime)", `R${totals.paidLifetimeTotal.toFixed(2)}`)}
      ${statCard("Reversed (lifetime)", `R${totals.reversedTotal.toFixed(2)}`)}
      ${statCard("Payout eligible", totals.isPayoutEligible ? "Yes" : `No (min. R${totals.minimumPayoutAmount.toFixed(2)})`)}
    </div>
    <p class="admin-page__subtitle">
      <a href="/admin/referrals/commissions?affiliateId=${encodeURIComponent(affiliate.id)}">View this affiliate's commissions</a>
      ${totals.isPayoutEligible ? ` &bull; <a href="/admin/referrals/payouts">Go to Payouts</a>` : ""}
    </p>
  `;
}

function renderNotFound(id) {
  return `
    <section class="container admin-page">
      ${renderAdminNav("referrals")}
      <h1 class="admin-page__title">Affiliate Not Found</h1>
      <p class="admin-page__subtitle">No affiliate found with id &ldquo;${escapeHtml(id)}&rdquo;.</p>
      <a class="btn btn--secondary" href="/admin/referrals/affiliates">Back to Affiliates</a>
    </section>
  `;
}

// mode is "create" or "edit". affiliate is null for create.
function renderAffiliateForm(mode, affiliate) {
  const isEdit = mode === "edit";

  return `
    <form
      class="admin-product-form"
      data-admin-referral-affiliate-form
      data-mode="${mode}"
      ${isEdit ? `data-affiliate-id="${escapeHtml(affiliate.id)}"` : ""}
      novalidate
    >
      ${
        isEdit
          ? `
        <div class="admin-readonly-field">
          <span class="form-field__label">Affiliate ID</span>
          <span class="admin-readonly-value">${escapeHtml(affiliate.id)}</span>
        </div>
        <div class="admin-readonly-field">
          <span class="form-field__label">Status</span>
          <span class="admin-readonly-value">${escapeHtml(affiliate.status)}</span>
        </div>
      `
          : ""
      }

      <div class="form-field">
        <label class="form-field__label" for="referralAffiliateName">Name <span class="form-field__required">*</span></label>
        <input type="text" id="referralAffiliateName" class="form-field__input" required maxlength="150" value="${escapeHtml(affiliate?.name || "")}" />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="referralAffiliateEmail">Email <span class="form-field__required">*</span></label>
        <input type="email" id="referralAffiliateEmail" class="form-field__input" required value="${escapeHtml(affiliate?.email || "")}" />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="referralAffiliatePhone">Phone <span class="form-field__optional">(optional)</span></label>
        <input type="text" id="referralAffiliatePhone" class="form-field__input" value="${escapeHtml(affiliate?.phone || "")}" />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="referralAffiliateCode">Referral Code <span class="form-field__optional">(optional &mdash; auto-generated from name if left blank)</span></label>
        <input type="text" id="referralAffiliateCode" class="form-field__input" maxlength="30" value="${escapeHtml(affiliate?.referralCode || "")}" />
        <p class="admin-product-form__hint">
          Public and shareable, e.g. seasonedzgroup.co.za/?ref=CODE (link capture is not live yet). Changing this on an
          already-shared link will break it, but never rewrites any past commission record.
        </p>
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="referralAffiliateCommissionOverride">Commission Rate Override % <span class="form-field__optional">(optional)</span></label>
          <input type="number" id="referralAffiliateCommissionOverride" class="form-field__input" min="0" max="50" step="0.01" value="${affiliate?.commissionRateOverride ?? ""}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="referralAffiliateDiscountOverride">Referral Discount Override % <span class="form-field__optional">(optional)</span></label>
          <input type="number" id="referralAffiliateDiscountOverride" class="form-field__input" min="0" max="50" step="0.01" value="${affiliate?.discountRateOverride ?? ""}" />
        </div>
      </div>
      <p class="admin-product-form__hint">
        Leave both blank to use the programme's current default rates (see Settings). Clear a field to remove an
        override and fall back to the default again.
      </p>

      <div class="form-field">
        <label class="form-field__label" for="referralAffiliateCustomerId">Linked Customer ID <span class="form-field__optional">(optional)</span></label>
        <input type="text" id="referralAffiliateCustomerId" class="form-field__input" value="${escapeHtml(affiliate?.customerId || "")}" placeholder="Leave blank unless linking a real customer account" />
        <p class="admin-product-form__hint">One customer account can only ever be linked to one affiliate.</p>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="referralAffiliateNotes">Admin Notes <span class="form-field__optional">(optional, internal only)</span></label>
        <textarea id="referralAffiliateNotes" class="form-field__input form-field__textarea" rows="3" maxlength="2000">${escapeHtml(affiliate?.notes || "")}</textarea>
      </div>

      <div class="form-banner form-banner--error" data-admin-referral-affiliate-form-banner hidden></div>

      <button type="submit" class="btn btn--primary">${isEdit ? "Save Changes" : "Create Affiliate"}</button>
    </form>
  `;
}

export async function renderAdminReferralAffiliateCreate() {
  try {
    await getCurrentAdmin();

    return `
      <section class="container admin-page">
        ${renderAdminNav("referrals")}
        <h1 class="admin-page__title">Referrals</h1>
        ${renderReferralsSubNav("affiliates")}
        <a class="admin-back-link" href="/admin/referrals/affiliates">&larr; Back to Affiliates</a>
        <h2 class="admin-page__section-title">Add Affiliate</h2>
        <p class="admin-page__subtitle">New affiliates always start Pending — approving is a separate step from the Affiliates list.</p>
        ${renderAffiliateForm("create", null)}
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

export async function renderAdminReferralAffiliateEdit({ id } = {}) {
  if (!id) return renderNotFound("");

  try {
    const response = await getAdminAffiliate(id);
    const affiliate = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("referrals")}
        <h1 class="admin-page__title">Referrals</h1>
        ${renderReferralsSubNav("affiliates")}
        <a class="admin-back-link" href="/admin/referrals/affiliates">&larr; Back to Affiliates</a>
        <h2 class="admin-page__section-title">Edit ${escapeHtml(affiliate.name)}</h2>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        ${renderCommissionSummary(affiliate)}
        ${renderAffiliateForm("edit", affiliate)}
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
