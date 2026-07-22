// Order tracking page. Reads an optional ?order=<orderNumber> from the
// URL (set by the tracking form or a link from order confirmation) and
// fetches its tracking status from the backend
// (GET /api/orders/:orderNumber/tracking).
//
// Version 1 orders (created before the backend existed) only ever live
// in this browser's Local Storage, so a genuinely-old order will 404
// against the backend. In that case (or if the backend is
// unreachable), this page falls back to that old Local Storage demo
// tracking data — clearly labelled as such — via js/orders.js, kept
// around for exactly this.

import {
  getOrderByNumber as getLocalOrderByNumber,
  getOrderStatusLabel,
  getOrderStatusMessage,
  getOrderTrackingSteps,
} from "../js/orders.js";
import { getOrderTracking } from "../js/api/ordersApi.js";
import { ApiError } from "../js/apiClient.js";
import { renderEmptyState } from "../components/filterBar.js";
import { escapeHtml } from "../js/search.js";

const ORDER_NUMBER_PATTERN = /^SG-\d{4}-[A-Z0-9]{4}$/i;

const BACKEND_STATUS_MESSAGES = {
  PENDING: "We've received your order and it's being processed.",
  CONFIRMED: "Your order has been confirmed and is in our queue.",
  PROCESSING: "We're carefully preparing your items for delivery.",
  READY_FOR_DELIVERY: "Your order is packed and ready to be handed to our courier.",
  OUT_FOR_DELIVERY: "Your order is on its way to you.",
  DELIVERED: "Your order has been delivered. We hope you love it!",
  CANCELLED: "This order has been cancelled.",
  REFUNDED: "This order has been refunded.",
};

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

function computeProgressPercentage(steps) {
  const currentIndex = steps.findIndex((step) => step.isCurrent);
  if (currentIndex === -1 || steps.length <= 1) return 0;
  return Math.round((currentIndex / (steps.length - 1)) * 100);
}

