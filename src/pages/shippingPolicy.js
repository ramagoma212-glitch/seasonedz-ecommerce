// Shipping policy page. General, honest wording only — no specific
// delivery dates are promised, since courier booking/tracking is still
// handled by admin staff rather than shown live to customers (the
// delivery fee logic itself lives in src/config/delivery.js on the
// frontend and backend/src/config/delivery.ts on the backend — both
// read the real, admin-editable DeliverySettings row, falling back to
// Courier Guy Locker to Locker R60, Door to Door R90, both free at a
// R350 qualifying subtotal for every customer; Customer Collection
// always free — Milestone 205, "Website Fixes" developer brief Task 2,
// superseding the Milestone 168C/180 R100/R120, R600-guest/R500-
// registered rule).
//
// Milestone 205, Task 2: replaced the old "small team, arranged
// manually" / "not live, real-time" framing (which read as risky to a
// first-time buyer) with the owner-approved reassurance copy below.
// Courier fulfilment is still genuinely manual behind the scenes (see
// config/delivery.ts's own comment) — this doesn't claim a live
// automated tracking system exists, only that dispatch is prompt and a
// tracking number reaches the customer once it exists.

import { renderContactSupportNote } from "../components/contactSupportNote.js";
import { getPublicDeliverySettings } from "../js/api/deliveryApi.js";
import { COURIER_LOCKER_FEE, COURIER_DOOR_FEE, FREE_DELIVERY_THRESHOLD } from "../config/delivery.js";

// Milestone 205: best-effort, same "never block the page" discipline
// as every other public-settings fetch on this site — a slow/failed
// request just means this policy page falls back to
// config/delivery.js's own constants, never a broken page.
async function getDeliveryFeesSafely() {
  try {
    const response = await getPublicDeliverySettings();
    const settings = response?.data;
    if (settings) {
      return { lockerFee: settings.courierLockerFee, doorFee: settings.courierDoorFee, threshold: settings.freeDeliveryThreshold };
    }
  } catch {
    // Falls through to the fallback below.
  }
  return { lockerFee: COURIER_LOCKER_FEE, doorFee: COURIER_DOOR_FEE, threshold: FREE_DELIVERY_THRESHOLD };
}

export async function renderShippingPolicy() {
  const { lockerFee, doorFee, threshold } = await getDeliveryFeesSafely();

  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Shipping Policy</h1>
      <p class="stub-page__text">
        How delivery works for orders placed on this site.
      </p>

      <div class="info-page__body policy-page">
        <h2>How Delivery Works</h2>
        <p>
          Delivery is available across South Africa. Orders are
          dispatched within 1 to 2 working days via The Courier Guy.
          You'll receive your tracking number on WhatsApp and email once
          your order ships. Delivery usually takes 2 to 4 working
          days in main centres, and can take longer to outlying areas.
        </p>
        <p>
          Once your order is placed, you can also look it up on our
          <a href="/track-order">Track Order</a> page using your order
          number to see its current processing status.
        </p>

        <h2>Delivery Options and Fees</h2>
        <p>
          Choose your preferred option at checkout:
        </p>
        <ul>
          <li><strong>Courier Guy Locker to Locker:</strong> R${lockerFee.toFixed(2)} below the free-delivery threshold.</li>
          <li><strong>Courier Guy Door to Door:</strong> R${doorFee.toFixed(2)} below the free-delivery threshold.</li>
          <li><strong>Customer Collection:</strong> always free, available in Pretoria or Thohoyandou by arrangement.</li>
        </ul>

        <h2>Free Delivery</h2>
        <p>
          Every customer, guest or signed in, gets free Locker or Door
          delivery once eligible physical products total R${threshold.toFixed(2)}
          or more. Only eligible physical products count toward this
          threshold. Gift wrapping does not count toward it, and digital
          products don't count either, since they are not physically
          delivered. Your selected delivery method and fee, based on
          your actual cart, are shown at checkout before you place your
          order.
        </p>

        <h2>Delivery Support</h2>
        ${renderContactSupportNote("If you have a question about delivery on your order, or your delivery address needs to be corrected, contact Seasonedz Group and we'll help sort it out.")}
      </div>
    </section>
  `;
}
