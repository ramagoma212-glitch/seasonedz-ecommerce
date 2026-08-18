// Wishlist item card: shown on the wishlist page. Reuses the product
// card's visual language, but with a plain "Remove" button instead of
// a heart toggle, since being on this page already means it's saved.

import { getCardImageUrl } from "../js/imageTransforms.js";

// Version 7, Milestone 92A: see productCard.js's comment for the
// eager/width/height reasoning — same pattern here.
// Version 7, Milestone 171E: `outOfStock` (looked up against live
// product data by the caller — see wishlistPage.js) disables Add to
// Cart and relabels it, matching every other Add to Cart entry point's
// out-of-stock treatment (Part 5 of the milestone brief) — Remove from
// Wishlist is completely unaffected either way; being out of stock
// never removes an item from the wishlist automatically.
export function renderWishlistItem(item, { eager = false, outOfStock = false } = {}) {
  return `
    <article class="card wishlist-item">
      <a href="/product/${item.slug}">
        <img
          class="card__image"
          src="${getCardImageUrl(item.image)}"
          data-original-src="${item.image}"
          alt="${item.name}"
          width="400"
          height="400"
          loading="${eager ? "eager" : "lazy"}"
          decoding="async"
        />
      </a>

      <div class="card__body">
        <p class="product-card__category">${item.category}</p>
        <h3 class="card__title">
          <a href="/product/${item.slug}">${item.name}</a>
        </h3>
        <p class="product-card__price">R${item.price.toFixed(2)}</p>
        ${outOfStock ? `<p class="product-card__stock product-card__stock--out">Out of Stock</p>` : ""}

        <div class="product-card__actions">
          <a class="btn btn--secondary btn--sm" href="/product/${item.slug}">View Details</a>
          ${
            outOfStock
              ? `<button type="button" class="btn btn--primary btn--sm" disabled aria-disabled="true">Out of Stock</button>`
              : `
          <button
            type="button"
            class="btn btn--primary btn--sm"
            data-action="add-to-cart"
            data-product-id="${item.productId}"
            data-slug="${item.slug}"
            data-name="${item.name}"
            data-price="${item.price}"
            data-image="${item.image}"
          >Add to Cart</button>
          `
          }
        </div>

        <button
          type="button"
          class="wishlist-item__remove"
          data-action="wishlist-remove"
          data-product-id="${item.productId}"
          aria-label="Remove ${item.name} from wishlist"
        >Remove from Wishlist</button>
      </div>
    </article>
  `;
}
