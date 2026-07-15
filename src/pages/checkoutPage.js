// Guest checkout page. No account/login required — the form submits
// via a delegated handler in js/app.js, which validates it
// (js/validation.js), creates a demo order (js/orders.js) and clears
// the cart. This is a frontend demo only: no real payment is taken.

import { getCartSummary } from "../js/cart.js";
import { renderOrderSummary } from "../components/orderSummary.js";
import { renderEmptyState } from "../components/filterBar.js";
import { PAYMENT_METHODS } from "../js/orders.js";

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

function renderField({ id, label, type = "text", required = true, placeholder = "", span = "" }) {
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
        ${required ? "required" : ""}
      />
      <span class="form-field__error" data-error-for="${id}"></span>
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
        `
      ).join("")}
      <span class="form-field__error" data-error-for="paymentMethod"></span>
    </fieldset>
  `;
}

// Wording stays accurate regardless of whether PayFast is currently
// selectable (see PAYMENT_METHODS in js/orders.js) — Bank Transfer and
// Cash/Card on Delivery are always demo-only; PayFast, when available,
// is a real redirect to PayFast, but no goods have shipped yet either
// way and real courier tracking still doesn't exist.
function renderDemoNotice() {
  return `
    <div class="demo-notice">
      <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
      <div>
        <strong>No goods have shipped yet.</strong>
        <p>
          Bank Transfer and Cash / Card on Delivery are demo payment
          options only — no real charge is taken for either. If PayFast
          is available and selected, you'll be redirected to PayFast's
          own payment page to complete a real payment; your order is
          saved by the Seasonedz Group backend either way. Real courier
          tracking is coming later.
        </p>
      </div>
    </div>
  `;
}

export function renderCheckoutPage() {
  const { items, subtotal, deliveryFee } = getCartSummary();

  if (!items.length) {
    return `
      <section class="stub-page container">
        <h1 class="stub-page__title">Checkout</h1>
        ${renderEmptyState({
          title: "Your cart is empty",
          message: "Add a few products to your cart before checking out.",
          actionHref: "#/shop",
          actionLabel: "Continue Shopping",
        })}
      </section>
    `;
  }

  return `
    <section class="stub-page container checkout-page">
      <h1 class="stub-page__title">Checkout</h1>
      <p class="stub-page__text">
        Enter your delivery details below to place your order — no account needed.
      </p>

      <div class="checkout-layout">
        <form id="checkout-form" class="checkout-form" novalidate>
          <div class="checkout-section">
            <h2 class="checkout-section__label">Delivery Details</h2>
            <div class="form-grid">
              ${renderField({ id: "firstName", label: "First Name", placeholder: "Thandiwe" })}
              ${renderField({ id: "lastName", label: "Last Name", placeholder: "Nkosi" })}
              ${renderField({ id: "email", label: "Email Address", type: "email", placeholder: "you@example.com" })}
              ${renderField({ id: "phone", label: "Phone Number", type: "tel", placeholder: "082 123 4567" })}
              ${renderField({ id: "street", label: "Street Address", span: "form-field--full", placeholder: "12 Colouring Lane" })}
              ${renderField({ id: "suburb", label: "Suburb", placeholder: "Sunnyside" })}
              ${renderField({ id: "city", label: "City", placeholder: "Pretoria" })}

              <div class="form-field">
                <label class="form-field__label" for="province">
                  Province <span class="form-field__required" aria-hidden="true">*</span>
                </label>
                <select id="province" name="province" class="form-field__input" required>
                  <option value="">Select a province</option>
                  ${PROVINCES.map((province) => `<option value="${province}">${province}</option>`).join("")}
                </select>
                <span class="form-field__error" data-error-for="province"></span>
              </div>

              ${renderField({ id: "postalCode", label: "Postal Code", placeholder: "0001" })}

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
          </div>

          <div class="checkout-section">
            ${renderPaymentMethods()}
          </div>

          ${renderDemoNotice()}

          <div class="form-banner form-banner--error" data-checkout-banner hidden></div>

          <button type="submit" class="btn btn--primary btn--block">Place Order</button>
        </form>

        ${renderOrderSummary({ subtotal, deliveryFee, showCheckoutButton: false, showItems: true, items })}
      </div>
    </section>
  `;
}
