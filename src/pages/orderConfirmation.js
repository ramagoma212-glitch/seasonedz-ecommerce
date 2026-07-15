// Order confirmation page. Reads ?order=<orderNumber> (set by the
// checkout redirect) and fetches the real order from the backend
// (GET /api/orders/:orderNumber).
//
// Version 1 orders (created before the backend existed) only ever
// live in this browser's Local Storage and were never sent to any
// server, so they can never be found by the backend lookup above. If
// the backend genuinely doesn't have the order (404, or the backend
// is unreachable), this page falls back to that old Local Storage
// demo order data — clearly labelled as such, never presented as a
// real backend order — via js/orders.js, kept around for exactly this.

import { getOrderByNumber as getBackendOrderByNumber } from "../js/api/ordersApi.js";
import { ApiError } from "../js/apiClient.js";
import { getOrderByNumber as getLocalOrderByNumber, PAYMENT_METHODS, getOrderStatusLabel } from "../js/orders.js";
import { renderOrderSummary } from "../components/orderSummary.js";
import { escapeHtml } from "../js/search.js";

function paymentMethodLabel(value) {
  return PAYMENT_METHODS.find((method) => method.value === value)?.label || value;
}

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
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Order Confirmation</h1>
      <p class="stub-page__text">We couldn't find an order number to display.</p>
      <a class="btn btn--primary" href="#/shop">Back to Shop</a>
    </section>
  `;
}

function renderOrderNotFound(orderNumber) {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Order Not Found</h1>
      <p class="stub-page__text">
        We couldn't find an order with the number &ldquo;${escapeHtml(orderNumber)}&rdquo;.
      </p>
      <a class="btn btn--primary" href="#/shop">Back to Shop</a>
    </section>
  `;
}

