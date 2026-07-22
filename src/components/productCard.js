// Reusable product card. Used on the homepage, shop page, category
// pages and search results, so all product browsing surfaces stay
// visually and behaviourally consistent.
//
// Add to Cart and the wishlist heart are wired up via delegated click
// handlers in js/app.js (data-action="add-to-cart" / "toggle-wishlist").
// Every data-* attribute below is read back out in that handler, since
// the click target only has the DOM to work with, not the original
// product object.

import { isInWishlist } from "../js/wishlist.js";

const STOCK_STATUS_CLASS = {
  "In Stock": "in",
  "Low Stock": "low",
  "Out of Stock": "out",
};

// Version 7, Milestone 95: product cards no longer call this — the
// rating/reviewCount they used to show was demo/sample data hardcoded
// in src/data/products.js, not real customer reviews. Still exported
// and used by pages/testimonials.js, which renders real curated
// testimonial content, not product review data.
export function renderStars(rating) {
  const rounded = Math.round(rating);
  const filled = "&#9733;".repeat(rounded);
  const empty = "&#9734;".repeat(Math.max(0, 5 - rounded));
  return `<span class="stars" aria-label="Rated ${rating} out of 5">${filled}${empty}</span>`;
}

// Version 7, Milestone 92A: eager defaults to false (lazy) — the safe
// choice for a reusable card used across many grids/rails in
// different fold positions. Callers that know a specific card is
// above the fold (e.g. the first row of a grid) pass { eager: true }
// explicitly; everywhere else is left lazy by default rather than
// guessed. width/height match the CSS's own aspect-ratio: 1/1 (see
// .card__image in components.css) — a fixed reference size, not the
// actual served resolution, purely so the browser can reserve layout
// space before the (currently full-resolution) image downloads.
export function renderProductCard(product, { eager = false } = {}) {
  const stockClass = STOCK_STATUS_CLASS[product.stockStatus] || "in";
  const wishlisted = isInWishlist(product.id);

  return `
    <article class="card product-card">
      <div class="product-card__media">
        <a href="/product/${product.slug}">
          <img
            class="card__image"
            src="${product.image}"
            alt="${product.name}"
            width="400"
            height="400"
            loading="${eager ? "eager" : "lazy"}"
            decoding="async"
          />
        </a>
        ${product.discountLabel ? `<span class="badge product-card__badge">${product.discountLabel}</span>` : ""}
        <button
          type="button"
          class="product-card__wishlist ${wishlisted ? "is-active" : ""}"
          data-action="toggle-wishlist"
          data-product-id="${product.id}"
          data-slug="${product.slug}"
          data-name="${product.name}"
          data-price="${product.price}"
          data-image="${product.image}"
          data-category="${product.category}"
          aria-pressed="${wishlisted}"
          aria-label="${wishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}"
        >${wishlisted ? "&#9829;" : "&#9825;"}</button>
      </div>

      <div class="card__body product-card__body">
        <p class="product-card__category">${product.category}</p>

        <h3 class="card__title">
          <a href="/product/${product.slug}">${product.name}</a>
        </h3>

        <p class="product-card__desc">${product.shortDescription}</p>

        <div class="product-card__price-row">
          <span class="product-card__price">R${product.price.toFixed(2)}</span>
          ${product.oldPrice ? `<span class="product-card__old-price">R${product.oldPrice.toFixed(2)}</span>` : ""}
        </div>

        <p class="product-card__stock product-card__stock--${stockClass}">${product.stockStatus}</p>

        <div class="product-card__actions">
          <button
            type="button"
            class="btn btn--primary btn--sm"
            data-action="add-to-cart"
            data-product-id="${product.id}"
            data-slug="${product.slug}"
            data-name="${product.name}"
            data-price="${product.price}"
            data-image="${product.image}"
          >Add to Cart</button>
        </div>
      </div>
    </article>
  `;
}
