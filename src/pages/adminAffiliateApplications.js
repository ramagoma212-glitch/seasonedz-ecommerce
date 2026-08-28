// Version 7, Milestone 176: admin affiliate application list —
// /admin/referrals/applications. Same table/pagination shape as
// adminReferralAffiliates.js — reuses the existing admin-table CSS, no
// new design system. Summary fields only (brief section 33) — no
// identity number, not even masked, appears anywhere in this list.

import { getAdminAffiliateApplications } from "../js/api/adminAffiliateApplicationsApi.js";
import {
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderReferralsSubNav } from "../components/referralsSubNav.js";
import { formatDate, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

const STATUS_OPTIONS = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "ACTION_REQUIRED", "APPROVED", "REJECTED"];

function renderFilters(query) {
  const search = query.get("search") || "";
  const status = query.get("status") || "";

  return `
    <form class="admin-product-filters" data-admin-affiliate-application-filter-form>
      <input type="search" name="search" placeholder="Search name or email" value="${escapeHtml(search)}" class="form-field__input" />
      <select name="status" class="form-field__input">
        <option value="">All statuses</option>
        ${STATUS_OPTIONS.map((option) => `<option value="${option}"${option === status ? " selected" : ""}>${option}</option>`).join("")}
      </select>
      <button type="submit" class="btn btn--secondary btn--sm">Filter</button>
    </form>
  `;
}

function renderApplicationsTable(applications) {
  if (applications.length === 0) {
    return `<p class="admin-empty">No affiliate applications yet.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Applicant</th>
            <th>Type</th>
            <th>Email</th>
            <th>Mobile</th>
            <th>City/Province</th>
            <th>Submitted</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${applications
            .map(
              (app) => `
            <tr>
              <td>${escapeHtml(app.fullName || "N/A")}</td>
              <td>${escapeHtml(app.applicantType)}</td>
              <td>${escapeHtml(app.email || "N/A")}</td>
              <td>${escapeHtml(app.mobile || "N/A")}</td>
              <td>${escapeHtml([app.city, app.province].filter(Boolean).join(", ") || "N/A")}</td>
              <td>${app.submittedAt ? formatDate(app.submittedAt) : "N/A"}</td>
              <td>${renderStatusBadge(app.status)}</td>
              <td class="admin-table__actions">
                <a href="/admin/referrals/applications/${encodeURIComponent(app.id)}" class="admin-section__link">Review</a>
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

  function pageLink(page) {
    const params = new URLSearchParams(query);
    params.set("page", page);
    return `/admin/referrals/applications?${params.toString()}`;
  }

  return `
    <div class="admin-pagination">
      ${result.page <= 1 ? `<span class="btn btn--secondary btn--sm is-disabled">Previous</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page - 1)}">Previous</a>`}
      <span class="admin-pagination__label">Page ${result.page} of ${result.totalPages}</span>
      ${result.page >= result.totalPages ? `<span class="btn btn--secondary btn--sm is-disabled">Next</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page + 1)}">Next</a>`}
    </div>
  `;
}

export async function renderAdminAffiliateApplications({ query } = {}) {
  const effectiveQuery = query || new URLSearchParams();
  const page = Number(effectiveQuery.get("page")) || 1;
  const search = effectiveQuery.get("search") || undefined;
  const status = effectiveQuery.get("status") || undefined;

  try {
    const response = await getAdminAffiliateApplications({ page, search, status });
    const result = response.data;

    return `
      <section class="container admin-page">
        ${renderAdminNav("referrals")}
        <h1 class="admin-page__title">Referrals</h1>
        ${renderReferralsSubNav("applications")}

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">Affiliate Applications</h2>
        </div>
        <p class="admin-page__subtitle">${result.total} application${result.total === 1 ? "" : "s"} total</p>
        ${renderFilters(effectiveQuery)}
        ${renderApplicationsTable(result.applications)}
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
