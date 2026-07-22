// Order summary block: optional itemised list, subtotal, delivery fee,
// order total. Reused by the cart page, checkout page and order
// confirmation page.
//
// Delivery fee is a flat placeholder (see calculateDeliveryFee in
// cart.js — R80 standard, free from R700) until real courier
// integration calculates actual rates.

export function renderOrderSummary({ subtotal, deliveryFee, showCheckoutButton = true, showItems = false, items = [] }) {
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
        ${deliveryFee === 0 ? "This order qualifies for free delivery." : "Orders of R700 or more qualify for free delivery."}
      </p>

      ${showCheckoutButton ? `<a class="btn btn--primary btn--block" href="/checkout">Proceed to Checkout</a>` : ""}
    </aside>
  `;
}
