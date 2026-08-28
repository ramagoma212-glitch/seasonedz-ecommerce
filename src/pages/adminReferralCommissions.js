// Version 7, Milestone 172B.5: the real commission lifecycle list —
// Orders & Commissions. Same table/pagination shape as
// adminReferralAffiliates.js, reusing the existing admin-table/
// admin-badge CSS. Every eligibility/status value shown here comes
// straight from the backend (referralCommission.service.ts's
// computeApprovalEligibility()) — this page never recomputes or guesses
// any of it client-side.

import { getAdminReferralCommissions } from "../js/api/adminReferralsApi.js";
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
import { formatCurrency, formatDate, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

const STATUS_OPTIONS = ["PENDING", "APPROVED", "PAID", "REVERSED"];

function renderFilters(query) {
  const status = query.get("status") || "";
  const eligibleOnly = query.get("eligibleOnly") === "true";
  const affiliateId = query.get("affiliateId") || "";

  return `
    <form class="admin-product-filters" data-admin-commission-filter-form>
      <select name="status" class="form-field__input">
        <option value="">All statuses</option>
        ${STATUS_OPTIONS.map((option) => `<option value="${option}"${option === status ? " selected" : ""}>${option}</option>`).join("")}
      </select>
      <label class="admin-product-form__checkboxes" style="display:inline-flex;align-items:center;gap:0.4em;">
        <input type="checkbox" name="eligibleOnly" value="true" ${eligibleOnly ? "checked" : ""} /> Eligible for approval only
      </label>
      <input type="hidden" name="affiliateId" value="${escapeHtml(affiliateId)}" />
      <button type="submit" class="btn btn--secondary btn--sm">Filter</button>
    </form>
  `;
}

function renderEligibilityCell(commission) {
  if (commission.status !== "PENDING") return "N/A";
  if (commission.eligibility.eligible) {
    return `<span class="admin-badge admin-badge--success">Eligible now</span>`;
  }
  if (commission.eligibility.reason === "VALIDATION_PERIOD_INCOMPLETE" && commission.eligibility.eligibleForApprovalAt) {
    return `<span title="${escapeHtml(commission.eligibility.reasonLabel)}">From ${formatDate(commission.eligibility.eligibleForApprovalAt)}</span>`;
  }
  return `<span class="admin-badge admin-badge--neutral" title="${escapeHtml(commission.eligibility.reasonLabel || "")}">Not yet</span>`;
}

function renderActionButtons(commission) {
  const buttons = [`<a href="/admin/referrals/commissions/${encodeURIComponent(commission.id)}" class="admin-section__link">View</a>`];
  if (commission.status === "PENDING" && commission.eligibility.eligible) {
    buttons.push(`<button type="button" class="btn btn--secondary btn--sm" data-action="approve-commission" data-commission-id="${escapeHtml(commission.id)}">Approve</button>`);
  }
  return buttons.join(" ");
}

function renderCommissionsTable(commissions) {
  if (commissions.length === 0) {
    return `<p class="admin-empty">No commissions match these filters. A commission is only ever created automatically, for a genuinely referred order. It is never fabricated here.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Affiliate</th>
            <th>Code</th>
            <th>Order Date</th>
            <th>Qualifying Subtotal</th>
            <th>Customer Discount</th>
            <th>Commission Rate</th>
            <th>Commission</th>
            <th>Status</th>
            <th>Eligible From</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${commissions
            .map(
              (commission) => `
            <tr${commission.paidButOrderNowNonPayable ? ' class="admin-table__row--warning"' : ""}>
              <td><a href="/admin/orders/${encodeURIComponent(commission.order.orderNumber)}">${escapeHtml(commission.order.orderNumber)}</a></td>
              <td>${escapeHtml(commission.affiliateNameSnapshot)}</td>
              <td>${escapeHtml(commission.affiliateReferralCodeSnapshot)}</td>
              <td>${formatDate(commission.order.createdAt)}</td>
              <td>${formatCurrency(commission.qualifyingProductSubtotal)}</td>
              <td>${formatCurrency(commission.discountAmount)}</td>
              <td>${commission.commissionRateApplied}%</td>
              <td>${formatCurrency(commission.commissionAmount)}</td>
              <td>
                ${renderStatusBadge(commission.status)}
                ${commission.paidButOrderNowNonPayable ? '<br /><span class="admin-badge admin-badge--danger">CLAWBACK REQUIRED</span>' : ""}
              </td>
              <td>${renderEligibilityCell(commission)}</td>
              <td class="admin-table__actions">${renderActionButtons(commission)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPagination(result, query) {
  if (result.totalPages <= 1) return "";

  const prevDisabled = result.page <= 1;
  const nextDisabled = result.page >= result.totalPages;

  function pageLink(page) {
    const params = new URLSearchParams(query);
    params.set("page", page);
    return `/admin/referrals/commissions?${params.toString()}`;
  }

  return `
    <div class="admin-pagination">
      ${prevDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Previous</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page - 1)}">Previous</a>`}
      <span class="admin-pagination__label">Page ${result.page} of ${result.totalPages}</span>
      ${nextDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Next</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page + 1)}">Next</a>`}
    </div>
  `;
}

export async function renderAdminReferralCommissions({ query } = {}) {
  const effectiveQuery = query || new URLSearchParams();
  const page = Number(effectiveQuery.get("page")) || 1;
  const status = effectiveQuery.get("status") || undefined;
  const eligibleOnly = effectiveQuery.get("eligibleOnly") === "true";
  const affiliateId = effectiveQuery.get("affiliateId") || undefined;

  try {
    const response = await getAdminReferralCommissions({ page, status, eligibleOnly, affiliateId });
    const result = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("referrals")}
        <h1 class="admin-page__title">Referrals</h1>
        ${renderReferralsSubNav("commissions")}

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">Orders &amp; Commissions</h2>
        </div>
        <p class="admin-page__subtitle">${result.total} commission${result.total === 1 ? "" : "s"} total</p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        <div class="form-banner form-banner--error" data-admin-commission-banner hidden></div>
        ${renderFilters(effectiveQuery)}
        ${renderCommissionsTable(result.commissions)}
        ${renderPagination(result, effectiveQuery)}
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