function renderBackendUnavailable(orderNumber) {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Order Confirmation</h1>
      <div class="form-banner form-banner--error">
        We could not connect to the order system right now. Please try again shortly.
      </div>
      <p class="stub-page__text">Your order number was: <strong>${escapeHtml(orderNumber)}</strong></p>
      <a class="btn btn--primary" href="#/shop">Back to Shop</a>
    </section>
  `;
}

// PayFast orders can genuinely be PAID by the time this page is
// viewed (e.g. the customer clicks back after payment-success) — the
// old blanket "no real payment has been taken" claim would be actively
// wrong in that case, so this reflects the order's real paymentStatus
// instead of assuming every order is unpaid.
function renderPaymentNotice(order) {
  if (order.paymentStatus === "PAID") {
    return `
      <div class="demo-notice">
        <span class="demo-notice__icon" aria-hidden="true">&#10003;</span>
        <div>
          <strong>Payment confirmed.</strong>
          <p>
            Your order is now being prepared for delivery. Seasonedz
            Group will share courier tracking details once it's
            dispatched — there's no live courier tracking yet, so
            please allow some time.
          </p>
        </div>
      </div>
    `;
  }

  const payfastHint =
    order.paymentMethod === "PAYFAST"
      ? `If you completed payment with PayFast, confirmation can take a few minutes — check the <a href="#/payment-success?orderNumber=${encodeURIComponent(order.orderNumber)}">payment status page</a> or refresh shortly. `
      : "";

  return `
    <div class="demo-notice">
      <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
      <div>
        <strong>Payment is not yet confirmed.</strong>
        <p>${payfastHint}No real payment has been taken yet, and no goods have shipped.</p>
      </div>
    </div>
  `;
}

function renderBackendOrderConfirmation(order) {
  const items = order.items.map((item) => ({ name: item.productName, price: item.unitPrice, quantity: item.quantity }));

  return `
    <section class="container order-confirmation">
      <div class="order-confirmation__success">
        <div class="order-confirmation__icon" aria-hidden="true">&#10003;</div>
        <h1>Thank You, ${escapeHtml(order.customer.firstName)}!</h1>
        <p>Your order has been placed successfully.</p>
      </div>

      ${renderPaymentNotice(order)}

      <div class="order-confirmation__layout">
        <div class="order-confirmation__details">
          <div class="order-confirmation__card">
            <h3>Order Details</h3>
            <div class="order-confirmation__row"><span>Order Number</span><span>${escapeHtml(order.orderNumber)}</span></div>
            <div class="order-confirmation__row"><span>Order Date</span><span>${formatDate(order.createdAt)}</span></div>
            <div class="order-confirmation__row"><span>Order Status</span><span class="badge">${humanizeEnum(order.status)}</span></div>
            <div class="order-confirmation__row"><span>Payment Status</span><span class="badge">${humanizeEnum(order.paymentStatus)}</span></div>
            <div class="order-confirmation__row"><span>Payment Method</span><span>${humanizeEnum(order.paymentMethod)}</span></div>
          </div>

          <div class="order-confirmation__card">
            <h3>Delivery Address</h3>
            <p>${escapeHtml(order.customer.firstName)} ${escapeHtml(order.customer.lastName)}</p>
            <p>${escapeHtml(order.deliveryAddress.streetAddress)}</p>
            <p>${escapeHtml(order.deliveryAddress.suburb)}, ${escapeHtml(order.deliveryAddress.city)}</p>
            <p>${escapeHtml(order.deliveryAddress.province)}, ${escapeHtml(order.deliveryAddress.postalCode)}</p>
            ${order.deliveryAddress.deliveryNotes ? `<p><strong>Notes:</strong> ${escapeHtml(order.deliveryAddress.deliveryNotes)}</p>` : ""}
            <p>${escapeHtml(order.customer.email)} &bull; ${escapeHtml(order.customer.phone)}</p>
          </div>

          <div class="order-confirmation__actions">
            <a class="btn btn--primary" href="#/shop">Continue Shopping</a>
            <a class="btn btn--secondary" href="#/track-order?order=${encodeURIComponent(order.orderNumber)}">Track Order</a>
          </div>
        </div>

        ${renderOrderSummary({
          subtotal: order.subtotal,
          deliveryFee: order.deliveryFee,
          showCheckoutButton: false,
          showItems: true,
          items,
        })}
      </div>
    </section>
  `;
}

// Fallback rendering for a Version 1 Local Storage demo order — same
// markup shape as before Milestone 16, but with the notice reworded so
// it's unmistakably old local-only data, never mistaken for a real
// backend order.
function renderLocalDemoOrderConfirmation(order) {
  return `
    <section class="container order-confirmation">
      <div class="order-confirmation__success">
        <div class="order-confirmation__icon" aria-hidden="true">&#10003;</div>
        <h1>Thank You, ${escapeHtml(order.customer.firstName)}!</h1>
        <p>Your order has been placed successfully.</p>
      </div>

      <div class="demo-notice">
        <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
        <div>
          <strong>Local Demo Order (Version 1)</strong>
          <p>
            This order was saved only in this browser's storage, from
            before the backend existed. It is not a real backend order
            and cannot be looked up from another device or browser.
          </p>
        </div>
      </div>

      <div class="order-confirmation__layout">
        <div class="order-confirmation__details">
          <div class="order-confirmation__card">
            <h3>Order Details</h3>
            <div class="order-confirmation__row"><span>Order Number</span><span>${escapeHtml(order.orderNumber)}</span></div>
            <div class="order-confirmation__row"><span>Order Date</span><span>${formatDate(order.createdAt)}</span></div>
            <div class="order-confirmation__row"><span>Order Status</span><span class="badge">${escapeHtml(getOrderStatusLabel(order.orderStatus))}</span></div>
            <div class="order-confirmation__row"><span>Payment Status</span><span class="badge">${escapeHtml(order.paymentStatus)}</span></div>
            <div class="order-confirmation__row"><span>Payment Method</span><span>${escapeHtml(paymentMethodLabel(order.paymentMethod))}</span></div>
          </div>

          <div class="order-confirmation__card">
            <h3>Delivery Address</h3>
            <p>${escapeHtml(order.customer.firstName)} ${escapeHtml(order.customer.lastName)}</p>
            <p>${escapeHtml(order.deliveryAddress.street)}</p>
            <p>${escapeHtml(order.deliveryAddress.suburb)}, ${escapeHtml(order.deliveryAddress.city)}</p>
            <p>${escapeHtml(order.deliveryAddress.province)}, ${escapeHtml(order.deliveryAddress.postalCode)}</p>
            ${order.deliveryNotes ? `<p><strong>Notes:</strong> ${escapeHtml(order.deliveryNotes)}</p>` : ""}
            <p>${escapeHtml(order.customer.email)} &bull; ${escapeHtml(order.customer.phone)}</p>
          </div>

          <div class="order-confirmation__actions">
            <a class="btn btn--primary" href="#/shop">Continue Shopping</a>
            <a class="btn btn--secondary" href="#/track-order?order=${encodeURIComponent(order.orderNumber)}">Track Order</a>
          </div>
        </div>

        ${renderOrderSummary({
          subtotal: order.subtotal,
          deliveryFee: order.deliveryFee,
          showCheckoutButton: false,
          showItems: true,
          items: order.items,
        })}
      </div>
    </section>
  `;
}

export async function renderOrderConfirmation({ query } = {}) {
  const orderNumber = query?.get("order");
  if (!orderNumber) return renderNoOrderNumber();

  try {
    const response = await getBackendOrderByNumber(orderNumber);
    return renderBackendOrderConfirmation(response.data);
  } catch (error) {
    const localOrder = getLocalOrderByNumber(orderNumber);

    if (error instanceof ApiError && error.status === 404) {
      return localOrder ? renderLocalDemoOrderConfirmation(localOrder) : renderOrderNotFound(orderNumber);
    }

    // Backend unreachable or an unexpected error — still prefer real
    // local demo data over a bare error if we happen to have it.
    return localOrder ? renderLocalDemoOrderConfirmation(localOrder) : renderBackendUnavailable(orderNumber);
  }
}
