// Order summary block: optional itemised list, subtotal, delivery fee,
// order total. Reused by the cart page, checkout page and order
// confirmation page.

import { FREE_DELIVERY_THRESHOLD, REGISTERED_FREE_DELIVERY_THRESHOLD } from "../config/delivery.js";
//
// Version 7, Milestone 168C: delivery fee now depends on which of the
// three owner-approved fulfilment methods was chosen (Courier Guy
// Locker to Locker R100, Courier Guy Door to Door R120, Customer
// Collection R0), free at a R600 qualifying PHYSICAL product subtotal
// — see src/js/cart.js/src/config/delivery.js for the shared
// constants. The registered-customer-only free-delivery gate from
// Milestone 131 is removed: every customer (guest or registered) gets
// free delivery at the threshold now.
//
// Version 7, Milestone 152B (preserved): `hasPhysicalItems` picks an
// honest "no delivery needed" note instead of implying a discount
// applied — a digital-only cart's R0 delivery fee has nothing to do
// with the threshold at all.
// Version 7, Milestone 171E: `deliveryFee === null` means "no delivery
// method chosen yet" (see js/cart.js's getCartSummary()) — checked
// before the `=== 0` branch so an unselected physical cart never reads
// as if free delivery had already been applied.
// Version 7, Milestone 171F: `omitDeliveryUntilSelected` (the cart
// page, which has no delivery-method selector at all — that only
// exists at checkout) gets its own wording instead of "below", which
// would point at a selector that doesn't exist on that page.
//
// Version 7, Milestone 180, Part A: `isRegisteredCustomer` — a signed-
// in customer sees the true reason their delivery is free (or how far
// R500 is), rather than the guest-only R600 wording. Never clutters
// the guest path: a guest sees exactly the same wording as before this
// milestone.
export function getDeliveryNote(deliveryFee, hasPhysicalItems, { omitDeliveryUntilSelected = false, isRegisteredCustomer = false } = {}) {
  if (!hasPhysicalItems) {
    return "No delivery is needed. This order is digital download(s) only.";
  }
  if (deliveryFee === null) {
    return omitDeliveryUntilSelected
      ? "Delivery options are selected at checkout. Free Courier Guy delivery on qualifying physical product orders of R600 or more (R500 or more for registered customers). Customer Collection is free."
      : "Select a delivery method below to see your delivery fee.";
  }
  if (deliveryFee === 0) {
    return isRegisteredCustomer
      ? "Registered customer benefit: free delivery applied. Courier Guy Locker to Locker and Door to Door are free on orders of R500 or more for registered customers."
      : "Free delivery applied. Courier Guy Locker to Locker and Door to Door are free on orders of R600 or more.";
  }
  return isRegisteredCustomer
    ? "Spend R500 or more on qualifying products to get free Courier Guy delivery as a registered customer, or choose free Customer Collection in Pretoria or Thohoyandou."
    : "Spend R600 or more on qualifying products to get free Courier Guy delivery, or choose free Customer Collection in Pretoria or Thohoyandou.";
}

// Milestone 180, Part A, section 12: cart-page-only messaging that
// encourages account creation without ever forcing it — a soft nudge,
// never a popup or a blocking gate. Deliberately separate from
// getDeliveryNote() above (which is shared by the confirmation page
// too, where a "you are RXX away" progress message would make no
// sense after a purchase has already happened) — only ever called from
// cartPage.js. Returns null when there's nothing useful to say (a
// digital-only cart, or a guest who already has free delivery under
// the ordinary R600 threshold and so has no reason to be nudged).
export function getRegistrationDeliveryPrompt({ isRegisteredCustomer, physicalSubtotal, hasPhysicalItems }) {
  if (!hasPhysicalItems) return null;

  if (isRegisteredCustomer) {
    if (physicalSubtotal >= REGISTERED_FREE_DELIVERY_THRESHOLD) {
      return "Free delivery from R500 on eligible physical products.";
    }
    const remaining = REGISTERED_FREE_DELIVERY_THRESHOLD - physicalSubtotal;
    return `You are R${remaining.toFixed(2)} away from free delivery.`;
  }

  if (physicalSubtotal >= FREE_DELIVERY_THRESHOLD) return null;
  return "Sign in or create an account to get free delivery from R500 on eligible physical products.";
}

