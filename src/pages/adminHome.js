// Admin dashboard overview page (Version 7, Milestone 59 — read only).
// Replaces the Milestone 58 "signed in" placeholder with real business
// data — total/pending/paid order counts, recent orders, recent
// enquiries, low-stock products, and static manual-action reminders.
// No edit, delete, or status-update control exists anywhere on this
// page — every value here comes from GET /api/admin/dashboard, itself
// a read-only, requireAdminAuth-protected route.

import { getCurrentAdmin } from "../js/api/adminAuthApi.js";
import { getAdminDashboard } from "../js/api/adminDashboardApi.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { formatCurrency, formatDate, humanizeEnum, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

function renderOverviewCards(counts, lowStockCount) {
  return `
    <div class="admin-cards">
      <div class="admin-card">
        <span class="admin-card__label">Total Orders</span>
        <span class="admin-card__value">${counts.totalOrders}</span>
      </div>
      <div class="admin-card">
        <span class="admin-card__label">Pending Payment</span>
        <span class="admin-card__value">${counts.pendingOrders}</span>
      </div>
      <div class="admin-card">
        <span class="admin-card__label">Paid Orders</span>
        <span class="admin-card__value">${counts.paidOrders}</span>
      </div>
      <div class="admin-card">
        <span class="admin-card__label">Low Stock Items</span>
        <span class="admin-card__value">${lowStockCount}</span>
      </div>
    </div>
  `;
}

function renderRecentOrdersTable(orders) {
  if (orders.length === 0) {
    return `<p class="admin-empty">No orders yet.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
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

function renderRecentEnquiriesTable(enquiries) {
  if (enquiries.length === 0) {
    return `<p class="admin-empty">No enquiries yet.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Name</th>
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

function renderLowStockTable(products) {
  if (products.length === 0) {
    return `<p class="admin-empty">No low stock products right now.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th>Stock</th>
            <th>Threshold</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${products
            .map(
              (product) => `
            <tr>
              <td>${escapeHtml(product.name)}</td>
              <td>${escapeHtml(product.sku || "—")}</td>
              <td>${product.stockQuantity}</td>
              <td>${product.lowStockThreshold}</td>
              <td>${renderStatusBadge(product.status)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderManualReminders(reminders) {
  return `
    <ul class="admin-reminders">
      ${reminders.map((reminder) => `<li>${escapeHtml(reminder)}</li>`).join("")}
    </ul>
  `;
}

export async function renderAdminHome() {
  try {
    const [adminResponse, dashboardResponse] = await Promise.all([getCurrentAdmin(), getAdminDashboard()]);
    const admin = adminResponse.data.admin;
    const dashboard = dashboardResponse.data;

    return `
      <section class="container admin-page">
        ${renderAdminNav("dashboard")}
        <h1 class="admin-page__title">Welcome, ${escapeHtml(admin.name)}</h1>
        <p class="admin-page__subtitle">Signed in as ${escapeHtml(admin.email)}</p>

        ${renderOverviewCards(dashboard.counts, dashboard.lowStockProducts.length)}

        <div class="admin-section">
          <div class="admin-section__header">
            <h2>Recent Orders</h2>
            <a class="admin-section__link" href="/admin/orders">View all</a>
          </div>
          ${renderRecentOrdersTable(dashboard.recentOrders)}
        </div>

        <div class="admin-section">
          <div class="admin-section__header">
            <h2>Recent Enquiries</h2>
            <a class="admin-section__link" href="/admin/enquiries">View all</a>
          </div>
          ${renderRecentEnquiriesTable(dashboard.recentEnquiries)}
        </div>

        <div class="admin-section">
          <div class="admin-section__header">
            <h2>Low Stock Products</h2>
          </div>
          ${renderLowStockTable(dashboard.lowStockProducts)}
        </div>

        <div class="admin-section">
          <div class="admin-section__header">
            <h2>Manual Action Reminders</h2>
          </div>
          ${renderManualReminders(dashboard.manualReminders)}
        </div>
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
