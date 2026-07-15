// Payment failed page (Version 3, Milestone 23). PayFast itself has no
// separate "failed" redirect URL (only return_url and cancel_url), so
// this page isn't PayFast's own destination — it exists as a
// directly-reachable, honest status page for a failed payment (e.g. a
// declined card), for the customer to revisit or be pointed to.
// Read-only, like payment-success/payment-cancelled: never marks
// anything as failed itself, and only ever reflects whatever
// paymentStatus the backend already has on record. See
// backend/PAYFAST_SETUP.md's "Return URL Is Never Trusted".

import { getOrderTracking } from "../js/api/ordersApi.js";
import { ApiError } from "../js/apiClient.js";
import { getPendingPayment } from "../js/pendingPayment.js";
import { escapeHtml } from "../js/search.js";

function humanizeEnum(value) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function renderActions(orderNumber) {
  return `
    <div class="order-confirmation__actions">
      <a class="btn btn--primary" href="#/checkout">Try Again</a>
      <a class="btn btn--secondary" href="#/contact">Contact Seasonedz Group</a>
      ${orderNumber ? `<a class="btn btn--secondary" href="#/track-order?order=${encodeURIComponent(orderNumber)}">View Order Tracking</a>` : ""}
    </div>
  `;
}

function renderGenericFailed(orderNumber) {
  return `
    <div class="form-banner form-banner--error">
      This payment was not successful.${orderNumber ? ` Your order number was: <strong>${escapeHtml(orderNumber)}</strong>.` : ""}
    </div>
    ${renderActions(orderNumber)}
  `;
}

// Reflects the real backend status truthfully rather than assuming
// "failed" just because the customer landed on this page — see the
// file header note above.
function renderWithOrderStatus(tracking) {
  if (tracking.paymentStatus === "PAID") {
    return `
      <div class="order-confirmation__success">
        <div class="order-confirmation__icon" aria-hidden="true">&#10003;</div>
        <h1>Good News — This Order Is Already Paid</h1>
        <p>This payment actually completed successfully.</p>
      </div>
      <div class="order-confirmation__card">
        <h3>Order Details</h3>
        <div class="order-confirmation__row"><span>Order Number</span><span>${escapeHtml(tracking.orderNumber)}</span></div>
        <div class="order-confirmation__row"><span>Payment Status</span><span class="badge">${humanizeEnum(tracking.paymentStatus)}</span></div>
      </div>
      <div class="order-confirmation__actions">
        <a class="btn btn--primary" href="#/order-confirmation?order=${encodeURIComponent(tracking.orderNumber)}">View Full Order Details</a>
      </div>
    `;
  }

  const headline = tracking.paymentStatus === "FAILED" ? "Payment failed." : "Payment was not completed.";

  return `
    <div class="form-banner form-banner--error">${headline}</div>
    <div class="order-confirmation__card">
      <h3>Order Details</h3>
      <div class="order-confirmation__row"><span>Order Number</span><span>${escapeHtml(tracking.orderNumber)}</span></div>
      <div class="order-confirmation__row"><span>Payment Status</span><span class="badge">${humanizeEnum(tracking.paymentStatus)}</span></div>
    </div>
    ${renderActions(tracking.orderNumber)}
  `;
}

export async function renderPaymentFailed({ query } = {}) {
  const orderNumber = query?.get("orderNumber") || getPendingPayment()?.orderNumber;

  if (!orderNumber) {
    return `<section class="container order-confirmation">${renderGenericFailed(null)}</section>`;
  }

  try {
    const response = await getOrderTracking(orderNumber);
    return `<section class="container order-confirmation">${renderWithOrderStatus(response.data)}</section>`;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return `<section class="container order-confirmation">${renderGenericFailed(orderNumber)}</section>`;
    }
    return `<section class="container order-confirmation">${renderGenericFailed(orderNumber)}</section>`;
  }
}