function renderStepsMarkup(steps) {
  return `
    <div class="tracking-progress">
      <div class="tracking-progress__bar">
        <div class="tracking-progress__fill" style="width: ${computeProgressPercentage(steps)}%;"></div>
      </div>
      <div class="tracking-steps">
        ${steps
          .map(
            (step, index) => `
              <div class="tracking-step ${step.isComplete ? "is-complete" : ""}${step.isCurrent ? " is-current" : ""}">
                <span class="tracking-step__dot" aria-hidden="true">${step.isComplete ? "&#10003;" : index + 1}</span>
                <span class="tracking-step__label">${escapeHtml(step.label)}</span>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderTrackingForm(prefillValue) {
  return `
    <form id="track-order-form" class="track-order-form" novalidate>
      <div class="form-field">
        <label class="form-field__label" for="orderNumber">Order Number</label>
        <div class="track-order-form__row">
          <input
            type="text"
            id="orderNumber"
            name="orderNumber"
            class="form-field__input"
            placeholder="e.g. SG-2026-A1B2"
            value="${escapeHtml(prefillValue)}"
            autocomplete="off"
          />
          <button type="submit" class="btn btn--primary">Track Order</button>
        </div>
        <span class="form-field__error" data-error-for="orderNumber"></span>
      </div>
      <p class="track-order-form__hint">
        You'll find your order number on your order confirmation page. It looks like <strong>SG-2026-A1B2</strong>.
      </p>
    </form>
  `;
}

function renderDemoNotice() {
  return `
    <div class="demo-notice">
      <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
      <div>
        <strong>Tracking is a Seasonedz Group backend status, not a live courier.</strong>
        <p>
          There is no real courier integration yet. This status is
          updated manually by Seasonedz Group, not by a live courier
          API. Real courier tracking is coming later.
        </p>
      </div>
    </div>
  `;
}

function renderBackendTrackingResult(tracking) {
  return `
    <div class="tracking-result">
      <div class="tracking-result__header">
        <div>
          <p class="tracking-result__label">Order Number</p>
          <h2>${escapeHtml(tracking.orderNumber)}</h2>
        </div>
        <span class="badge">${humanizeEnum(tracking.status)}</span>
      </div>

      <p class="tracking-result__message">${BACKEND_STATUS_MESSAGES[tracking.status] || ""}</p>

      ${renderStepsMarkup(tracking.trackingSteps)}

      <div class="order-confirmation__card">
        <h3>Order Details</h3>
        <div class="order-confirmation__row"><span>Order Date</span><span>${formatDate(tracking.createdAt)}</span></div>
        <div class="order-confirmation__row"><span>Payment Status</span><span class="badge">${humanizeEnum(tracking.paymentStatus)}</span></div>
        <div class="order-confirmation__row"><span>Delivering To</span><span>${escapeHtml(tracking.deliveryCity)}, ${escapeHtml(tracking.deliveryProvince)}</span></div>
      </div>

      <div class="order-confirmation__actions">
        <a class="btn btn--secondary" href="/order-confirmation?order=${encodeURIComponent(tracking.orderNumber)}">View Full Order Details</a>
      </div>
    </div>
  `;
}

// Fallback rendering for a Version 1 Local Storage demo order — same
// shape as before Milestone 16, reworded so it's unmistakably old
// local-only data, never mistaken for real backend tracking.
function renderLocalDemoTrackingResult(order) {
  const formattedDate = formatDate(order.createdAt);
  const estimatedDelivery =
    order.orderStatus === "delivered" ? "Delivered" : "3-5 business days from confirmation (demo estimate only)";

  return `
    <div class="tracking-result">
      <div class="demo-notice">
        <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
        <div>
          <strong>Local Demo Order (Version 1)</strong>
          <p>This order was saved only in this browser, from before the backend existed. It won't update automatically.</p>
        </div>
      </div>

      <div class="tracking-result__header">
        <div>
          <p class="tracking-result__label">Order Number</p>
          <h2>${escapeHtml(order.orderNumber)}</h2>
        </div>
        <span class="badge">${escapeHtml(getOrderStatusLabel(order.orderStatus))}</span>
      </div>

      <p class="tracking-result__message">${escapeHtml(getOrderStatusMessage(order.orderStatus))}</p>

      ${renderStepsMarkup(getOrderTrackingSteps(order.orderStatus))}

      <div class="tracking-result__grid">
        <div class="order-confirmation__card">
          <h3>Order Details</h3>
          <div class="order-confirmation__row"><span>Customer</span><span>${escapeHtml(order.customer.firstName)} ${escapeHtml(order.customer.lastName)}</span></div>
          <div class="order-confirmation__row"><span>Order Date</span><span>${formattedDate}</span></div>
          <div class="order-confirmation__row"><span>Payment Status</span><span class="badge">${escapeHtml(order.paymentStatus)}</span></div>
          <div class="order-confirmation__row"><span>Delivering To</span><span>${escapeHtml(order.deliveryAddress.city)}, ${escapeHtml(order.deliveryAddress.province)}</span></div>
          <div class="order-confirmation__row"><span>Estimated Delivery</span><span>${estimatedDelivery}</span></div>
        </div>
      </div>
    </div>
  `;
}

function renderBackendUnavailable() {
  return `
    <div class="form-banner form-banner--error">
      We could not connect to the order system right now. Please try again shortly.
    </div>
  `;
}

async function renderResultForQuery(rawOrderNumber) {
  const trimmed = rawOrderNumber.trim();

  if (!ORDER_NUMBER_PATTERN.test(trimmed)) {
    return renderEmptyState({
      title: "That doesn't look like a valid order number",
      message: `Order numbers look like &ldquo;SG-2026-A1B2&rdquo;. Please check the number and try again.`,
      actionHref: "#/shop",
      actionLabel: "Continue Shopping",
    });
  }

  const orderNumber = trimmed.toUpperCase();

  try {
    const response = await getOrderTracking(orderNumber);
    return renderBackendTrackingResult(response.data);
  } catch (error) {
    const localOrder = getLocalOrderByNumber(orderNumber);
    if (localOrder) return renderLocalDemoTrackingResult(localOrder);

    if (error instanceof ApiError && error.status === 404) {
      return renderEmptyState({
        title: "Order not found",
        message: `We couldn't find an order with the number &ldquo;${escapeHtml(trimmed)}&rdquo;. Please double-check the number and try again.`,
        actionHref: "#/contact",
        actionLabel: "Contact Us",
      });
    }

    return renderBackendUnavailable();
  }
}

export async function renderTrackOrder({ query } = {}) {
  const rawOrderNumber = query?.get("order") || "";

  return `
    <section class="stub-page container track-order-page">
      <h1 class="stub-page__title">Track Your Order</h1>
      <p class="stub-page__text">
        Enter your order number below to see its current status.
      </p>

      <div class="track-order-page__body">
        ${renderTrackingForm(rawOrderNumber)}
        ${renderDemoNotice()}

        ${rawOrderNumber ? `<div class="track-order-result">${await renderResultForQuery(rawOrderNumber)}</div>` : ""}
      </div>
    </section>
  `;
}
