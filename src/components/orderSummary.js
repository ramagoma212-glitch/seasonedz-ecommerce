// Order summary block: optional itemised list, subtotal, delivery fee,
// order total. Reused by the cart page, checkout page and order
// confirmation page.
//
// Delivery fee is a flat placeholder (see calculateDeliveryFee in
// cart.js — R80 standard, free for a registered account from R500)
// until real courier integration calculates actual rates.

// Version 7, Milestone 131: `isRegisteredCustomer` is only ever used
// to pick the right *guidance* text when delivery isn't already free —
// whether delivery is actually free is decided entirely by
// `deliveryFee` itself (computed by cart.js for cart/checkout display,
// or already the real backend-charged value for order confirmation).
// Order confirmation doesn't pass isRegisteredCustomer at all (that
// page never fetches customer state) — the default `false` still
// produces an accurate, harmless message either way: "free" shows
// correctly whenever deliveryFee is actually 0, and the R80 case falls
// back to the same safe "sign in" wording used for a guest.
// Version 7, Milestone 152B: `hasPhysicalItems` (default `true`, so
// every existing call site keeps its exact prior wording unless it
// explicitly says there's nothing physical to deliver) picks an honest
// "no delivery needed" note instead of implying a registered-account
// discount applied — a digital-only guest cart's R0 delivery fee has
// nothing to do with being signed in.
function getDeliveryNote(deliveryFee, isRegisteredCustomer, hasPhysicalItems) {
  if (!hasPhysicalItems) {
    return "No delivery is needed — this order is digital download(s) only.";
  }
  if (deliveryFee === 0) {
    return "Free delivery applied for your registered Seasonedz Group account.";
  }
  return isRegisteredCustomer
    ? "Registered customers get free delivery on orders of R500 or more."
    : "Sign in or create an account to get free delivery on orders of R500 or more.";
}

export function renderOrderSummary({
  subtotal,
  deliveryFee,
  isRegisteredCustomer = false,
  hasPhysicalItems = true,
  showCheckoutButton = true,
  showItems = false,
  items = [],
}) {
  const total = subtotal + deliveryFee;

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
      <div class="order-summary__row">
        <span>Delivery</span>
        <span>${deliveryFee === 0 ? "Free" : `R${deliveryFee.toFixed(2)}`}</span>
      </div>
      <div class="order-summary__row order-summary__row--total">
        <span>Order Total</span>
        <span>R${total.toFixed(2)}</span>
      </div>

      <p class="order-summary__note">
        ${getDeliveryNote(deliveryFee, isRegisteredCustomer, hasPhysicalItems)}
      </p>

      ${showCheckoutButton ? `<a class="btn btn--primary btn--block" href="/checkout">Proceed to Checkout</a>` : ""}
    </aside>
  `;
}
