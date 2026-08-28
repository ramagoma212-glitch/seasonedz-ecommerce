// Shipping policy page. General, honest wording only — no specific
// delivery dates are promised, since courier booking/tracking is still
// handled by admin staff rather than shown live to customers (the
// delivery fee logic itself lives in src/config/delivery.js on the
// frontend and backend/src/config/delivery.ts on the backend — both
// use the same three-method rule: Courier Guy Locker to Locker R100,
// Door to Door R120, both free at a R600 qualifying subtotal;
// Customer Collection always free — Version 7, Milestone 168C,
// superseding the old R80/registered-customer-free-from-R650 rule).
// Version 7, Milestone 114 names The Courier Guy explicitly, since
// Seasonedz Group now has a real account with them — still no
// customer-facing quote, booking, or live tracking.

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
          rather than through a live, automated courier system. We use
          The Courier Guy for courier deliveries where applicable.
          Every order is packed, booked and tracked by hand.
        </p>

        <h2>Delivery Options and Fees</h2>
        <p>
          Choose your preferred option at checkout:
        </p>
        <ul>
          <li><strong>Courier Guy Locker to Locker:</strong> R100, free on orders of R600 or more in qualifying products.</li>
          <li><strong>Courier Guy Door to Door:</strong> R120, free on orders of R600 or more in qualifying products.</li>
          <li><strong>Customer Collection:</strong> always free, available in Pretoria or Thohoyandou by arrangement.</li>
        </ul>
        <p>
          The R600 free-delivery threshold applies to every customer,
          guest or signed in. Gift wrapping does not count toward the
          threshold. Your selected delivery method and fee are shown at
          checkout before you place your order.
        </p>

        <h2>Delivery Times</h2>
        <p>
          We aim to process and prepare orders promptly, but delivery times
          will vary depending on your location. Please treat any delivery
          timing as a general guide rather than a guaranteed date.
        </p>

        <h2>Manual Courier Arrangement</h2>
        <p>
          Your order is prepared for delivery once payment is confirmed.
          For PayFast, that's once payment is verified; for bank transfer
          or cash/card on delivery, once Seasonedz Group has confirmed
          your order. We then book delivery with The Courier Guy where
          applicable; this is currently handled manually by Seasonedz
          Group rather than automatically.
        </p>

        <h2>Tracking Updates</h2>
        <p>
          Once your order is placed, you can look it up on our
          <a href="/track-order">Track Order</a> page using your order
          number to see its current processing status. Courier tracking
          details (once your order is dispatched, such as a waybill or
          tracking number) will be shared with you manually by Seasonedz
          Group directly. This is not live, real-time courier tracking.
          Seasonedz Group updates it by hand.
        </p>

        <h2>Delivery Support</h2>
        ${renderContactSupportNote("If you have a question about delivery on your order, or your delivery address needs to be corrected, contact Seasonedz Group and we'll help sort it out.")}
      </div>
    </section>
  `;
}
