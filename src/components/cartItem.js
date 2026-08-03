// Cart line-item component: shown on the cart page. Quantity controls
// and the remove button are wired up via delegated handlers in
// js/app.js (data-action="cart-increase" / "cart-decrease" /
// "cart-update" / "cart-remove").

import { getCardImageUrl } from "../js/imageTransforms.js";
import { escapeHtml } from "../js/search.js";
import { GIFT_WRAP_FEE_PER_ITEM } from "../js/cart.js";

// Version 7, Milestone 92A: width/height match .cart-item__image's own
// fixed 72x72 CSS size exactly (unlike the square card images
// elsewhere, this one isn't fluid, so there's a single correct value
// rather than just a same-ratio placeholder). eager defaults to false
// (lazy) — see productCard.js's comment; callers pass { eager: true }
// for the first couple of items, which are typically visible without
// scrolling on a cart page.
//
// Version 7, Milestone 159: every quantity/remove control now keys off
// item.lineId, not item.productId — identical value for an unwrapped
// line (see cart.js's computeLineId()), so this is a no-op change for
// every pre-existing cart entry. A gift-wrapped line additionally shows
// its per-item fee and, if present, the customer's own gift message —
// escaped via escapeHtml() since a gift message is free-typed customer
// input, unlike item.name which is always an admin-authored product
// name already trusted elsewhere in this file.
export function renderCartItem(item, { eager = false } = {}) {
  const giftWrapFee = item.giftWrap ? GIFT_WRAP_FEE_PER_ITEM * item.quantity : 0;
  const lineTotal = item.price * item.quantity + giftWrapFee;

  return `
    <div class="cart-item">
      <a class="cart-item__image-link" href="/product/${item.slug}">
        <img
          class="cart-item__image"
          src="${getCardImageUrl(item.image)}"
          data-original-src="${item.image}"
          alt="${item.name}"
          width="72"
          height="72"
          loading="${eager ? "eager" : "lazy"}"
          decoding="async"
        />
      </a>

      <div class="cart-item__details">
        <a class="cart-item__name" href="/product/${item.slug}">${item.name}</a>
        ${item.productType === "DIGITAL" ? `<span class="badge cart-item__digital-badge">Digital Download</span>` : ""}
        <p class="cart-item__price">R${item.price.toFixed(2)} each</p>
        ${
          item.giftWrap
            ? `
          <p class="cart-item__gift-wrap">Gift wrapping: R${GIFT_WRAP_FEE_PER_ITEM} each</p>
          ${item.giftMessage ? `<p class="cart-item__gift-message">Gift message: ${escapeHtml(item.giftMessage)}</p>` : ""}
        `
            : ""
        }
      </div>

      <div class="cart-item__quantity quantity-selector">
        <button
          type="button"
          class="quantity-selector__btn"
          data-action="cart-decrease"
          data-line-id="${item.lineId}"
          aria-label="Decrease quantity of ${item.name}"
        >&minus;</button>
        <input
          type="number"
          class="quantity-selector__input"
          data-action="cart-update"
          data-line-id="${item.lineId}"
          value="${item.quantity}"
          min="1"
          aria-label="Quantity of ${item.name}"
        />
        <button
          type="button"
          class="quantity-selector__btn"
          data-action="cart-increase"
          data-line-id="${item.lineId}"
          aria-label="Increase quantity of ${item.name}"
        >&plus;</button>
      </div>

      <p class="cart-item__line-total">R${lineTotal.toFixed(2)}</p>

      <button
        type="button"
        class="cart-item__remove"
        data-action="cart-remove"
        data-line-id="${item.lineId}"
        aria-label="Remove ${item.name} from cart"
      >&times;</button>
    </div>
  `;
}
