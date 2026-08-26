// Version 7, Milestone 172B.3: admin affiliate list for Seasonedz's
// own referral programme. Same table/pagination shape as
// adminAffiliateProducts.js (172B) and adminProducts.js, reusing the
// existing admin-table/admin-badge CSS — no new design system.

import { getAdminAffiliates } from "../js/api/adminReferralsApi.js";
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
import { formatDate, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

const STATUS_OPTIONS = ["PENDING", "ACTIVE", "SUSPENDED", "REJECTED"];

function renderFilters(query) {
  const search = query.get("search") || "";
  const status = query.get("status") || "";

  return `
    <form class="admin-product-filters" data-admin-referral-affiliate-filter-form>
      <input type="search" name="search" placeholder="Search name, email or referral code" value="${escapeHtml(search)}" class="form-field__input" />
      <select name="status" class="form-field__input">
        <option value="">All statuses</option>
        ${STATUS_OPTIONS.map((option) => `<option value="${option}"${option === status ? " selected" : ""}>${option}</option>`).join("")}
      </select>
      <button type="submit" class="btn btn--secondary btn--sm">Filter</button>
    </form>
  `;
}

function renderActionButtons(affiliate) {
  const buttons = [];
  if (affiliate.status === "PENDING") {
    buttons.push(`<button type="button" class="btn btn--secondary btn--sm" data-action="approve-affiliate" data-affiliate-id="${escapeHtml(affiliate.id)}">Approve</button>`);
    buttons.push(`<button type="button" class="btn btn--secondary btn--sm" data-action="reject-affiliate" data-affiliate-id="${escapeHtml(affiliate.id)}">Reject</button>`);
  }
  if (affiliate.status === "ACTIVE") {
    buttons.push(`<button type="button" class="btn btn--secondary btn--sm" data-action="suspend-affiliate" data-affiliate-id="${escapeHtml(affiliate.id)}">Suspend</button>`);
  }
  if (affiliate.status === "SUSPENDED") {
    buttons.push(`<button type="button" class="btn btn--secondary btn--sm" data-action="reactivate-affiliate" data-affiliate-id="${escapeHtml(affiliate.id)}">Reactivate</button>`);
  }
  return buttons.join("");
}

function renderAffiliatesTable(affiliates) {
  if (affiliates.length === 0) {
    return `<p class="admin-empty">No affiliates yet. Use "Add Affiliate" to create the first one.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Referral Code</th>
            <th>Commission Override</th>
            <th>Discount Override</th>
            <th>Status</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${affiliates
            .map(
              (affiliate) => `
            <tr data-affiliate-row="${escapeHtml(affiliate.id)}">
              <td>${escapeHtml(affiliate.name)}</td>
              <td>${escapeHtml(affiliate.email)}</td>
              <td>${escapeHtml(affiliate.referralCode)}</td>
              <td>${affiliate.commissionRateOverride === null ? "&mdash;" : `${affiliate.commissionRateOverride}%`}</td>
              <td>${affiliate.discountRateOverride === null ? "&mdash;" : `${affiliate.discountRateOverride}%`}</td>
              <td>${renderStatusBadge(affiliate.status)}</td>
              <td>${formatDate(affiliate.updatedAt)}</td>
              <td class="admin-table__actions">
                <a href="/admin/referrals/affiliates/${encodeURIComponent(affiliate.id)}/edit" class="admin-section__link">Edit</a>
                ${renderActionButtons(affiliate)}
              </td>
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
    return `/admin/referrals/affiliates?${params.toString()}`;
  }

  return `
    <div class="admin-pagination">
      ${prevDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Previous</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page - 1)}">Previous</a>`}
      <span class="admin-pagination__label">Page ${result.page} of ${result.totalPages}</span>
      ${nextDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Next</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page + 1)}">Next</a>`}
    </div>
  `;
}

export async function renderAdminReferralAffiliates({ query } = {}) {
  const effectiveQuery = query || new URLSearchParams();
  const page = Number(effectiveQuery.get("page")) || 1;
  const search = effectiveQuery.get("search") || undefined;
  const status = effectiveQuery.get("status") || undefined;

  try {
    const response = await getAdminAffiliates({ page, search, status });
    const result = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("referrals")}
        <h1 class="admin-page__title">Referrals</h1>
        ${renderReferralsSubNav("affiliates")}

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">Affiliates</h2>
          <a class="btn btn--primary btn--sm" href="/admin/referrals/affiliates/new">Add Affiliate</a>
        </div>
        <p class="admin-page__subtitle">${result.total} affiliate${result.total === 1 ? "" : "s"} total</p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        <div class="form-banner form-banner--error" data-admin-referral-affiliate-banner hidden></div>
        ${renderFilters(effectiveQuery)}
        ${renderAffiliatesTable(result.affiliates)}
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
