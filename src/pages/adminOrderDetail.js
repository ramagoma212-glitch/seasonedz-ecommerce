// Admin order detail page (Version 7, Milestone 59 — read only). Reuses
// the exact same GET /api/admin/orders/:orderNumber shape the backend
// already returns (order.service.ts's OrderOutput, admin-gated) — no
// edit, status update, or delete control exists on this page, matching
// the milestone's strictly-read-only scope. Visually reuses the
// existing `.order-confirmation__card` pattern from the customer-facing
// order confirmation page, per VERSION_7_ADMIN_DASHBOARD_PLAN.md's
// admin UX plan.

import { getAdminOrder } from "../js/api/adminDashboardApi.js";
import { ApiError } from "../js/apiClient.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { formatCurrency, formatDate, formatDateTime, humanizeEnum, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

function renderNotFound(orderNumber) {
  return `
    <section class="container admin-page">
      ${renderAdminNav("orders")}
      <h1 class="admin-page__title">Order Not Found</h1>
      <p class="admin-page__subtitle">No order found with number &ldquo;${escapeHtml(orderNumber)}&rdquo;.</p>
      <a class="btn btn--secondary" href="#/admin/orders">Back to Orders</a>
    </section>
  `;
}

function renderItemsTable(items) {
  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr><th>Product</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td>${escapeHtml(item.productName)}</td>
              <td>${escapeHtml(item.sku || "—")}</td>
              <td>${item.quantity}</td>
              <td>${formatCurrency(item.unitPrice)}</td>
              <td>${formatCurrency(item.lineTotal)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAdminOrderDetail({ orderNumber } = {}) {
  if (!orderNumber) return renderNotFound("");

  try {
    const response = await getAdminOrder(orderNumber);
    const order = response.data;

    return `
      <section class="container admin-page">
        ${renderAdminNav("orders")}
        <a class="admin-back-link" href="#/admin/orders">&larr; Back to Orders</a>
        <h1 class="admin-page__title">Order ${escapeHtml(order.orderNumber)}</h1>

        <div class="admin-order-detail__grid">
          <div class="order-confirmation__card">
            <h3>Order Summary</h3>
            <div class="order-confirmation__row"><span>Order Date</span><span>${formatDateTime(order.createdAt)}</span></div>
            <div class="order-confirmation__row"><span>Order Status</span>${renderStatusBadge(order.status)}</div>
            <div class="order-confirmation__row"><span>Payment Status</span>${renderStatusBadge(order.paymentStatus)}</div>
            <div class="order-confirmation__row"><span>Payment Method</span><span>${escapeHtml(humanizeEnum(order.paymentMethod))}</span></div>
            <div class="order-confirmation__row"><span>Fulfilment Status</span>${renderStatusBadge(order.fulfilmentStatus)}</div>
          </div>

          <div class="order-confirmation__card">
            <h3>Customer</h3>
            <p>${escapeHtml(order.customer.firstName)} ${escapeHtml(order.customer.lastName)}</p>
            <p>${escapeHtml(order.customer.email)}</p>
            <p>${escapeHtml(order.customer.phone)}</p>
          </div>

          <div class="order-confirmation__card">
            <h3>Delivery Address</h3>
            <p>${escapeHtml(order.deliveryAddress.streetAddress)}</p>
            <p>${escapeHtml(order.deliveryAddress.suburb)}, ${escapeHtml(order.deliveryAddress.city)}</p>
            <p>${escapeHtml(order.deliveryAddress.province)}, ${escapeHtml(order.deliveryAddress.postalCode)}</p>
            <p>${escapeHtml(order.deliveryAddress.country)}</p>
            ${order.deliveryAddress.deliveryNotes ? `<p><strong>Notes:</strong> ${escapeHtml(order.deliveryAddress.deliveryNotes)}</p>` : ""}
          </div>

          ${
            order.payment
              ? `
          <div class="order-confirmation__card">
            <h3>Payment</h3>
            <div class="order-confirmation__row"><span>Method</span><span>${escapeHtml(humanizeEnum(order.payment.method))}</span></div>
            <div class="order-confirmation__row"><span>Status</span>${renderStatusBadge(order.payment.status)}</div>
            <div class="order-confirmation__row"><span>Amount</span><span>${formatCurrency(order.payment.amount)}</span></div>
            ${order.payment.provider ? `<div class="order-confirmation__row"><span>Provider</span><span>${escapeHtml(order.payment.provider)}</span></div>` : ""}
            ${order.payment.paidAt ? `<div class="order-confirmation__row"><span>Paid At</span><span>${formatDateTime(order.payment.paidAt)}</span></div>` : ""}
          </div>
          `
              : ""
          }

          ${
            order.shipping
              ? `
          <div class="order-confirmation__card">
            <h3>Shipping</h3>
            <div class="order-confirmation__row"><span>Status</span>${renderStatusBadge(order.shipping.status)}</div>
            ${order.shipping.courierName ? `<div class="order-confirmation__row"><span>Courier</span><span>${escapeHtml(order.shipping.courierName)}</span></div>` : ""}
            ${order.shipping.trackingNumber ? `<div class="order-confirmation__row"><span>Tracking #</span><span>${escapeHtml(order.shipping.trackingNumber)}</span></div>` : ""}
            ${order.shipping.estimatedDelivery ? `<div class="order-confirmation__row"><span>Estimated Delivery</span><span>${formatDate(order.shipping.estimatedDelivery)}</span></div>` : ""}
            ${order.shipping.shippedAt ? `<div class="order-confirmation__row"><span>Shipped At</span><span>${formatDateTime(order.shipping.shippedAt)}</span></div>` : ""}
            ${order.shipping.deliveredAt ? `<div class="order-confirmation__row"><span>Delivered At</span><span>${formatDateTime(order.shipping.deliveredAt)}</span></div>` : ""}
          </div>
          `
              : ""
          }
        </div>

        <div class="order-confirmation__card">
          <h3>Items</h3>
          ${renderItemsTable(order.items)}
          <div class="order-confirmation__row"><span>Subtotal</span><span>${formatCurrency(order.subtotal)}</span></div>
          <div class="order-confirmation__row"><span>Delivery Fee</span><span>${order.deliveryFee === 0 ? "Free" : formatCurrency(order.deliveryFee)}</span></div>
          ${order.discountTotal ? `<div class="order-confirmation__row"><span>Discount</span><span>-${formatCurrency(order.discountTotal)}</span></div>` : ""}
          <div class="order-confirmation__row admin-total-row"><span>Total</span><span>${formatCurrency(order.total)}</span></div>
        </div>
      </section>
    `;
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return renderAdminRedirecting();
    }
    if (error instanceof ApiError && error.status === 404) {
      return renderNotFound(orderNumber);
    }
    return renderAdminConnectionError(isBackendUnavailable(error));
  }
}
