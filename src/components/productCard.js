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
import { getCardImageUrl } from "../js/imageTransforms.js";
import { preorderAvailabilityText } from "../js/preorder.js";

const STOCK_STATUS_CLASS = {
  "In Stock": "in",
  "Low Stock": "low",
  "Out of Stock": "out",
};

// Version 7, Milestone 95: product cards no longer call this — the
// rating/reviewCount they used to show was demo/sample data hardcoded
// in src/data/products.js, not real customer reviews.
// Version 7, Milestone 171C: the fake-testimonial page that used to be
// this function's only caller was removed entirely — kept exported
// here as a generic star-rendering helper, now reused by the genuine
// product review display (components/productReviews.js).
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
// Version 7, Milestone 150: showViewLink adds an explicit "View
// Product" text link (the homepage's New Releases section wants one
// visibly, alongside the image/title links this card already has) —
// opt-in and defaults to false so every existing caller (shop grid,
// category pages, search results, wishlist) renders exactly as
// before.
// Version 7, Milestone 167: displayTitle lets a caller show a shorter
// homepage-only heading (e.g. "ABC Colouring Book for Kids" instead of
// the full SEO product name) without touching product.name anywhere —
// the real database name, the product page's own <h1>/SEO title, and
// every other caller of this card (shop grid, category pages, search,
// wishlist) are completely unaffected since this defaults to
// product.name when not supplied. alt text and the wishlist button's
// data-name still use the real product.name — display-only shortening
// never changes what's actually added to cart/wishlist.
// Version 7, Milestone 167: hiddenExtra is an opt-in pair with
// components/expandableGrid.js's renderExpandableGrid() — when true,
// the card renders with the `hidden` attribute and
// data-extra-card="true" directly on this card's own root element
// (never a wrapping div, which would break this card's status as a
// direct CSS Grid child of .product-grid and any :nth-child alignment
// rules keyed off that). Defaults to false so every existing caller
// renders identically to before.
// Version 7, Milestone 171E: a PHYSICAL product whose authoritative
// stockStatus (backend product.service.ts's deriveStockStatus() — see
// that file's own comment) reads "Out of Stock" can never be added to
// cart from here — Wishlist is entirely unaffected, on purpose (Part 2
// of the milestone brief: out-of-stock blocks Cart, never Wishlist).
// DIGITAL products are never subject to this at all: they have no
// physical inventory concept, matching every other stock check in this
// codebase (order.service.ts's verifyItems(), cart.js's
// getUnavailableCartItems()).
// Milestone 181, Part J: an explicitly admin-enabled active preorder
// (product.isPreorder — computed backend-side, never a raw admin flag)
// bypasses the ordinary stock gate here too, mirroring the backend's
// own verifyItems() bypass exactly — never a guess made independently
// on the frontend.
export function isOutOfStockForCart(product) {
  if (product.isPreorder) return false;
  return (product.productType || "PHYSICAL") !== "DIGITAL" && product.stockStatus === "Out of Stock";
}

export function renderProductCard(product, { eager = false, showViewLink = false, displayTitle = null, hiddenExtra = false } = {}) {
  const stockClass = STOCK_STATUS_CLASS[product.stockStatus] || "in";
  const wishlisted = isInWishlist(product.id);
  const title = displayTitle || product.name;
  const outOfStock = isOutOfStockForCart(product);

  return `
    <article class="card product-card"${hiddenExtra ? ' hidden data-extra-card="true"' : ""}>
      <div class="product-card__media">
        <a href="/product/${product.slug}">
          <img
            class="card__image"
            src="${getCardImageUrl(product.image)}"
            data-original-src="${product.image}"
            alt="${product.name}"
            width="400"
            height="400"
            loading="${eager ? "eager" : "lazy"}"
            decoding="async"
          />
        </a>
        ${
          product.discountLabel || product.productType === "DIGITAL" || product.isPreorder
            ? `
          <div class="product-card__badges">
            ${product.isPreorder ? `<span class="badge product-card__badge--preorder">Preorder</span>` : ""}
            ${product.discountLabel ? `<span class="badge">${product.discountLabel}</span>` : ""}
            ${product.productType === "DIGITAL" ? `<span class="badge product-card__badge--digital">Digital Download</span>` : ""}
          </div>
        `
            : ""
        }
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
          <a href="/product/${product.slug}">${title}</a>
        </h3>

        <p class="product-card__desc">${product.shortDescription}</p>

        <div class="product-card__price-row">
          <span class="product-card__price">R${product.price.toFixed(2)}</span>
          ${product.oldPrice ? `<span class="product-card__old-price">R${product.oldPrice.toFixed(2)}</span>` : ""}
        </div>

        ${
          product.isPreorder
            ? `<p class="product-card__preorder-note">${preorderAvailabilityText(product.preorderReleaseAt)}</p>`
            : `<p class="product-card__stock product-card__stock--${stockClass}">${product.stockStatus}</p>`
        }

        <div class="product-card__actions">
          ${showViewLink ? `<a class="btn btn--secondary btn--sm" href="/product/${product.slug}">View Product</a>` : ""}
          ${
            outOfStock
              ? `<button type="button" class="btn btn--primary btn--sm" disabled aria-disabled="true">Out of Stock</button>`
              : `
          <button
            type="button"
            class="btn btn--primary btn--sm"
            data-action="add-to-cart"
            data-product-id="${product.id}"
            data-slug="${product.slug}"
            data-name="${product.name}"
            data-price="${product.price}"
            data-image="${product.image}"
            data-product-type="${product.productType || "PHYSICAL"}"
            data-is-preorder="${product.isPreorder ? "true" : "false"}"
            data-preorder-release-at="${product.preorderReleaseAt || ""}"
          >${product.isPreorder ? "Add Preorder to Cart" : "Add to Cart"}</button>
          `
          }
        </div>
      </div>
    </article>
  `;
}