// Version 7, Milestone 159: `giftWrapTotal` defaults to 0 so every
// existing call site (none of which pass it yet until each page below
// is updated) renders exactly as before — the row only appears at all
// when there's a real charge to show, matching the brief's own example
// layout ("Subtotal / Gift wrapping / Delivery / Total").
// Version 7, Milestone 171E: `deliveryFee` may now be `null` — "no
// delivery method chosen yet" (see js/cart.js's getCartSummary()) —
// distinct from a genuine `0`/FREE. The displayed Total excludes
// delivery entirely until then (`?? 0`), never a fabricated R100/R120.
// Version 7, Milestone 171F: `omitDeliveryUntilSelected` (cart page
// only — checkoutPage.js never passes this) removes the Delivery row
// entirely rather than showing a "Select a delivery option" prompt —
// the cart page has no delivery-method selector at all (that only
// exists at checkout, see checkoutPage.js), so even a neutral prompt
// there would misleadingly suggest a choice is available on this page.
//
// Version 7, Milestone 172B.4: `discountTotal` defaults to 0 so every
// existing call site (cart page, and checkout/order-confirmation before
// a referral applies) renders exactly as before — the row only appears
// at all when there's a real discount to show. The cart page never
// passes a non-zero value at all (no premature/duplicated financial
// calculation there — see cartPage.js); checkoutPage.js passes a
// backend-confirmed PREVIEW amount, order-confirmation.js passes the
// real, backend-persisted order.discountTotal.
export function renderOrderSummary({
  subtotal,
  giftWrapTotal = 0,
  discountTotal = 0,
  deliveryFee,
  deliveryMethodLabel = null,
  hasPhysicalItems = true,
  showCheckoutButton = true,
  checkoutBlocked = false,
  items = [],
  showItems = false,
  omitDeliveryUntilSelected = false,
  isRegisteredCustomer = false,
}) {
  const total = subtotal + giftWrapTotal + (deliveryFee ?? 0) - discountTotal;
  const hideDeliveryRow = deliveryFee === null && omitDeliveryUntilSelected;

  return `
    <aside class="order-summary">
      <h3 class="order-summary__heading">Order Summary</h3>

      ${
        showItems && items.length
          ? `
            <div class="order-summary__items">
              ${items
                .map(
                  (item) => `
                    <div class="order-summary__item">
                      <span>${item.name} &times; ${item.quantity}</span>
                      <span>R${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }

      <div class="order-summary__row">
        <span>Subtotal</span>
        <span>R${subtotal.toFixed(2)}</span>
      </div>
      ${
        giftWrapTotal > 0
          ? `
        <div class="order-summary__row">
          <span>Gift wrapping</span>
          <span>R${giftWrapTotal.toFixed(2)}</span>
        </div>
      `
          : ""
      }
      ${
        hideDeliveryRow
          ? ""
          : `
      <div class="order-summary__row${deliveryFee === null ? " order-summary__row--delivery-pending" : ""}">
        <span data-order-summary-delivery-label>${hasPhysicalItems && deliveryMethodLabel ? deliveryMethodLabel : "Delivery"}</span>
        <span data-order-summary-delivery-value>${deliveryFee === null ? "Select a delivery option" : deliveryFee === 0 ? "FREE" : `R${deliveryFee.toFixed(2)}`}</span>
      </div>
      `
      }
      ${
        discountTotal > 0
          ? `
        <div class="order-summary__row order-summary__row--discount" data-order-summary-discount-row>
          <span>Referral discount</span>
          <span data-order-summary-discount-value>-R${discountTotal.toFixed(2)}</span>
        </div>
      `
          : ""
      }
      <div class="order-summary__row order-summary__row--total">
        <span>Order Total</span>
        <span data-order-summary-total-value>R${total.toFixed(2)}</span>
      </div>

      <p class="order-summary__note" data-order-summary-delivery-note>
        ${getDeliveryNote(deliveryFee, hasPhysicalItems, { omitDeliveryUntilSelected, isRegisteredCustomer })}
      </p>

      ${
        showCheckoutButton
          ? checkoutBlocked
            ? `
            <button type="button" class="btn btn--primary btn--block" disabled aria-disabled="true">Proceed to Checkout</button>
            <p class="order-summary__note order-summary__note--error">Remove the out-of-stock item(s) above to continue.</p>
          `
            : `<a class="btn btn--primary btn--block" href="/checkout">Proceed to Checkout</a>`
          : ""
      }
    </aside>
  `;
}
