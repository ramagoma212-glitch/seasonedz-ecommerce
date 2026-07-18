// Shipping policy page. General, honest wording only — no specific
// delivery dates are promised since real courier integration isn't
// connected yet (the delivery fee logic itself lives in js/cart.js on
// the frontend and backend/src/config/delivery.ts on the backend —
// both use the same R80 / R700 rule).

export function renderShippingPolicy() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Shipping Policy</h1>
      <p class="stub-page__text">
        How delivery works for orders placed on this site.
      </p>

      <div class="info-page__body policy-page">
        <h2>Where We Deliver</h2>
        <p>
          We focus on delivering across South Africa. Full courier coverage
          details will be confirmed once courier integration is complete.
        </p>

        <h2>Delivery Fees</h2>
        <p>
          Standard delivery is a flat rate of <strong>R80</strong>. Orders
          of <strong>R700 or more</strong> qualify for free standard
          delivery. Any applicable delivery fee is shown at checkout before
          you place your order.
        </p>

        <h2>Delivery Times</h2>
        <p>
          We aim to process and prepare orders promptly, but delivery times
          will vary depending on your location and the courier used. We'll
          share more specific delivery estimates once courier integration
          is live — for now, please treat any delivery timing as a general
          guide rather than a guaranteed date.
        </p>

        <h2>Order Processing</h2>
        <p>
          Your order is prepared for delivery once payment is confirmed —
          for PayFast, that's once payment is verified; for bank transfer
          or cash/card on delivery, once Seasonedz Group has confirmed
          your order. Courier fulfilment is currently handled manually by
          Seasonedz Group rather than through a live courier system.
        </p>

        <h2>Tracking Your Order</h2>
        <p>
          Once your order is placed, you can look it up on our
          <a href="#/track-order">Track Order</a> page using your order
          number to see its current processing status. Courier tracking
          details (once your order is dispatched) will be shared by
          Seasonedz Group directly — this is not yet live, real-time
          courier tracking; that will be added once courier integration
          is complete.
        </p>

        <h2>Need Help?</h2>
        <p>
          If you have a question about delivery on your order, please
          <a href="#/contact">contact us</a> and we'll help sort it out.
        </p>
      </div>
    </section>
  `;
}
