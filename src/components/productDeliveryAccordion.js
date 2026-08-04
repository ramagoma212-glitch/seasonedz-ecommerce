// Product page delivery/returns accordion (Version 7, Milestone 168C).
// Four rows below the purchase area's payment methods: Delivery
// Options, the R600 free-delivery threshold, Free Collection, and
// Returns & Exchanges. Reuses the same real-<button> +
// aria-expanded/aria-controls/hidden idiom as the homepage FAQ
// accordion (components/homeFaqAccordion.js) — same
// data-action="toggle-faq" handler in js/app.js's handleToggleFaq(),
// which is already generic and not homepage-specific. Only the ids are
// namespaced per-product-page instance so they never collide with the
// homepage's own FAQ ids if both somehow render in the same session.

import { COURIER_LOCKER_FEE, COURIER_DOOR_FEE, FREE_DELIVERY_THRESHOLD, COLLECTION_CITIES } from "../config/delivery.js";

const ROWS = [
  {
    id: "delivery-options",
    question: "Delivery Options",
    answer: `
      <p>Courier Guy Locker to Locker: R${COURIER_LOCKER_FEE}</p>
      <p>Courier Guy Door to Door: R${COURIER_DOOR_FEE}</p>
      <p>Free collection in ${COLLECTION_CITIES.join(" or ")} by arrangement.</p>
      <p>Orders of R${FREE_DELIVERY_THRESHOLD} or more qualify for free Locker to Locker or Door to Door delivery.</p>
      <p>Choose your preferred delivery or collection option at checkout.</p>
    `,
  },
  {
    id: "free-delivery-threshold",
    question: `Free delivery on orders of R${FREE_DELIVERY_THRESHOLD} or more`,
    answer: `
      <p>When your qualifying product subtotal reaches R${FREE_DELIVERY_THRESHOLD} or more, both Courier Guy Locker to Locker and Door to Door delivery are free.</p>
      <p>Gift wrapping does not count toward the free-delivery threshold.</p>
    `,
  },
  {
    id: "free-collection",
    question: "Free Collection",
    answer: `
      <p>Collect your order for free in ${COLLECTION_CITIES.join(" or ")} by arrangement.</p>
      <p>Collection details will be confirmed after your order is placed.</p>
    `,
  },
  {
    id: "returns-exchanges",
    question: "Returns & Exchanges",
    answer: `
      <p>If an item arrives damaged, faulty or isn't what you ordered, contact us and we'll arrange a replacement or refund. Change-of-mind returns are accepted for unused items in resellable condition — please get in touch first.</p>
      <p>See our full <a href="/returns-policy">Returns Policy</a> for details on how to start a return.</p>
    `,
  },
];

export function renderProductDeliveryAccordion() {
  return `
    <div class="product-details__delivery-accordion">
      ${ROWS.map(
        (row) => `
        <div class="home-faq__item">
          <h3 class="home-faq__heading">
            <button
              type="button"
              class="home-faq__trigger"
              id="product-delivery-trigger-${row.id}"
              data-action="toggle-faq"
              aria-expanded="false"
              aria-controls="product-delivery-panel-${row.id}"
            >
              <span>${row.question}</span>
              <span class="home-faq__icon delivery-accordion__icon" aria-hidden="true">
                <span class="delivery-accordion__icon-plus">+</span>
                <span class="delivery-accordion__icon-minus">&minus;</span>
              </span>
            </button>
          </h3>
          <div
            class="home-faq__panel"
            id="product-delivery-panel-${row.id}"
            role="region"
            aria-labelledby="product-delivery-trigger-${row.id}"
            hidden
          >
            ${row.answer}
          </div>
        </div>
      `
      ).join("")}
    </div>
  `;
}
