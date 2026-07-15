// Payment cancelled page (Version 3, Milestone 23) — the destination
// PayFast's cancel_url points to, reached when a customer backs out of
// PayFast before completing payment. Read-only, like payment-success:
// it never cancels anything itself, and only ever reflects whatever
// paymentStatus the backend already has on record — which might still
// be PENDING (no PayFast notification has arrived yet) or even PAID
// (the rare case where payment actually completed in another tab
// before the customer clicked cancel here). See
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

function renderGenericCancelled(orderNumber) {
  return `
    <div class="form-banner form-banner--error">
      Payment was cancelled or not completed.${orderNumber ? ` Your order number was: <strong>${escapeHtml(orderNumber)}</strong>.` : ""}
    </div>
    ${renderActions(orderNumber)}
  `;
}

// Reflects the real backend status truthfully rather than assuming
// "cancelled" just because the customer landed on this page — see the
// file header note above.
function renderWithOrderStatus(tracking) {
  if (tracking.paymentStatus === "PAID") {
    return `
      <div class="order-confirmation__success">
        <div class="order-confirmation__icon" aria-hidden="true">&#10003;</div>
        <h1>Good News — This Order Is Already Paid</h1>
        <p>It looks like payment actually completed before you cancelled.</p>
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

  const headline = tracking.paymentStatus === "CANCELLED" ? "Payment was cancelled." : "Payment was not completed.";

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

export async function renderPaymentCancelled({ query } = {}) {
  const orderNumber = query?.get("orderNumber") || getPendingPayment()?.orderNumber;

  if (!orderNumber) {
    return `<section class="container order-confirmation">${renderGenericCancelled(null)}</section>`;
  }

  try {
    const response = await getOrderTracking(orderNumber);
    return `<section class="container order-confirmation">${renderWithOrderStatus(response.data)}</section>`;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return `<section class="container order-confirmation">${renderGenericCancelled(orderNumber)}</section>`;
    }
    return `<section class="container order-confirmation">${renderGenericCancelled(orderNumber)}</section>`;
  }
}
