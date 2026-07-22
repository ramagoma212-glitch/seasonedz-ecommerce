// Admin orders list page (Version 7, Milestone 59 — read only). No
// edit, delete, or status-update control exists here — each row only
// links through to the read-only order detail page.

import { getAdminOrders } from "../js/api/adminDashboardApi.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { formatCurrency, formatDate, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

function renderOrdersTable(orders) {
  if (orders.length === 0) {
    return `<p class="admin-empty">No orders found.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Contact</th>
            <th>Items</th>
            <th>Total</th>
            <th>Payment</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${orders
            .map(
              (order) => `
            <tr>
              <td><a href="/admin/orders/${encodeURIComponent(order.orderNumber)}">${escapeHtml(order.orderNumber)}</a></td>
              <td>${escapeHtml(order.customerName)}</td>
              <td>${escapeHtml(order.customerEmail)}<br>${escapeHtml(order.customerPhone)}</td>
              <td>${order.itemCount}</td>
              <td>${formatCurrency(order.total)}</td>
              <td>${renderStatusBadge(order.paymentStatus)}</td>
              <td>${renderStatusBadge(order.status)}</td>
              <td>${formatDate(order.createdAt)}</td>
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

export async function renderAdminOrders({ query } = {}) {
  const page = Number(query?.get("page")) || 1;

  try {
    const response = await getAdminOrders({ page });
    const result = response.data;

    return `
      <section class="container admin-page">
        ${renderAdminNav("orders")}
        <h1 class="admin-page__title">Orders</h1>
        <p class="admin-page__subtitle">${result.total} order${result.total === 1 ? "" : "s"} total</p>
        ${renderOrdersTable(result.orders)}
        ${renderPagination(result, "/admin/orders")}
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
