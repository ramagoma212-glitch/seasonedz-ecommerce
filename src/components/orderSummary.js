// Order summary block: subtotal, delivery placeholder, order total.
// Used by the cart page now. Checkout (Milestone 5) will likely reuse
// this too, so it's kept deliberately small — no shipping form, no
// coupon code, no payment details. Delivery is shown as "Calculated at
// checkout" rather than a made-up number, since real shipping rates
// aren't wired up yet.

export function renderOrderSummary({ subtotal, showCheckoutButton = true }) {
  return `
    <aside class="order-summary">
      <h3 class="order-summary__heading">Order Summary</h3>

      <div class="order-summary__row">
        <span>Subtotal</span>
        <span>R${subtotal.toFixed(2)}</span>
      </div>
      <div class="order-summary__row">
        <span>Delivery</span>
        <span>Calculated at checkout</span>
      </div>
      <div class="order-summary__row order-summary__row--total">
        <span>Order Total</span>
        <span>R${subtotal.toFixed(2)}</span>
      </div>

      ${showCheckoutButton ? `<a class="btn btn--primary btn--block" href="#/checkout">Proceed to Checkout</a>` : ""}
    </aside>
  `;
}
