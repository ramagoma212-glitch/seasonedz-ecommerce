// Guest checkout page. No account/login required — the form submits
// via a delegated handler in js/app.js, which validates it
// (js/validation.js), creates a real order via the backend Orders API
// (js/api/ordersApi.js) and clears the cart. Bank Transfer and Cash /
// Card on Delivery take no online charge through this site — see
// PAYMENT_METHODS in js/orders.js.

import { getCartSummary, getUnavailableCartItems } from "../js/cart.js";
import { renderOrderSummary } from "../components/orderSummary.js";
import { renderEmptyState } from "../components/filterBar.js";
import { renderContactSupportNote } from "../components/contactSupportNote.js";
import { renderCartCompositionNotice } from "../components/cartCompositionNotice.js";
import { PAYMENT_METHODS } from "../js/orders.js";
import { getCurrentCustomer } from "../js/api/customerApi.js";
import { getCatalog } from "../js/api/productsApi.js";
import { escapeHtml } from "../js/search.js";
import { DELIVERY_METHODS, COLLECTION_CITIES, calculateDeliveryFee as calculateDeliveryFeeForMethod } from "../config/delivery.js";
import { withBase } from "../js/paths.js";
import { getStoredReferralAttribution } from "../js/referral.js";
import { previewReferral } from "../js/api/referralApi.js";

// Version 7, Milestone 129: best-effort only — being logged out (or
// the request failing) is never an error on the checkout page, just
// the ordinary guest state. Never throws.
async function getLoggedInCustomerSafely() {
  try {
    const response = await getCurrentCustomer();
    return response?.data?.customer || null;
  } catch {
    return null;
  }
}

// Version 7, Milestone 172B.4: a non-binding PREVIEW of the referral
// discount, shown on the checkout order summary before submission. Best-
// effort, same discipline as the logged-in-customer lookup above — a
// slow/failed backend call here must never block checkout; it just
// means no preview shows for this page load. The REAL, binding amount
// is only ever decided at actual order-creation time
// (order.service.ts), re-derived from scratch there — this preview
// exists purely so the customer isn't surprised, never trusted as the
// authoritative figure (see js/app.js's own handling of the real order
// response). Deliberately calls previewReferral(), never
// captureReferral() — the latter mints a fresh capturedAt and would
// silently re-arm the attribution window on every checkout page load.
async function getReferralDiscountPreview(qualifyingSubtotal) {
  const stored = getStoredReferralAttribution();
  if (!stored) return null;

  try {
    const response = await previewReferral(stored);
    if (!response?.data?.isValid) return null;
    const discountRatePercent = response.data.discountRatePercent;
    const discountTotal = Math.round(qualifyingSubtotal * discountRatePercent) / 100;
    return discountTotal > 0 ? discountTotal : null;
  } catch {
    return null;
  }
}

const PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape",
];

function renderField({ id, label, type = "text", required = true, placeholder = "", span = "", value = "" }) {
  return `
    <div class="form-field ${span}">
      <label class="form-field__label" for="${id}">
        ${label}
        ${required ? '<span class="form-field__required" aria-hidden="true">*</span>' : '<span class="form-field__optional">(optional)</span>'}
      </label>
      <input
        type="${type}"
        id="${id}"
        name="${id}"
        class="form-field__input"
        placeholder="${placeholder}"
        value="${escapeHtml(value)}"
        ${required ? "required" : ""}
      />
      <span class="form-field__error" data-error-for="${id}"></span>
    </div>
  `;
}

