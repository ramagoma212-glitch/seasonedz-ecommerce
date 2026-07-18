// Payment success page (Version 3, Milestone 23) — the destination
// PayFast's return_url points to. Landing here proves nothing by
// itself: a customer can reach this URL just by navigating to it
// directly, and PayFast's redirect happens before its own server-to-
// server ITN necessarily arrives. This page NEVER marks anything as
// paid — it only ever reads the order's real status from the backend
// (GET /api/orders/:orderNumber/tracking) and displays whatever that
// says. Only a verified backend ITN (see backend/PAYFAST_SETUP.md)
// can ever set paymentStatus: PAID.

import { getOrderTracking } from "../js/api/ordersApi.js";
import { ApiError } from "../js/apiClient.js";
import { getPendingPayment, clearPendingPayment } from "../js/pendingPayment.js";
import { renderEmptyState } from "../components/filterBar.js";
import { escapeHtml } from "../js/search.js";
import { isPayfastRetryEligible, renderPayfastRetryButton } from "../components/payfastRetry.js";

function humanizeEnum(value) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });
}

function renderNoOrderNumber() {
  return renderEmptyState({
    title: "We couldn't find an order to check",
    message: "No order number was provided. If you just completed a payment, try tracking your order using its order number instead.",
    actionHref: "#/track-order",
    actionLabel: "Track an Order",
  });
}

function renderOrderNotFound(orderNumber) {
  return renderEmptyState({
    title: "Order not found",
    message: `We couldn't find an order with the number &ldquo;${escapeHtml(orderNumber)}&rdquo;.`,
    actionHref: "#/contact",
    actionLabel: "Contact Us",
  });
}

function renderBackendUnavailable(orderNumber) {
  return `
    <div class="form-banner form-banner--error">
      We could not connect to the order system right now. Please try again shortly.
    </div>
    <p class="stub-page__text">Your order number was: <strong>${escapeHtml(orderNumber)}</strong></p>
  `;
}

function renderStatusCard(tracking) {
  return `
    <div class="order-confirmation__card">
      <h3>Order Details</h3>
      <div class="order-confirmation__row"><span>Order Number</span><span>${escapeHtml(tracking.orderNumber)}</span></div>
      <div class="order-confirmation__row"><span>Order Date</span><span>${formatDate(tracking.createdAt)}</span></div>
      <div class="order-confirmation__row"><span>Order Status</span><span class="badge">${humanizeEnum(tracking.status)}</span></div>
      <div class="order-confirmation__row"><span>Payment Status</span><span class="badge">${humanizeEnum(tracking.paymentStatus)}</span></div>
    </div>
  `;
}

function renderPaidResult(tracking) {
  return `
    <div class="order-confirmation__success">
      <div class="order-confirmation__icon" aria-hidden="true">&#10003;</div>
      <h1>Payment Confirmed</h1>
      <p>Your order has been received.</p>
    </div>
    ${renderStatusCard(tracking)}
    <div class="order-confirmation__actions">
      <a class="btn btn--primary" href="#/order-confirmation?order=${encodeURIComponent(tracking.orderNumber)}">View Full Order Details</a>
      <a class="btn btn--secondary" href="#/track-order?order=${encodeURIComponent(tracking.orderNumber)}">Track Order</a>
    </div>
  `;
}

// Version 5, Milestone 34: never offers an active retry here — a
// still-PENDING order's first attempt might still complete, and
// starting a second one in parallel is the exact risk this milestone
// removes. See VERSION_5_RETRY_PENDING_RISK_FIX.md.
function renderPendingResult(tracking) {
  return `
    <div class="demo-notice">
      <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
      <div>
        <strong>Payment is being verified</strong>
        <p>
          We're still waiting for PayFast to confirm this payment.
          This can take a few minutes. Please do not place another
          order or payment attempt yet.
        </p>
      </div>
    </div>
    ${renderStatusCard(tracking)}
    <div class="order-confirmation__actions">
      <a class="btn btn--secondary" href="#/payment-success?orderNumber=${encodeURIComponent(tracking.orderNumber)}">Check Again</a>
      <a class="btn btn--secondary" href="#/track-order?order=${encodeURIComponent(tracking.orderNumber)}">Track Order</a>
      <a class="btn btn--secondary" href="#/contact">Contact Seasonedz Group</a>
    </div>
  `;
}

function renderUnsuccessfulResult(tracking) {
  const isCancelled = tracking.paymentStatus === "CANCELLED";
  return `
    <div class="form-banner form-banner--error">
      ${isCancelled ? "This payment was cancelled." : "This payment was not successful."} Your order has not been paid.
    </div>
    ${renderStatusCard(tracking)}
    <div class="order-confirmation__actions">
      ${isPayfastRetryEligible(tracking) ? renderPayfastRetryButton(tracking.orderNumber) : ""}
      <a class="btn btn--secondary" href="#/contact">Contact Seasonedz Group</a>
    </div>
  `;
}

async function renderResultForOrderNumber(orderNumber) {
  try {
    const response = await getOrderTracking(orderNumber);
    const tracking = response.data;

    // Only clear the pending-payment reference once the backend has
    // given a definitive (terminal) answer — while still PENDING, it's
    // kept so a page reload can still find the same order number.
    if (["PAID", "FAILED", "CANCELLED"].includes(tracking.paymentStatus)) {
      clearPendingPayment();
    }

    if (tracking.paymentStatus === "PAID") return renderPaidResult(tracking);
    if (tracking.paymentStatus === "FAILED" || tracking.paymentStatus === "CANCELLED") return renderUnsuccessfulResult(tracking);
    return renderPendingResult(tracking);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return renderOrderNotFound(orderNumber);
    }
    return renderBackendUnavailable(orderNumber);
  }
}

export async function renderPaymentSuccess({ query } = {}) {
  const orderNumber = query?.get("orderNumber") || getPendingPayment()?.orderNumber;

  return `
    <section class="container order-confirmation">
      ${orderNumber ? await renderResultForOrderNumber(orderNumber) : renderNoOrderNumber()}
    </section>
  `;
}
