// Admin enquiries list page (Version 7, Milestone 59 — read only). No
// status-update, reply, or delete control exists here — a message
// preview only, matching the milestone's strictly-read-only scope.

import { getAdminEnquiries } from "../js/api/adminDashboardApi.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { formatDate, humanizeEnum, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

function renderEnquiriesTable(enquiries) {
  if (enquiries.length === 0) {
    return `<p class="admin-empty">No enquiries found.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Name</th>
            <th>Contact</th>
            <th>Subject / Business</th>
            <th>Message</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${enquiries
            .map(
              (enquiry) => `
            <tr>
              <td>${escapeHtml(humanizeEnum(enquiry.type))}</td>
              <td>${escapeHtml(enquiry.name)}</td>
              <td>${escapeHtml(enquiry.email)}${enquiry.phone ? `<br>${escapeHtml(enquiry.phone)}` : ""}</td>
              <td>${enquiry.subjectOrCompany ? escapeHtml(enquiry.subjectOrCompany) : "—"}</td>
              <td class="admin-table__message">${escapeHtml(enquiry.messagePreview)}</td>
              <td>${renderStatusBadge(enquiry.status)}</td>
              <td>${formatDate(enquiry.createdAt)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPagination(result, basePath) {
  if (result.totalPages <= 1) return "";

  const prevDisabled = result.page <= 1;
  const nextDisabled = result.page >= result.totalPages;

  return `
    <div class="admin-pagination">
      ${prevDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Previous</span>` : `<a class="btn btn--secondary btn--sm" href="#${basePath}?page=${result.page - 1}">Previous</a>`}
      <span class="admin-pagination__label">Page ${result.page} of ${result.totalPages}</span>
      ${nextDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Next</span>` : `<a class="btn btn--secondary btn--sm" href="#${basePath}?page=${result.page + 1}">Next</a>`}
    </div>
  `;
}

export async function renderAdminEnquiries({ query } = {}) {
  const page = Number(query?.get("page")) || 1;

  try {
    const response = await getAdminEnquiries({ page });
    const result = response.data;

    return `
      <section class="container admin-page">
        ${renderAdminNav("enquiries")}
        <h1 class="admin-page__title">Enquiries</h1>
        <p class="admin-page__subtitle">${result.total} enquir${result.total === 1 ? "y" : "ies"} total</p>
        ${renderEnquiriesTable(result.enquiries)}
        ${renderPagination(result, "/admin/enquiries")}
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
