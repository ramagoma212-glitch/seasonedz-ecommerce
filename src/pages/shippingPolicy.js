// Shipping policy page. General, honest wording only — no specific
// delivery dates are promised since real courier integration isn't
// connected yet (the delivery fee logic itself lives in js/cart.js).

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
          Orders are prepared once placed. As this site currently runs a
          demo checkout, no physical orders are dispatched yet — this
          policy describes how shipping will work once real ordering goes
          live.
        </p>

        <h2>Tracking Your Order</h2>
        <p>
          Once your order is placed, you can look it up on our
          <a href="#/track-order">Track Order</a> page using your order
          number. Real-time courier tracking will be added once courier
          integration is complete.
        </p>
      </div>
    </section>
  `;
}