// Version 7, Milestone 129: sits above the delivery form — never
// forces a decision, just states the current state plainly. Logged in:
// confirms the order will be linked to the account. Logged out: a
// soft, easy-to-ignore invitation, never a requirement — checkout
// proceeds identically either way.
function renderAccountNote(customer) {
  if (customer) {
    return `
      <div class="demo-notice">
        <span class="demo-notice__icon" aria-hidden="true">&#10003;</span>
        <div>
          <strong>Signed in as ${escapeHtml(customer.email)}.</strong>
          <p>This order will be saved to your account.</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="demo-notice">
      <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
      <div>
        <p>Have an account? <a href="/account">Sign in</a> to save this order.</p>
      </div>
    </div>
  `;
}

// Version 7, Milestone 168C: three owner-approved delivery methods
// (Section F of the milestone brief). `physicalSubtotal`/
// `hasPhysicalItems` decide each method's displayed fee (Locker/Door
// show FREE once the qualifying subtotal reaches R600 — see
// config/delivery.js's calculateDeliveryFee()); Collection is always
// free. Selecting a method toggles the address vs. collection-city
// fields below (see js/app.js's updateCheckoutDeliveryMethodUI()) —
// this is a real accessible radio group, not a custom widget.
// Version 7, Milestone 171E: no option is pre-checked — the customer
// must make an explicit choice (Part 13 of the milestone brief). A
// radio group with nothing checked is valid HTML/ARIA and behaves
// correctly with a screen reader and keyboard; the previous
// `defaultMethod` parameter (and the auto-selection it caused) is gone.
function renderDeliveryMethods(physicalSubtotal, hasPhysicalItems) {
  return `
    <fieldset class="delivery-methods" data-field-group="deliveryMethod">
      <legend class="checkout-section__label">Delivery Method <span class="form-field__required" aria-hidden="true">*</span></legend>
      ${DELIVERY_METHODS.map((method) => {
        const fee = calculateDeliveryFeeForMethod(method.value, physicalSubtotal, hasPhysicalItems);
        return `
          <label class="delivery-method">
            <input
              type="radio"
              name="deliveryMethod"
              value="${method.value}"
              class="delivery-method__radio"
              data-action="select-delivery-method"
            />
            <span class="delivery-method__content">
              <span class="delivery-method__label">${method.label}</span>
              <span class="delivery-method__fee" data-delivery-method-fee="${method.value}">${fee === 0 ? "FREE" : `R${fee.toFixed(2)}`}</span>
            </span>
          </label>
        `;
      }).join("")}
      <span class="form-field__error" data-error-for="deliveryMethod"></span>
    </fieldset>
  `;
}

// Version 7, Milestone 171E: always starts hidden/not-required — no
// delivery method is pre-selected, so no method-specific field can be
// known to apply yet. js/app.js's updateCheckoutDeliveryMethodUI()
// reveals and requires this the moment the customer picks Collection.
function renderCollectionCityField() {
  return `
    <div class="form-field form-field--full" data-collection-fields hidden>
      <label class="form-field__label" for="collectionCity">
        Collection Location <span class="form-field__required" aria-hidden="true">*</span>
      </label>
      <select id="collectionCity" name="collectionCity" class="form-field__input">
        <option value="">Select a location</option>
        ${COLLECTION_CITIES.map((city) => `<option value="${city}">${city}</option>`).join("")}
      </select>
      <span class="form-field__error" data-error-for="collectionCity"></span>
      <p class="form-field__hint">Collection by arrangement. We'll be in touch to confirm details.</p>
    </div>
  `;
}

// Version 7, Milestone 168E: informational trust artwork placed
// immediately under the PayFast option — the same owner-approved WebP
// already used on the product page (productDetails.js's
// renderPaymentMethodsBlock()). PayFast itself still presents and
// processes whichever of these nine methods the customer picks; this
// is plain informational content, not an input/button/radio, so it
// can't be selected and doesn't add a checkout choice.
function renderPaymentTrustPanel() {
  return `
    <div class="payment-trust-panel">
      <p class="payment-trust-panel__heading">Secure payments powered by PayFast</p>
      <p class="payment-trust-panel__desc">Pay securely using Visa, Mastercard, Instant EFT, Apple Pay, Google Pay, Samsung Pay, SnapScan, Zapper or Payflex.</p>
      <img
        class="payment-trust-panel__logos"
        src="${withBase("/images/payment-methods-payfast.webp")}"
        alt="Secure payment methods available through PayFast including Visa, Mastercard, Apple Pay, Google Pay, Samsung Pay, Instant EFT, SnapScan, Zapper and Payflex."
        width="720"
        height="480"
        loading="lazy"
        decoding="async"
      />
    </div>
  `;
}

function renderPaymentMethods() {
  return `
    <fieldset class="payment-methods" data-field-group="paymentMethod">
      <legend class="checkout-section__label">Payment Method <span class="form-field__required" aria-hidden="true">*</span></legend>
      ${PAYMENT_METHODS.map(
        (method) => `
          <label class="payment-method ${method.disabled ? "payment-method--disabled" : ""}">
            <input
              type="radio"
              name="paymentMethod"
              value="${method.value}"
              class="payment-method__radio"
              ${method.disabled ? "disabled" : ""}
            />
            <span class="payment-method__content">
              <span class="payment-method__label">${method.label}</span>
              <span class="payment-method__desc">${method.description}</span>
            </span>
          </label>
          ${method.value === "payfast" ? renderPaymentTrustPanel() : ""}
        `
      ).join("")}
      <span class="form-field__error" data-error-for="paymentMethod"></span>
    </fieldset>
  `;
}

// Version 6, Milestone 54: a dedicated delivery note, separate from
// the payment notice above — Seasonedz Group confirms and arranges
// delivery manually after the order is placed; no instant delivery or
// automatic tracking is promised. Version 7, Milestone 114 names The
// Courier Guy explicitly (Seasonedz Group's real courier), without
// implying any customer-facing quote/booking or live tracking exists.
function renderDeliveryNote() {
  return `
    <div class="demo-notice">
      <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
      <div>
        <strong>Delivery is arranged after your order is confirmed.</strong>
        <p>
          Choose Courier Guy Locker to Locker (R100), Courier Guy Door
          to Door (R120), or free Customer Collection in Pretoria or
          Thohoyandou. Locker and Door to Door are both free on orders
          of R600 or more. Seasonedz Group will confirm your order and
          arrange delivery or collection; tracking details are shared
          once a courier order has been packed and booked.
        </p>
        ${renderContactSupportNote("Need help with delivery?")}
      </div>
    </div>
  `;
}

// Wording stays accurate regardless of whether PayFast is currently
// selectable (see PAYMENT_METHODS in js/orders.js) — Bank Transfer and
// Cash/Card on Delivery place a real order but take no online charge;
// PayFast, when available, is a real redirect to PayFast. Delivery is
// currently arranged manually, and real courier tracking doesn't
// exist yet either way.
function renderDemoNotice() {
  return `
    <div class="demo-notice">
      <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
      <div>
        <strong>Your order is placed with our team, not shipped automatically.</strong>
        <p>
          Bank Transfer and Cash / Card on Delivery place a real order.
          No online charge is taken for either, and payment happens by
          manual bank transfer or on delivery. If PayFast is available
          and selected, you'll be redirected to PayFast's own payment
          page to complete a real payment.
        </p>
      </div>
    </div>
    ${renderDeliveryNote()}
  `;
}

// Version 7, Milestone 171E: a physical/mixed cart carrying an item
// that's gone out of stock (or vanished from the catalogue) since it
// was added — checked against live product data (js/api/productsApi.js's
// getCatalog(), the same source every other page already uses), never
// a second inventory system. Renders a clear banner naming the
// affected product(s) and links back to the cart page (where the item
// can actually be removed — see cartPage.js's own matching badge) —
// this page never lets the customer silently proceed past it.
function renderUnavailableItemsNotice(unavailableItems) {
  if (!unavailableItems.length) return "";

  return `
    <div class="demo-notice demo-notice--error" data-checkout-unavailable-notice>
      <span class="demo-notice__icon" aria-hidden="true">&#9888;</span>
      <div>
        <strong>Some items in your cart are no longer available.</strong>
        <p>
          ${unavailableItems.map((item) => escapeHtml(item.name)).join(", ")}
          ${unavailableItems.length === 1 ? "is" : "are"} out of stock. Please
          <a href="/cart">return to your cart</a> to remove ${unavailableItems.length === 1 ? "it" : "them"} before placing your order.
        </p>
      </div>
    </div>
  `;
}

export async function renderCheckoutPage() {
  const { items, composition } = getCartSummary();

  if (!items.length) {
    return `
      <section class="stub-page container">
        <h1 class="stub-page__title">Checkout</h1>
        ${renderEmptyState({
          title: "Your cart is empty",
          message: "Add a few products to your cart before checking out.",
          actionHref: "/shop",
          actionLabel: "Continue Shopping",
        })}
      </section>
    `;
  }

  // Version 7, Milestone 129: never blocks or delays checkout on a
  // slow/failed lookup beyond this one awaited call — a guest sees
  // exactly the same page either way, just without prefilled fields.
  const customer = await getLoggedInCustomerSafely();

  // Version 7, Milestone 171E: no delivery method is assumed anymore —
  // getCartSummary() with no argument returns deliveryFee: null for a
  // physical/mixed cart (composition.hasPhysical true), which
  // renderOrderSummary shows as a neutral "Select a delivery option"
  // state, never a fabricated R100/R120 or a misleading "FREE"/"R0"
  // before the customer has actually chosen anything. js/app.js's
  // updateCheckoutDeliveryMethodUI() recomputes the real fee/total live
  // the moment a method is picked — still purely a client-side
  // estimate either way; the backend independently recalculates the
  // authoritative fee at order-creation time from verified DB-priced
  // items and the delivery method actually submitted.
  const { subtotal, giftWrapTotal, deliveryFee, physicalSubtotal } = getCartSummary();

  // Version 7, Milestone 172B.4: qualifying subtotal for the discount
  // preview is the cart's own `subtotal` — gift wrap/delivery are
  // already excluded from it (see js/cart.js's getCartSummary()),
  // matching the approved V1 rule and the backend's own
  // qualifyingProductSubtotal exactly.
  const discountTotal = (await getReferralDiscountPreview(subtotal)) ?? 0;

  // Version 7, Milestone 171E: best-effort, same discipline as the
  // logged-in-customer lookup above — a slow/failed catalogue fetch
  // must never block checkout entirely; it just means stale cart items
  // can't be detected on this particular page load (the backend's own
  // authoritative stock check at order-creation time still protects
  // the order either way — see order.service.ts's verifyItems()).
  let unavailableItems = [];
  try {
    const { products } = await getCatalog();
    const productsBySlug = new Map(products.map((product) => [product.slug, { stockStatus: product.stockStatus, productType: product.productType }]));
    unavailableItems = getUnavailableCartItems(items, productsBySlug);
  } catch {
    unavailableItems = [];
  }
  const hasUnavailableItems = unavailableItems.length > 0;

  return `
    <section class="stub-page container checkout-page">
      <h1 class="stub-page__title">Checkout</h1>
      <p class="stub-page__text">
        Enter your delivery details below to place your order. No account needed.
      </p>

      ${renderAccountNote(customer)}
      ${renderCartCompositionNotice(composition)}
      ${renderUnavailableItemsNotice(unavailableItems)}

      <div class="checkout-layout">
        <form
          id="checkout-form"
          class="checkout-form"
          novalidate
          data-physical-subtotal="${physicalSubtotal}"
          data-has-physical-items="${composition.hasPhysical}"
          data-subtotal="${subtotal}"
          data-gift-wrap-total="${giftWrapTotal}"
          data-discount-total="${discountTotal}"
        >
          <div class="checkout-section">
            <h2 class="checkout-section__label">Delivery Details</h2>
            <div class="form-grid">
              ${renderField({ id: "firstName", label: "First Name", placeholder: "Thandiwe", value: customer?.firstName || "" })}
              ${renderField({ id: "lastName", label: "Last Name", placeholder: "Nkosi", value: customer?.lastName || "" })}
              ${renderField({ id: "email", label: "Email Address", type: "email", placeholder: "you@example.com", value: customer?.email || "" })}
              ${renderField({ id: "phone", label: "Phone Number", type: "tel", placeholder: "082 123 4567", value: customer?.phone || "" })}
            </div>
          </div>

          <div class="checkout-section">
            ${renderDeliveryMethods(physicalSubtotal, composition.hasPhysical)}
          </div>

          <div class="checkout-section">
            <div class="form-grid" data-delivery-address-fields hidden>
              <p class="form-field--full form-field__hint" data-locker-area-note hidden>
                We don't yet have live locker selection online. Tell us your city and province and we'll arrange the nearest Courier Guy locker to you, then confirm it with you before dispatch.
              </p>

              <div data-address-full-only hidden>
                ${renderField({ id: "street", label: "Street Address", span: "form-field--full", placeholder: "12 Colouring Lane", required: false })}
                ${renderField({ id: "suburb", label: "Suburb", placeholder: "Sunnyside", required: false })}
              </div>

              ${renderField({ id: "city", label: "City", placeholder: "Pretoria", required: false })}

              <div class="form-field">
                <label class="form-field__label" for="province">
                  Province <span class="form-field__required" aria-hidden="true">*</span>
                </label>
                <select id="province" name="province" class="form-field__input">
                  <option value="">Select a province</option>
                  ${PROVINCES.map((province) => `<option value="${province}">${province}</option>`).join("")}
                </select>
                <span class="form-field__error" data-error-for="province"></span>
              </div>

              <div data-address-full-only hidden>
                ${renderField({ id: "postalCode", label: "Postal Code", placeholder: "0001", required: false })}
              </div>

              <div class="form-field form-field--full">
                <label class="form-field__label" for="deliveryNotes">
                  Delivery Notes <span class="form-field__optional">(optional)</span>
                </label>
                <textarea
                  id="deliveryNotes"
                  name="deliveryNotes"
                  class="form-field__input form-field__textarea"
                  rows="3"
                  placeholder="e.g. Gate code, landmark, preferred delivery time"
                ></textarea>
              </div>
            </div>

            ${renderCollectionCityField()}
          </div>

          <div class="checkout-section">
            ${renderPaymentMethods()}
          </div>

          ${renderDemoNotice()}

          <div class="form-banner form-banner--error" data-checkout-banner hidden></div>

          <button type="submit" class="btn btn--primary btn--block" data-checkout-submit ${hasUnavailableItems ? "disabled" : ""}>Place Order</button>
        </form>

        ${renderOrderSummary({ subtotal, giftWrapTotal, discountTotal, deliveryFee, deliveryMethodLabel: null, hasPhysicalItems: composition.hasPhysical, showCheckoutButton: false, showItems: true, items })}
      </div>
    </section>
  `;
}
