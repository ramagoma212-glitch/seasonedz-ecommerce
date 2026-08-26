// Version 7, Milestone 172B.5: full commission detail — every snapshot
// field, the current eligibility result (with its reason, exactly as
// the backend's own approve check would enforce), and the
// approve/reverse actions. No lifecycle decision is ever made
// client-side; this page only relays the admin's action and shows
// whatever the backend decides.

import { getAdminReferralCommission } from "../js/api/adminReferralsApi.js";
import {
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
  consumePendingAdminMessage,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderReferralsSubNav } from "../components/referralsSubNav.js";
import { formatCurrency, formatDateTime, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

function renderRow(label, value) {
  return `<div class="order-confirmation__row"><span>${label}</span><span>${value}</span></div>`;
}

function renderEligibilitySection(commission) {
  if (commission.status !== "PENDING") {
    return "";
  }

  const eligibility = commission.eligibility;
  return `
    <div class="order-confirmation__card">
      <h3>Approval Eligibility</h3>
      ${renderRow("Currently eligible", eligibility.eligible ? "Yes" : "No")}
      ${!eligibility.eligible ? renderRow("Reason", escapeHtml(eligibility.reasonLabel || "")) : ""}
      ${eligibility.eligibleForApprovalAt ? renderRow("Eligible from", formatDateTime(eligibility.eligibleForApprovalAt)) : ""}
      ${eligibility.fulfilmentBasis ? renderRow("Fulfilment basis", eligibility.fulfilmentBasis === "DIGITAL_PAYMENT_CONFIRMED" ? "Payment confirmed (digital order)" : "Delivered (order status history)") : ""}
    </div>
  `;
}

function renderActions(commission) {
  if (commission.status === "PENDING") {
    return `
      <div class="order-confirmation__card">
        <h3>Actions</h3>
        <div class="form-banner form-banner--error" data-admin-commission-detail-banner hidden></div>
        <button type="button" class="btn btn--primary" data-action="approve-commission" data-commission-id="${escapeHtml(commission.id)}" ${commission.eligibility.eligible ? "" : "disabled"}>
          Approve
        </button>
        ${!commission.eligibility.eligible ? `<p class="admin-product-form__hint">${escapeHtml(commission.eligibility.reasonLabel || "")}</p>` : ""}
        <hr />
        ${renderReverseForm(commission)}
      </div>
    `;
  }

  if (commission.status === "APPROVED") {
    return `
      <div class="order-confirmation__card">
        <h3>Actions</h3>
        <div class="form-banner form-banner--error" data-admin-commission-detail-banner hidden></div>
        <p class="admin-product-form__hint">To mark this commission paid, use the <a href="/admin/referrals/payouts">Payouts</a> page — payment is always grouped by affiliate there.</p>
        ${renderReverseForm(commission)}
      </div>
    `;
  }

  if (commission.status === "PAID") {
    return `
      <div class="order-confirmation__card">
        <h3>Actions</h3>
        <div class="form-banner form-banner--error" data-admin-commission-detail-banner hidden></div>
        ${
          commission.paidButOrderNowNonPayable
            ? `<div class="form-banner form-banner--error">This order is now CANCELLED/REFUNDED, but this commission is still PAID. This is a clawback case — reversing it below records that the affiliate must be asked to return this payment; it does not move any money automatically.</div>`
            : ""
        }
        ${renderReverseForm(commission, true)}
      </div>
    `;
  }

  return "";
}

function renderReverseForm(commission, isClawback = false) {
  return `
    <form data-admin-commission-reverse-form data-commission-id="${escapeHtml(commission.id)}">
      <div class="form-field">
        <label class="form-field__label" for="reversalReason">${isClawback ? "Clawback reason" : "Reversal reason"}</label>
        <textarea id="reversalReason" name="reason" class="form-field__input" rows="2" required minlength="3" maxlength="500"></textarea>
      </div>
      ${
        isClawback
          ? `<label style="display:flex;align-items:center;gap:0.4em;">
               <input type="checkbox" name="confirmClawback" value="true" required />
               I understand this commission was already paid — reversing it does not recover the money automatically.
             </label>`
          : ""
      }
      <button type="submit" class="btn btn--secondary">${isClawback ? "Reverse (Clawback)" : "Reverse"}</button>
    </form>
  `;
}

export async function renderAdminReferralCommissionDetail({ id } = {}) {
  try {
    const response = await getAdminReferralCommission(id);
    const commission = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("referrals")}
        <h1 class="admin-page__title">Referrals</h1>
        ${renderReferralsSubNav("commissions")}

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">Commission for Order ${escapeHtml(commission.order.orderNumber)}</h2>
          <a class="admin-section__link" href="/admin/referrals/commissions">&larr; Back to Commissions</a>
        </div>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}

        <div class="order-confirmation__card">
          <h3>Referral</h3>
          ${renderRow("Order", `<a href="/admin/orders/${encodeURIComponent(commission.order.orderNumber)}">${escapeHtml(commission.order.orderNumber)}</a>`)}
          ${renderRow("Order date", formatDateTime(commission.order.createdAt))}
          ${renderRow("Order status", renderStatusBadge(commission.order.status))}
          ${renderRow("Customer", `${escapeHtml(commission.order.customerName)} (${escapeHtml(commission.order.customerEmail)})`)}
          ${renderRow("Affiliate", `<a href="/admin/referrals/affiliates/${encodeURIComponent(commission.affiliateId)}/edit">${escapeHtml(commission.affiliateNameSnapshot)}</a>`)}
          ${renderRow("Referral code (at the time)", escapeHtml(commission.affiliateReferralCodeSnapshot))}
        </div>

        <div class="order-confirmation__card">
          <h3>Financial Snapshot</h3>
          ${renderRow("Qualifying product subtotal", formatCurrency(commission.qualifyingProductSubtotal))}
          ${renderRow("Discount rate applied", `${commission.discountRateApplied}%`)}
          ${renderRow("Discount amount", formatCurrency(commission.discountAmount))}
          ${renderRow("Net qualifying amount", formatCurrency(commission.netQualifyingAmount))}
          ${renderRow("Commission rate applied", `${commission.commissionRateApplied}%`)}
          ${renderRow("Commission amount", `<strong>${formatCurrency(commission.commissionAmount)}</strong>`)}
          <p class="admin-product-form__hint">These figures were locked in at order-creation time and never change, even if programme settings or the affiliate's own rates change later.</p>
        </div>

        <div class="order-confirmation__card">
          <h3>Status</h3>
          ${renderRow("Status", renderStatusBadge(commission.status))}
          ${commission.approvedAt ? renderRow("Approved at", formatDateTime(commission.approvedAt)) : ""}
          ${commission.paidAt ? renderRow("Paid at", formatDateTime(commission.paidAt)) : ""}
          ${commission.reversedAt ? renderRow("Reversed at", formatDateTime(commission.reversedAt)) : ""}
          ${commission.reversalReason ? renderRow("Reversal reason", escapeHtml(commission.reversalReason)) : ""}
        </div>

        ${renderEligibilitySection(commission)}
        ${renderActions(commission)}
      </section>
    `;
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return renderAdminRedirecting();
    }
    if (error?.status === 404) {
      return `
        <section class="container admin-page">
          ${renderAdminNav("referrals")}
          <h1 class="admin-page__title">Referrals</h1>
          ${renderReferralsSubNav("commissions")}
          <p class="admin-empty">Commission not found.</p>
        </section>
      `;
    }
    return renderAdminConnectionError(isBackendUnavailable(error));
  }
}
