// Order confirmation page. Reads ?order=<orderNumber> (set by the
// checkout redirect) and looks it up in Local Storage via orders.js.
// This is a demo order — see the notice rendered on the page itself.

import { getOrderByNumber, PAYMENT_METHODS, getOrderStatusLabel } from "../js/orders.js";
import { renderOrderSummary } from "../components/orderSummary.js";
import { escapeHtml } from "../js/search.js";

function paymentMethodLabel(value) {
  return PAYMENT_METHODS.find((method) => method.value === value)?.label || value;
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
        It may have been cleared from this browser's storage.
      </p>
      <a class="btn btn--primary" href="#/shop">Back to Shop</a>
    </section>
  `;
}

export function renderOrderConfirmation({ query } = {}) {
  const orderNumber = query?.get("order");
  if (!orderNumber) return renderNoOrderNumber();

  const order = getOrderByNumber(orderNumber);
  if (!order) return renderOrderNotFound(orderNumber);

  const formattedDate = new Date(order.createdAt).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

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
          <strong>Demo Order</strong>
          <p>${escapeHtml(order.demoNotice)}</p>
        </div>
      </div>

      <div class="order-confirmation__layout">
        <div class="order-confirmation__details">
          <div class="order-confirmation__card">
            <h3>Order Details</h3>
            <div class="order-confirmation__row"><span>Order Number</span><span>${escapeHtml(order.orderNumber)}</span></div>
            <div class="order-confirmation__row"><span>Order Date</span><span>${formattedDate}</span></div>
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
