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

// Version 7, Milestone 168C: matches the labels used across
// admin/email so customers, staff and transactional emails all
// describe the same delivery method the same way.
function formatDeliveryMethodLabel(method) {
  switch (method) {
    case "COURIER_LOCKER":
      return "Courier Guy Locker to Locker";
    case "COURIER_DOOR":
      return "Courier Guy Door to Door";
    case "COLLECTION":
      return "Customer Collection";
    default:
      return method ? humanizeEnum(method) : "Delivery";
  }
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });
}

function renderNoOrderNumber() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Order Confirmation</h1>
      <p class="stub-page__text">We couldn't find an order number to display.</p>
      <a class="btn btn--primary" href="/shop">Back to Shop</a>
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
      <a class="btn btn--primary" href="/shop">Back to Shop</a>
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
      <a class="btn btn--primary" href="/shop">Back to Shop</a>
    </section>
  `;
}

// PayFast orders can genuinely be PAID by the time this page is
// viewed (e.g. the customer clicks back after payment-success) — the
// old blanket "no real payment has been taken" claim would be actively
// wrong in that case, so this reflects the order's real paymentStatus
// instead of assuming every order is unpaid.
//
// Version 7, Milestone 157: a digital-only order has nothing to
// courier, so the old blanket "using The Courier Guy where applicable"
// wording was actively misleading for it — this branches on
// order.isDigitalOnly (backend-computed, see order.service.ts) instead
// of assuming every paid order needs delivery.
function renderPaymentNotice(order) {
  if (order.paymentStatus === "PAID" && order.isDigitalOnly) {
    return `
      <div class="demo-notice">
        <span class="demo-notice__icon" aria-hidden="true">&#10003;</span>
        <div>
          <strong>Payment confirmed.</strong>
          <p>
            This is a digital download order. No courier delivery is
            required. Log in to My Account to download your file(s), or
            check your email for a secure download link if you checked
            out as a guest.
          </p>
        </div>
      </div>
    `;
  }

  if (order.paymentStatus === "PAID") {
    return `
      <div class="demo-notice">
        <span class="demo-notice__icon" aria-hidden="true">&#10003;</span>
        <div>
          <strong>Payment confirmed.</strong>
          <p>
            Your order is now being prepared for delivery, using The
            Courier Guy where applicable. Seasonedz Group will share
            tracking details once it's dispatched. This isn't live,
            real-time tracking, so please allow some time.
          </p>
        </div>
      </div>
    `;
  }

  const payfastHint =
    order.paymentMethod === "PAYFAST"
      ? `If you completed payment with PayFast, confirmation can take a few minutes. Check the <a href="/payment-success?orderNumber=${encodeURIComponent(order.orderNumber)}">payment status page</a> or refresh shortly. `
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
            <h3>Delivery Method</h3>
            <div class="order-confirmation__row"><span>Method</span><span>${escapeHtml(formatDeliveryMethodLabel(order.deliveryMethod))}</span></div>
            <div class="order-confirmation__row"><span>Delivery Fee</span><span>${order.deliveryFee === 0 ? "FREE" : `R${order.deliveryFee.toFixed(2)}`}</span></div>
          </div>

          <div class="order-confirmation__card">
            <h3>${order.deliveryMethod === "COLLECTION" ? "Collection Details" : order.deliveryMethod === "COURIER_LOCKER" ? "Locker Area" : "Delivery Address"}</h3>
            <p>${escapeHtml(order.customer.firstName)} ${escapeHtml(order.customer.lastName)}</p>
            ${
              order.deliveryMethod === "COLLECTION"
                ? `<p><strong>Collection location:</strong> ${escapeHtml(order.collectionCity ?? "To be confirmed")}</p>
                   <p>Collection by arrangement. We'll be in touch to confirm details.</p>`
                : order.deliveryMethod === "COURIER_LOCKER"
                  ? order.deliveryAddress
                    ? `<p>${escapeHtml(order.deliveryAddress.city)}, ${escapeHtml(order.deliveryAddress.province)}</p>
                       <p>We'll arrange the nearest Courier Guy locker to this area and confirm it with you before dispatch.</p>
                       ${order.deliveryAddress.deliveryNotes ? `<p><strong>Notes:</strong> ${escapeHtml(order.deliveryAddress.deliveryNotes)}</p>` : ""}`
                    : ""
                  : order.deliveryAddress
                    ? `<p>${escapeHtml(order.deliveryAddress.streetAddress)}</p>
                       <p>${escapeHtml(order.deliveryAddress.suburb)}, ${escapeHtml(order.deliveryAddress.city)}</p>
                       <p>${escapeHtml(order.deliveryAddress.province)}, ${escapeHtml(order.deliveryAddress.postalCode)}</p>
                       ${order.deliveryAddress.deliveryNotes ? `<p><strong>Notes:</strong> ${escapeHtml(order.deliveryAddress.deliveryNotes)}</p>` : ""}`
                    : ""
            }
            <p>${escapeHtml(order.customer.email)}, ${escapeHtml(order.customer.phone)}</p>
          </div>

          <div class="order-confirmation__actions">
            <a class="btn btn--primary" href="/shop">Continue Shopping</a>
            <a class="btn btn--secondary" href="/track-order?order=${encodeURIComponent(order.orderNumber)}">Track Order</a>
          </div>
        </div>

        ${renderOrderSummary({
          subtotal: order.subtotal,
          giftWrapTotal: order.giftWrapTotal,
          discountTotal: order.discountTotal,
          deliveryFee: order.deliveryFee,
          deliveryMethodLabel: formatDeliveryMethodLabel(order.deliveryMethod),
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
            <p>${escapeHtml(order.customer.email)}, ${escapeHtml(order.customer.phone)}</p>
          </div>

          <div class="order-confirmation__actions">
            <a class="btn btn--primary" href="/shop">Continue Shopping</a>
            <a class="btn btn--secondary" href="/track-order?order=${encodeURIComponent(order.orderNumber)}">Track Order</a>
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
