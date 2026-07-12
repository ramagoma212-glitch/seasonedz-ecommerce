// Order tracking page. Reads an optional ?order=<orderNumber> from the
// URL (set by the tracking form or a link from order confirmation) and
// looks it up among the demo orders saved in this browser's Local
// Storage — see js/orders.js. This is a frontend demo only: statuses
// never update on their own, and nothing here is real courier tracking.

import {
  getOrders,
  getOrderByNumber,
  getOrderStatusLabel,
  getOrderStatusMessage,
  getOrderProgressPercentage,
  getOrderTrackingSteps,
} from "../js/orders.js";
import { renderOrderSummary } from "../components/orderSummary.js";
import { renderEmptyState } from "../components/filterBar.js";
import { escapeHtml } from "../js/search.js";

const ORDER_NUMBER_PATTERN = /^SG-\d{4}-[A-Z0-9]{4}$/i;

function renderDemoNotice() {
  return `
    <div class="demo-notice">
      <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
      <div>
        <strong>Demo Tracking</strong>
        <p>
          This is a demo tracking page. The status shown here is stored
          in this browser only, does not reflect real courier tracking,
          and won't update automatically.
        </p>
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
        You'll find your order number on your order confirmation page — it looks like <strong>SG-2026-A1B2</strong>.
      </p>
    </form>
  `;
}

function renderTrackingSteps(status) {
  const steps = getOrderTrackingSteps(status);

  return `
    <div class="tracking-progress">
      <div class="tracking-progress__bar">
        <div class="tracking-progress__fill" style="width: ${getOrderProgressPercentage(status)}%;"></div>
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

function renderTrackingResult(order) {
  const formattedDate = new Date(order.createdAt).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const estimatedDelivery =
    order.orderStatus === "delivered" ? "Delivered" : "3-5 business days from confirmation (demo estimate only)";

  return `
    <div class="tracking-result">
      <div class="tracking-result__header">
        <div>
          <p class="tracking-result__label">Order Number</p>
          <h2>${escapeHtml(order.orderNumber)}</h2>
        </div>
        <span class="badge">${escapeHtml(getOrderStatusLabel(order.orderStatus))}</span>
      </div>

      <p class="tracking-result__message">${escapeHtml(getOrderStatusMessage(order.orderStatus))}</p>

      ${renderTrackingSteps(order.orderStatus)}

      <div class="tracking-result__grid">
        <div class="order-confirmation__card">
          <h3>Order Details</h3>
          <div class="order-confirmation__row"><span>Customer</span><span>${escapeHtml(order.customer.firstName)} ${escapeHtml(order.customer.lastName)}</span></div>
          <div class="order-confirmation__row"><span>Order Date</span><span>${formattedDate}</span></div>
          <div class="order-confirmation__row"><span>Payment Status</span><span class="badge">${escapeHtml(order.paymentStatus)}</span></div>
          <div class="order-confirmation__row"><span>Delivering To</span><span>${escapeHtml(order.deliveryAddress.city)}, ${escapeHtml(order.deliveryAddress.province)}</span></div>
          <div class="order-confirmation__row"><span>Estimated Delivery</span><span>${estimatedDelivery}</span></div>
        </div>

        ${renderOrderSummary({
          subtotal: order.subtotal,
          deliveryFee: order.deliveryFee,
          showCheckoutButton: false,
          showItems: true,
          items: order.items,
        })}
      </div>
    </div>
  `;
}

function renderResultForQuery(rawOrderNumber) {
  const trimmed = rawOrderNumber.trim();

  if (!ORDER_NUMBER_PATTERN.test(trimmed)) {
    return renderEmptyState({
      title: "That doesn't look like a valid order number",
      message: `Order numbers look like &ldquo;SG-2026-A1B2&rdquo;. Please check the number and try again.`,
      actionHref: "#/shop",
      actionLabel: "Continue Shopping",
    });
  }

  const order = getOrderByNumber(trimmed.toUpperCase());
  if (order) return renderTrackingResult(order);

  if (getOrders().length === 0) {
    return renderEmptyState({
      title: "No saved orders in this browser",
      message:
        "We couldn't find any demo orders saved in this browser. Orders are only saved on the device and browser used at checkout.",
      actionHref: "#/shop",
      actionLabel: "Continue Shopping",
    });
  }

  return renderEmptyState({
    title: "Order not found",
    message: `We couldn't find an order with the number &ldquo;${escapeHtml(trimmed)}&rdquo;. Please double-check the number and try again.`,
    actionHref: "#/contact",
    actionLabel: "Contact Us",
  });
}

export function renderTrackOrder({ query } = {}) {
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

        ${rawOrderNumber ? `<div class="track-order-result">${renderResultForQuery(rawOrderNumber)}</div>` : ""}
      </div>
    </section>
  `;
}
