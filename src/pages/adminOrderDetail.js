// Admin order detail page. Read-only order summary/items (Version 7,
// Milestone 59) plus, since Milestone 64, a status-update control and
// a read-only audit timeline. Status changes are submitted to the
// existing protected PATCH /api/admin/orders/:orderNumber/status
// route (Milestone 63) — this page never writes anything itself; it
// only lets the admin choose a valid next status and a note, then
// hands that off to the backend, which validates and audits it.
//
// The allowed-transition table below is a client-side UX convenience
// only (so only valid buttons are ever shown) — the backend's own
// table in adminOrderStatus.service.ts is the actual source of truth
// and re-validates independently regardless of what this page sends.

import { getAdminOrder, getAdminOrderStatusHistory } from "../js/api/adminDashboardApi.js";
import { ApiError } from "../js/apiClient.js";
import {
  consumePendingAdminMessage,
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { formatCurrency, formatDate, formatDateTime, humanizeEnum, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

// Version 7, Milestone 168C: matches the labels used in customer-facing
// order confirmation/tracking and the backend's own email templates
// (emailTemplates.ts's formatDeliveryMethodLabel), so admin staff see
// the same wording customers do.
// Version 7, Milestone 168C.1: falls back to a plain "Delivery" label
// for a historical order with no recognisable method rather than
// guessing/mislabelling it as Locker/Door/Collection — the backfill
// migration always sets a real COURIER_DOOR default (see
// prisma/migrations/20260804130000_add_delivery_methods), so this only
// matters as defence-in-depth, never expected in real data.
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

const ALLOWED_NEXT_STATUSES = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["READY_FOR_DELIVERY", "CANCELLED"],
  READY_FOR_DELIVERY: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  REFUNDED: [],
};

const NOTE_MAX_LENGTH = 500;

// Version 7, Milestone 106: mirrors backend/prisma/schema.prisma's
// FulfilmentStatus enum exactly — see adminShipping.service.ts for why
// this is the same enum Order.fulfilmentStatus uses.
const SHIPPING_STATUS_OPTIONS = ["NOT_STARTED", "PACKING", "READY", "SHIPPED", "DELIVERED", "RETURNED"];
const COURIER_NAME_MAX_LENGTH = 100;
const TRACKING_NUMBER_MAX_LENGTH = 100;
const TRACKING_URL_MAX_LENGTH = 500;

// Version 7, Milestone 108: safe starting defaults for a small book/
// marker-pack parcel (matches backend COURIER_GUY_DEFAULT_PARCEL_*),
// always adjustable by the admin before requesting a quote — most
// current Seasonedz products are books or small marker packs.
const COURIER_DEFAULT_PARCEL_WEIGHT_KG = 0.3;
const COURIER_DEFAULT_PARCEL_LENGTH_CM = 30;
const COURIER_DEFAULT_PARCEL_WIDTH_CM = 22;
const COURIER_DEFAULT_PARCEL_HEIGHT_CM = 3;

function renderNotFound(orderNumber) {
  return `
    <section class="container admin-page">
      ${renderAdminNav("orders")}
      <h1 class="admin-page__title">Order Not Found</h1>
      <p class="admin-page__subtitle">No order found with number &ldquo;${escapeHtml(orderNumber)}&rdquo;.</p>
      <a class="btn btn--secondary" href="/admin/orders">Back to Orders</a>
    </section>
  `;
}

// Version 7, Milestone 159: fulfilment staff need to know, per line,
// whether it needs gift wrapping and what (if anything) the gift
// message says — so a "Gift Wrap" column and, where applicable, an
// extra message row are added here. escapeHtml() on the message since
// it's free-typed customer input (same reasoning as cartItem.js).
function renderItemsTable(items) {
  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr><th>Product</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Gift Wrap</th><th>Line Total</th></tr>
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
              <td>
                ${
                  item.isGiftWrapped
                    ? `
                  <span class="badge">Wrapped &mdash; ${formatCurrency(item.giftWrapFee)}</span>
                  ${item.giftMessage ? `<p class="admin-table__gift-message">&ldquo;${escapeHtml(item.giftMessage)}&rdquo;</p>` : ""}
                `
                    : "—"
                }
              </td>
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

function renderStatusUpdateSection(order) {
  const nextStatuses = ALLOWED_NEXT_STATUSES[order.status] || [];

  if (nextStatuses.length === 0) {
    return `
      <div class="admin-status-update">
        <h3>Update Order Status</h3>
        <p class="admin-status-final">This order is final. No further status updates are available.</p>
        <p class="admin-status-update__payment-note">Order status updates do not change payment status, payment records or refunds.</p>
      </div>
    `;
  }

  return `
    <div class="admin-status-update" data-order-number="${escapeHtml(order.orderNumber)}" data-current-status="${order.status}">
      <h3>Update Order Status</h3>
      <p class="admin-status-update__hint">Choose the next status for this order.</p>
      <div class="admin-status-update__options">
        ${nextStatuses
          .map(
            (status) => `
          <button type="button" class="btn btn--secondary" data-action="admin-select-next-status" data-status="${status}">
            Move to ${escapeHtml(humanizeEnum(status))}
          </button>
        `
          )
          .join("")}
      </div>

      <form class="admin-status-confirm" data-admin-status-confirm hidden novalidate>
        <p class="admin-status-confirm__text" data-admin-status-confirm-text></p>
        <p class="admin-status-confirm__warning" data-admin-status-cancel-warning hidden>
          Confirm cancellation carefully. This does not refund payment and does not send an email automatically.
        </p>

        <label class="form-field__label" for="adminStatusNote">
          Note <span data-admin-status-note-required hidden>(required for cancellation)</span>
        </label>
        <textarea
          id="adminStatusNote"
          class="form-field__input form-field__textarea"
          maxlength="${NOTE_MAX_LENGTH}"
          rows="3"
        ></textarea>
        <p class="admin-status-note-count"><span data-admin-status-note-count>${NOTE_MAX_LENGTH}</span> characters remaining</p>

        <div class="form-banner form-banner--error" data-admin-status-banner hidden></div>

        <div class="admin-status-confirm__actions">
          <button type="submit" class="btn btn--primary">Confirm Change</button>
          <button type="button" class="btn btn--secondary" data-action="admin-cancel-status-update">Cancel</button>
        </div>
      </form>

      <p class="admin-status-update__payment-note">Order status updates do not change payment status, payment records or refunds.</p>
    </div>
  `;
}

// Version 7, Milestone 106: manual shipping update — submitted to the
// new protected PATCH /api/admin/orders/:orderNumber/shipping route
// (adminShipping.service.ts), which validates and saves it; no
// courier API is called anywhere behind this. Every field is always
// sent (even when blank), since an intentionally-blanked optional
// field (courierName/trackingNumber/trackingUrl/estimatedDelivery)
// means "clear this field" — see that service's own parseOptionalText/
// parseOptionalDate for the matching server-side behaviour.
function renderShippingUpdateForm(order) {
  const shipping = order.shipping;
  if (!shipping) return "";

  // order.shipping.estimatedDelivery is an ISO datetime string (JSON
  // over the wire) — an HTML date input needs just the "YYYY-MM-DD"
  // portion.
  const estimatedDeliveryValue = shipping.estimatedDelivery ? shipping.estimatedDelivery.slice(0, 10) : "";

  return `
    <form class="admin-shipping-form" data-order-number="${escapeHtml(order.orderNumber)}" novalidate>
      <h3>Update Shipping</h3>
      <p class="admin-status-update__hint">Manual entry only — no courier account is connected yet.</p>

      <div class="form-grid">
        <div class="form-field">
          <label class="form-field__label" for="shippingStatus">Shipping Status</label>
          <select id="shippingStatus" name="status" class="form-field__input">
            ${SHIPPING_STATUS_OPTIONS.map(
              (status) => `<option value="${status}" ${status === shipping.status ? "selected" : ""}>${escapeHtml(humanizeEnum(status))}</option>`
            ).join("")}
          </select>
        </div>

        <div class="form-field">
          <label class="form-field__label" for="courierName">Courier Name <span class="form-field__optional">(optional)</span></label>
          <input
            type="text"
            id="courierName"
            name="courierName"
            class="form-field__input"
            value="${escapeHtml(shipping.courierName || "")}"
            maxlength="${COURIER_NAME_MAX_LENGTH}"
            placeholder="e.g. The Courier Guy"
          />
        </div>

        <div class="form-field">
          <label class="form-field__label" for="trackingNumber">Tracking Number <span class="form-field__optional">(optional)</span></label>
          <input
            type="text"
            id="trackingNumber"
            name="trackingNumber"
            class="form-field__input"
            value="${escapeHtml(shipping.trackingNumber || "")}"
            maxlength="${TRACKING_NUMBER_MAX_LENGTH}"
          />
        </div>

        <div class="form-field form-field--full">
          <label class="form-field__label" for="trackingUrl">Tracking URL <span class="form-field__optional">(optional)</span></label>
          <input
            type="url"
            id="trackingUrl"
            name="trackingUrl"
            class="form-field__input"
            value="${escapeHtml(shipping.trackingUrl || "")}"
            maxlength="${TRACKING_URL_MAX_LENGTH}"
            placeholder="https://..."
          />
        </div>

        <div class="form-field">
          <label class="form-field__label" for="estimatedDelivery">Estimated Delivery <span class="form-field__optional">(optional)</span></label>
          <input type="date" id="estimatedDelivery" name="estimatedDelivery" class="form-field__input" value="${estimatedDeliveryValue}" />
        </div>
      </div>

      <div class="form-banner form-banner--error" data-admin-shipping-banner hidden></div>

      <div class="admin-status-confirm__actions">
        <button type="submit" class="btn btn--primary">Save Shipping Details</button>
      </div>
    </form>
  `;
}

// Version 7, Milestone 108: admin-only Courier Guy rate quote — submits
// to the protected POST /api/admin/orders/:orderNumber/courier/quote
// route (courierGuy.service.ts), which only ever calls Courier Guy's
// /rates endpoint. Version 7, Milestone 112 adds real booking on top:
// once a quote returns options, the admin can select one and click
// Book Courier (see setupAdminBookCourierArea/handleAdminBookCourierSubmit
// in app.js), which submits to the protected POST /api/admin/orders/
// :orderNumber/courier/book route — the only place in this codebase
// that ever calls Courier Guy's /shipments endpoint. No customer-facing
// courier choice exists anywhere; this card is for the admin's own use
// only. When Courier Guy/booking isn't enabled or configured yet, the
// backend responds with a clear error (503/500), shown in the same
// banner every other admin form here already uses.
function renderCourierQuoteForm(order) {
  return `
    <form class="admin-courier-quote-form" data-order-number="${escapeHtml(order.orderNumber)}" data-payment-status="${escapeHtml(order.paymentStatus)}" novalidate>
      <h3>Courier Quote</h3>
      <p class="admin-status-update__hint">Admin-only quote. No courier booking is created until you select a service and confirm.</p>

      <div class="form-grid">
        <div class="form-field">
          <label class="form-field__label" for="courierWeightKg">Parcel Weight (kg)</label>
          <input type="number" id="courierWeightKg" name="weightKg" class="form-field__input" min="0.01" max="50" step="0.01" value="${COURIER_DEFAULT_PARCEL_WEIGHT_KG}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="courierLengthCm">Length (cm)</label>
          <input type="number" id="courierLengthCm" name="lengthCm" class="form-field__input" min="1" max="200" step="1" value="${COURIER_DEFAULT_PARCEL_LENGTH_CM}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="courierWidthCm">Width (cm)</label>
          <input type="number" id="courierWidthCm" name="widthCm" class="form-field__input" min="1" max="200" step="1" value="${COURIER_DEFAULT_PARCEL_WIDTH_CM}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="courierHeightCm">Height (cm)</label>
          <input type="number" id="courierHeightCm" name="heightCm" class="form-field__input" min="1" max="200" step="1" value="${COURIER_DEFAULT_PARCEL_HEIGHT_CM}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="courierDeclaredValue">Declared Value <span class="form-field__optional">(optional)</span></label>
          <input type="number" id="courierDeclaredValue" name="declaredValue" class="form-field__input" min="0" step="0.01" placeholder="e.g. 250.00" />
        </div>
      </div>

      <div class="form-banner form-banner--error" data-admin-courier-banner hidden></div>
      <div data-admin-courier-results></div>

      <div class="admin-status-confirm__actions">
        <button type="submit" class="btn btn--primary">Get Courier Quote</button>
      </div>
    </form>
  `;
}

// Version 7, Milestone 112: shown instead of the live quote/booking
// form once Shipping already has a courier booking (trackingNumber or
// courierShipmentId set) — server-truth-driven, not client-side state,
// so "disable further booking" survives a page reload and correctly
// re-applies after any future rerenderCurrentRoute(). The duplicate-
// booking check in courierGuy.service.ts is the real enforcement; this
// is just the admin-facing reflection of that same fact.
function renderCourierBookedSummary(order) {
  const shipping = order.shipping;
  const cost = shipping.courierCost !== null && shipping.courierCost !== undefined ? Number(shipping.courierCost) : null;

  return `
    <h3>Courier Quote</h3>
    <p class="admin-status-update__hint">A courier shipment has already been booked for this order. Booking again is not allowed.</p>
    <div class="admin-status-confirm">
      <div class="order-confirmation__row"><span>Service</span><span>${escapeHtml(shipping.courierServiceName || "—")}${shipping.courierServiceCode ? ` (${escapeHtml(shipping.courierServiceCode)})` : ""}</span></div>
      ${cost !== null ? `<div class="order-confirmation__row"><span>Courier Cost</span><span>${formatCurrency(cost)}</span></div>` : ""}
      ${shipping.trackingNumber ? `<div class="order-confirmation__row"><span>Tracking Number</span><span>${escapeHtml(shipping.trackingNumber)}</span></div>` : ""}
      ${shipping.courierBookedAt ? `<div class="order-confirmation__row"><span>Booked At</span><span>${formatDateTime(shipping.courierBookedAt)}</span></div>` : ""}
    </div>
  `;
}

// Version 7, Milestone 139: shown when an automatic (or manual) booking
// attempt failed and left no real booking behind — otherwise this looks
// identical to "nobody has ever tried," which would leave an admin with
// no reason to check a paid order that actually needs manual booking.
// Internal-only: never shown on any customer-facing page (see
// adminDashboard.service.ts's own comment — these fields are queried
// and returned separately from the shared customer order shape).
// Retrying is just the normal quote/book form below this notice — no
// separate "retry" control exists because none is needed.
function renderCourierBookingFailedNotice(shipping) {
  return `
    <div class="form-banner form-banner--error">
      Automatic courier booking was attempted and failed.
      <br />
      Attempted at: ${formatDateTime(shipping.courierBookingAttemptedAt)}
      <br />
      Reason: ${escapeHtml(shipping.courierBookingError || "Unknown error")}
      <br />
      You can retry booking manually below.
    </div>
  `;
}

// Version 7, Milestone 157: shown instead of the courier quote/booking
// form for a digital-only order — including a historical order that
// still has an old Shipping row from before this milestone
// (order.isDigitalOnly is derived fresh from order.items every time,
// never from whether a Shipping row happens to exist).
function renderDigitalOnlyAdminNotice() {
  return `
    <div class="form-banner form-banner--success">
      Digital-only order, no delivery required.
    </div>
  `;
}

// Version 7, Milestone 172B.4: read-only referral attribution — the
// admin order detail page's own small window into the referral
// programme (backend/src/controllers/adminDashboard.controller.ts
// merges `order.referral` in from referralCommission.service.ts's
// getReferralCommissionFieldsForOrder(), the exact same "small,
// separately-queried augmentation" pattern renderCourierSection()
// above already relies on for its own courier fields). No lifecycle
// controls here — approve/pay/reverse a commission is still 172B.5;
// this is display only. Renders nothing at all for an order that
// wasn't referred, and (a known, documented limitation — see that
// service's own comment) also nothing for a genuine self-referral,
// since no commission row exists to read in that case even though the
// order's own Discount row above still shows correctly.
function renderReferralSection(order) {
  if (!order.referral) return "";

  return `
    <div class="order-confirmation__card">
      <h3>Referral</h3>
      <div class="order-confirmation__row"><span>Affiliate</span><span>${escapeHtml(order.referral.affiliateNameSnapshot)}</span></div>
      <div class="order-confirmation__row"><span>Referral Code</span><span>${escapeHtml(order.referral.affiliateReferralCodeSnapshot)}</span></div>
      <div class="order-confirmation__row"><span>Discount Applied</span><span>${formatCurrency(order.referral.discountAmount)}</span></div>
      <div class="order-confirmation__row"><span>Commission</span><span>${formatCurrency(order.referral.commissionAmount)} (${escapeHtml(order.referral.commissionStatus)})</span></div>
    </div>
  `;
}

function renderCourierSection(order) {
  if (order.isDigitalOnly) return renderDigitalOnlyAdminNotice();

  const shipping = order.shipping;
  const alreadyBooked = Boolean(shipping && (shipping.trackingNumber || shipping.courierShipmentId));
  if (alreadyBooked) return renderCourierBookedSummary(order);

  const bookingFailed = Boolean(shipping && shipping.courierBookingAttemptedAt);
  return `${bookingFailed ? renderCourierBookingFailedNotice(shipping) : ""}${renderCourierQuoteForm(order)}`;
}

function renderStatusHistoryTimeline(history) {
  if (!history || history.length === 0) {
    return `<p class="admin-empty">No status history recorded yet.</p>`;
  }

  return `
    <ul class="admin-status-timeline">
      ${history
        .map(
          (entry) => `
        <li class="admin-status-timeline__item">
          <div class="admin-status-timeline__row">
            ${renderStatusBadge(entry.oldStatus)}
            <span aria-hidden="true">&rarr;</span>
            ${renderStatusBadge(entry.newStatus)}
          </div>
          <p class="admin-status-timeline__meta">
            ${formatDateTime(entry.createdAt)} &bull;
            ${escapeHtml(entry.changedByAdminName || "Unknown admin")}
            (${escapeHtml(entry.changedByAdminEmail || "no email on record")}) &bull;
            ${escapeHtml(humanizeEnum(entry.source))}
          </p>
          ${entry.note ? `<p class="admin-status-timeline__note">${escapeHtml(entry.note)}</p>` : ""}
        </li>
      `
        )
        .join("")}
    </ul>
  `;
}

export async function renderAdminOrderDetail({ orderNumber } = {}) {
  if (!orderNumber) return renderNotFound("");

  try {
    const [orderResponse, historyResponse] = await Promise.all([
      getAdminOrder(orderNumber),
      getAdminOrderStatusHistory(orderNumber),
    ]);
    const order = orderResponse.data;
    const statusHistory = historyResponse.data.statusHistory;

    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("orders")}
        <a class="admin-back-link" href="/admin/orders">&larr; Back to Orders</a>
        <h1 class="admin-page__title">Order ${escapeHtml(order.orderNumber)}</h1>

        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}

        <div class="admin-order-detail__grid">
          <div class="order-confirmation__card">
            <h3>Order Summary</h3>
            <div class="order-confirmation__row"><span>Order Date</span><span>${formatDateTime(order.createdAt)}</span></div>
            <div class="order-confirmation__row"><span>Order Status</span>${renderStatusBadge(order.status)}</div>
            <div class="order-confirmation__row"><span>Payment Status</span>${renderStatusBadge(order.paymentStatus)}</div>
            <div class="order-confirmation__row"><span>Payment Method</span><span>${escapeHtml(humanizeEnum(order.paymentMethod))}</span></div>
            <div class="order-confirmation__row"><span>Fulfilment Status</span>${renderStatusBadge(order.fulfilmentStatus)}</div>
            <div class="order-confirmation__row"><span>Delivery Method</span><span>${escapeHtml(formatDeliveryMethodLabel(order.deliveryMethod))}</span></div>
          </div>

          <div class="order-confirmation__card">
            <h3>Customer</h3>
            <p>${escapeHtml(order.customer.firstName)} ${escapeHtml(order.customer.lastName)}</p>
            <p>${escapeHtml(order.customer.email)}</p>
            <p>${escapeHtml(order.customer.phone)}</p>
          </div>

          <div class="order-confirmation__card">
            <h3>${order.deliveryMethod === "COLLECTION" ? "Collection Details" : order.deliveryMethod === "COURIER_LOCKER" ? "Locker Area" : "Delivery Address"}</h3>
            ${
              order.deliveryMethod === "COLLECTION"
                ? `<p><strong>Collection location:</strong> ${escapeHtml(order.collectionCity ?? "To be confirmed")}</p>
                   <p>Collection by arrangement.</p>`
                : order.deliveryMethod === "COURIER_LOCKER"
                  ? order.deliveryAddress
                    ? `<p>${escapeHtml(order.deliveryAddress.city)}, ${escapeHtml(order.deliveryAddress.province)}</p>
                       <p>No real locker picker yet — arrange and confirm the nearest Courier Guy locker to this area with the customer before dispatch.</p>
                       ${order.deliveryAddress.deliveryNotes ? `<p><strong>Notes:</strong> ${escapeHtml(order.deliveryAddress.deliveryNotes)}</p>` : ""}`
                    : `<p>No locker area on file.</p>`
                  : order.deliveryAddress
                    ? `<p>${escapeHtml(order.deliveryAddress.streetAddress)}</p>
                       <p>${escapeHtml(order.deliveryAddress.suburb)}, ${escapeHtml(order.deliveryAddress.city)}</p>
                       <p>${escapeHtml(order.deliveryAddress.province)}, ${escapeHtml(order.deliveryAddress.postalCode)}</p>
                       <p>${escapeHtml(order.deliveryAddress.country)}</p>
                       ${order.deliveryAddress.deliveryNotes ? `<p><strong>Notes:</strong> ${escapeHtml(order.deliveryAddress.deliveryNotes)}</p>` : ""}`
                    : `<p>No delivery address on file.</p>`
            }
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

        </div>

        ${
          order.shipping && !order.isDigitalOnly
            ? `
        <div class="order-confirmation__card">
          ${
            order.shipping.trackingUrl
              ? `<div class="order-confirmation__row"><span>Tracking Link</span><a href="${escapeHtml(order.shipping.trackingUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(order.shipping.trackingUrl)}</a></div>`
              : ""
          }
          ${order.shipping.shippedAt ? `<div class="order-confirmation__row"><span>Shipped At</span><span>${formatDateTime(order.shipping.shippedAt)}</span></div>` : ""}
          ${order.shipping.deliveredAt ? `<div class="order-confirmation__row"><span>Delivered At</span><span>${formatDateTime(order.shipping.deliveredAt)}</span></div>` : ""}
          ${renderShippingUpdateForm(order)}
        </div>
        `
            : ""
        }

        <div class="order-confirmation__card">
          ${renderCourierSection(order)}
        </div>

        <div class="order-confirmation__card">
          <h3>Items</h3>
          ${renderItemsTable(order.items)}
          <div class="order-confirmation__row"><span>Subtotal</span><span>${formatCurrency(order.subtotal)}</span></div>
          <div class="order-confirmation__row"><span>Delivery Fee</span><span>${order.deliveryFee === 0 ? "Free" : formatCurrency(order.deliveryFee)}</span></div>
          ${order.discountTotal ? `<div class="order-confirmation__row"><span>Discount</span><span>-${formatCurrency(order.discountTotal)}</span></div>` : ""}
          <div class="order-confirmation__row admin-total-row"><span>Total</span><span>${formatCurrency(order.total)}</span></div>
        </div>

        ${renderReferralSection(order)}

        <div class="order-confirmation__card">
          ${renderStatusUpdateSection(order)}
        </div>

        <div class="order-confirmation__card">
          <h3>Status History</h3>
          ${renderStatusHistoryTimeline(statusHistory)}
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
