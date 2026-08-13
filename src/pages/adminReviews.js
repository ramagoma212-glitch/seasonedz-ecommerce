// Admin review moderation page (Version 7, Milestone 171C). Approve or
// reject a genuine, customer-submitted review — nothing on this page
// creates a review. Defaults to the PENDING queue (the only thing an
// admin actually needs to act on day to day); the status filter can
// widen that to see APPROVED/REJECTED/all history too.

import { getAdminReviews } from "../js/api/adminDashboardApi.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { formatDateTime, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";
import { renderStars } from "../components/productCard.js";

const STATUS_FILTERS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "all", label: "All" },
];

function renderStatusFilterTabs(activeStatus) {
  return `
    <div class="admin-filter-tabs" role="tablist" aria-label="Filter reviews by status">
      ${STATUS_FILTERS.map(
        (filter) =>
          `<a
            href="/admin/reviews?status=${filter.value}"
            class="admin-filter-tabs__tab${filter.value === activeStatus ? " is-active" : ""}"
            role="tab"
            aria-selected="${filter.value === activeStatus}"
          >${filter.label}</a>`
      ).join("")}
    </div>
  `;
}

function renderReviewRow(review) {
  const isPending = review.status === "PENDING";
  return `
    <tr data-review-row data-review-id="${escapeHtml(review.id)}">
      <td>${escapeHtml(review.productName)}</td>
      <td>${escapeHtml(review.customerName)}</td>
      <td>${renderStars(review.rating)}</td>
      <td class="admin-table__message">${escapeHtml(review.reviewText)}</td>
      <td>${renderStatusBadge(review.status)}</td>
      <td>${formatDateTime(review.createdAt)}</td>
      <td>
        ${
          isPending
            ? `
          <div class="admin-table__actions">
            <button type="button" class="btn btn--primary btn--sm" data-action="approve-review" data-review-id="${escapeHtml(review.id)}">Approve</button>
            <button type="button" class="btn btn--secondary btn--sm" data-action="reject-review" data-review-id="${escapeHtml(review.id)}">Reject</button>
          </div>
        `
            : "—"
        }
      </td>
    </tr>
  `;
}

function renderReviewsTable(reviews) {
  if (reviews.length === 0) {
    return `<p class="admin-empty">No reviews found.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Customer</th>
            <th>Rating</th>
            <th>Review</th>
            <th>Status</th>
            <th>Submitted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody data-reviews-tbody>
          ${reviews.map(renderReviewRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAdminReviews({ query } = {}) {
  const status = query?.get("status") || "PENDING";

  try {
    const response = await getAdminReviews(status);
    const reviews = response.data.reviews;

    return `
      <section class="container admin-page">
        ${renderAdminNav("reviews")}
        <h1 class="admin-page__title">Product Reviews</h1>
        <p class="admin-page__subtitle">Approve or reject genuine customer reviews. No review is ever created here — only what a customer already submitted.</p>
        ${renderStatusFilterTabs(status)}
        <div class="form-banner" data-admin-reviews-banner hidden></div>
        ${renderReviewsTable(reviews)}
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
