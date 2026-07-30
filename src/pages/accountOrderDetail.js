// Customer order detail page (Version 7, Milestone 130) —
// /account/orders/:orderNumber. Only ever shows an order that belongs
// to the currently logged-in customer — the backend
// (GET /api/customers/orders/:orderNumber) already enforces this by
// returning a plain 404 for any order that doesn't exist or belongs to
// someone else, never revealing which case it was. This page mirrors
// that discipline: the not-found message never implies whether the
// order number is real for a different account.

import { getCustomerOrder, getCustomerOrderDownloads } from "../js/api/customerApi.js";
import { ApiError } from "../js/apiClient.js";
import { escapeHtml } from "../js/search.js";
import { renderDigitalDownloadsCard } from "../components/digitalDownloadsCard.js";

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

function formatRand(amount) {
  return `R${Number(amount).toFixed(2)}`;
}

function renderItemRow(item) {
  return `
    <div class="account-order-item">
      ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="" class="account-order-item__image" width="56" height="56" loading="lazy" />` : ""}
      <div class="account-order-item__details">
        <p class="account-order-item__name">${escapeHtml(item.productName)}</p>
        <p class="account-order-item__meta">Qty ${item.quantity} &times; ${formatRand(item.unitPrice)}</p>
      </div>
      <p class="account-order-item__total">${formatRand(item.lineTotal)}</p>
    </div>
  `;
}

function renderShippingCard(shipping) {
  if (!shipping) return "";
  const trackingLine = shipping.trackingNumber
    ? `<div class="order-confirmation__row"><span>Tracking Number</span><span>${escapeHtml(shipping.trackingNumber)}</span></div>`
    : "";
  const trackingLinkLine = shipping.trackingUrl
    ? `<div class="order-confirmation__row"><span>Tracking Link</span><span><a href="${escapeHtml(shipping.trackingUrl)}" target="_blank" rel="noopener noreferrer">Track Shipment</a></span></div>`
    : "";

  return `
    <div class="order-confirmation__card">
      <h3>Delivery</h3>
      <div class="order-confirmation__row"><span>Status</span><span class="badge">${humanizeEnum(shipping.status)}</span></div>
      ${trackingLine}
      ${trackingLinkLine}
    </div>
  `;
}

function renderOrderDetail(order, digitalItems) {
  return `
    <div class="tracking-result">
      <div class="tracking-result__header">
        <div>
          <p class="tracking-result__label">Order Number</p>
          <h2>${escapeHtml(order.orderNumber)}</h2>
        </div>
        <span class="badge">${humanizeEnum(order.status)}</span>
      </div>

      <div class="order-confirmation__card">
        <h3>Order Details</h3>
        <div class="order-confirmation__row"><span>Order Date</span><span>${formatDate(order.createdAt)}</span></div>
        <div class="order-confirmation__row"><span>Payment Method</span><span>${humanizeEnum(order.paymentMethod)}</span></div>
        <div class="order-confirmation__row"><span>Payment Status</span><span class="badge">${humanizeEnum(order.paymentStatus)}</span></div>
        <div class="order-confirmation__row"><span>Subtotal</span><span>${formatRand(order.subtotal)}</span></div>
        <div class="order-confirmation__row"><span>Delivery Fee</span><span>${formatRand(order.deliveryFee)}</span></div>
        <div class="order-confirmation__row"><span>Total</span><span>${formatRand(order.total)}</span></div>
      </div>

      <div class="order-confirmation__card">
        <h3>Items</h3>
        <div class="account-order-items">
          ${order.items.map(renderItemRow).join("")}
        </div>
      </div>

      <div class="order-confirmation__card">
        <h3>Delivering To</h3>
        <div class="order-confirmation__row"><span>Address</span><span>${escapeHtml(order.deliveryAddress.streetAddress)}, ${escapeHtml(order.deliveryAddress.suburb)}</span></div>
        <div class="order-confirmation__row"><span>City</span><span>${escapeHtml(order.deliveryAddress.city)}, ${escapeHtml(order.deliveryAddress.province)} ${escapeHtml(order.deliveryAddress.postalCode)}</span></div>
        ${order.deliveryAddress.deliveryNotes ? `<div class="order-confirmation__row"><span>Notes</span><span>${escapeHtml(order.deliveryAddress.deliveryNotes)}</span></div>` : ""}
      </div>

      ${renderShippingCard(order.shipping)}

      ${renderDigitalDownloadsCard(digitalItems)}

      <div class="order-confirmation__actions">
        <a class="btn btn--secondary" href="/account">Back to My Account</a>
      </div>
    </div>
  `;
}

function renderNotFound() {
  return `
    <div class="form-banner form-banner--error">
      Order not found in this account.
    </div>
    <div class="order-confirmation__actions">
      <a class="btn btn--secondary" href="/account">Back to My Account</a>
    </div>
  `;
}

function renderNeedsLogin() {
  return `
    <div class="demo-notice">
      <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
      <div>
        <strong>Please sign in to view this order.</strong>
        <p><a href="/account">Sign in</a> to your account to see this order's details.</p>
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

export async function renderAccountOrderDetail({ orderNumber: rawOrderNumber } = {}) {
  const orderNumber = rawOrderNumber || "";

  let body;
  try {
    const response = await getCustomerOrder(orderNumber);
    // Version 7, Milestone 152: best-effort only — a downloads-lookup
    // failure must never break the rest of the order-detail page, it
    // just means no downloads card renders. The backend itself never
    // errors here (it returns an empty list for "not paid"/"no digital
    // items" rather than throwing), so this is purely defensive.
    let digitalItems = [];
    try {
      const downloadsResponse = await getCustomerOrderDownloads(orderNumber);
      digitalItems = downloadsResponse?.data?.items || [];
    } catch {
      digitalItems = [];
    }
    body = renderOrderDetail(response.data.order, digitalItems);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      body = renderNeedsLogin();
    } else if (error instanceof ApiError && error.status === 404) {
      body = renderNotFound();
    } else {
      body = renderBackendUnavailable();
    }
  }

  return `
    <section class="stub-page container track-order-page">
      <h1 class="stub-page__title">Order Details</h1>
      <div class="track-order-page__body">${body}</div>
    </section>
  `;
}
