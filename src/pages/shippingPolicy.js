// Shipping policy page. General, honest wording only — no specific
// delivery dates are promised since real courier integration isn't
// connected yet (the delivery fee logic itself lives in js/cart.js on
// the frontend and backend/src/config/delivery.ts on the backend —
// both use the same R80 / R700 rule).

import { renderContactSupportNote } from "../components/contactSupportNote.js";

export function renderShippingPolicy() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Shipping Policy</h1>
      <p class="stub-page__text">
        How delivery works for orders placed on this site.
      </p>

      <div class="info-page__body policy-page">
        <h2>How Delivery Currently Works</h2>
        <p>
          Delivery is available across South Africa. Seasonedz Group is
          a small team, so delivery is currently arranged manually
          rather than through a live, automated courier system. Every
          order is packed, booked with a courier and tracked by hand.
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

        <h2>Manual Courier Arrangement</h2>
        <p>
          Your order is prepared for delivery once payment is confirmed —
          for PayFast, that's once payment is verified; for bank transfer
          or cash/card on delivery, once Seasonedz Group has confirmed
          your order. We then choose a courier and book delivery
          ourselves; this is currently handled manually by Seasonedz
          Group rather than through a live courier system.
        </p>

        <h2>Tracking Updates</h2>
        <p>
          Once your order is placed, you can look it up on our
          <a href="#/track-order">Track Order</a> page using your order
          number to see its current processing status. Courier tracking
          details (once your order is dispatched, such as a waybill or
          tracking number) will be shared with you manually by Seasonedz
          Group directly. This is not yet live, real-time courier
          tracking; that will be added once courier integration is
          complete.
        </p>

        <h2>Delivery Support</h2>
        ${renderContactSupportNote("If you have a question about delivery on your order, or your delivery address needs to be corrected, contact Seasonedz Group and we'll help sort it out.")}
      </div>
    </section>
  `;
}
