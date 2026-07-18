// Single product details page. Loads a product by the :slug route param
// supplied by router.js. Add to Cart, Add to Wishlist and the quantity
// selector are visual only — see js/app.js for the delegated handlers.
//
// Product data now loads from the backend API where possible, falling
// back to the static data file if it's unavailable — see
// js/api/productsApi.js.
//
// Version 6, Milestone 48: once the product is known, this overrides
// the router's generic "Product | Seasonedz Group" title/description
// with the real product name and its own short description, and adds
// Product structured data (JSON-LD) — see js/seo.js. Deliberately
// never includes aggregateRating/review fields in that structured
// data: the rating/reviewCount shown on the page are sample data, and
// claiming them as real review markup to search engines would be
// misleading — see VERSION_6_PRODUCT_PAGES_AND_SEO_PLAN.md.

import { renderProductCard, renderStars } from "../components/productCard.js";
import { isInWishlist } from "../js/wishlist.js";
import { getCatalog } from "../js/api/productsApi.js";
import { setPageMeta, setPageStructuredData } from "../js/seo.js";

function renderNotFound() {
  setPageMeta({ title: "Product Not Found" });
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Product Not Found</h1>
      <p class="stub-page__text">
        We couldn't find the product you were looking for. It may have
        been removed or the link may be incorrect.
      </p>
      <a class="btn btn--primary" href="#/shop">Back to Shop</a>
    </section>
  `;
}

// One of "In Stock" / "Low Stock" / "Out of Stock" today (see
// data/products.js) — mapped to schema.org's own availability values
// rather than passed through as-is, since those are the only three
// values this catalogue's stockStatus ever actually takes.
function schemaAvailability(stockStatus) {
  if (stockStatus === "Out of Stock") return "https://schema.org/OutOfStock";
  return "https://schema.org/InStock";
}

function buildProductStructuredData(product) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription,
    image: new URL(product.image, window.location.origin).href,
    category: product.category,
    offers: {
      "@type": "Offer",
      priceCurrency: "ZAR",
      price: product.price.toFixed(2),
      availability: schemaAvailability(product.stockStatus),
      url: window.location.href,
    },
  };
}

function renderGallery(product) {
  const images = product.gallery?.length ? product.gallery : [product.image];

  return `
    <div class="product-details__gallery">
      <img class="product-details__main-image" src="${product.image}" alt="${product.name}" />
      ${
        images.length > 1
          ? `
            <div class="product-details__thumbs">
              ${images
                .map((img) => `<img class="product-details__thumb" src="${img}" alt="${product.name} thumbnail" />`)
                .join("")}
            </div>
          `
          : ""
      }
    </div>
  `;
}

function renderRelatedProducts(product, products) {
  const related = products
    .filter((item) => item.categorySlug === product.categorySlug && item.id !== product.id)
    .slice(0, 4);

  if (!related.length) return "";

  return `
    <section class="section">
      <div class="section__header">
        <h2>You May Also Like</h2>
        <p>More from ${product.category}.</p>
      </div>
      <div class="grid grid--4">
        ${related.map((item) => renderProductCard(item)).join("")}
      </div>
    </section>
  `;
}

export async function renderProductDetails({ slug } = {}) {
  const { products } = await getCatalog();
  const product = products.find((item) => item.slug === slug);
  if (!product) return renderNotFound();

  setPageMeta({ title: product.name, description: product.shortDescription });
  setPageStructuredData(buildProductStructuredData(product));

  const wishlisted = isInWishlist(product.id);

  return `
    <section class="container product-details">
      <a class="product-details__back" href="#/shop">&larr; Back to Shop</a>

      <div class="product-details__layout">
        ${renderGallery(product)}

        <div class="product-details__info">
          <p class="product-details__category">${product.category}</p>
          <h1 class="product-details__title">${product.name}</h1>

          <div class="product-details__rating">
            ${renderStars(product.rating)}
            <span>(${product.reviewCount} reviews)</span>
          </div>

          <div class="product-details__price-row">
            <span class="product-details__price">R${product.price.toFixed(2)}</span>
            ${product.oldPrice ? `<span class="product-details__old-price">R${product.oldPrice.toFixed(2)}</span>` : ""}
            ${product.discountLabel ? `<span class="badge">${product.discountLabel}</span>` : ""}
          </div>

          <p class="product-details__stock">${product.stockStatus}</p>
          <p class="product-details__short-desc">${product.shortDescription}</p>

          <div class="product-details__quantity">
            <span>Quantity</span>
            <div class="quantity-selector">
              <button type="button" class="quantity-selector__btn" data-action="qty-decrease" aria-label="Decrease quantity">&minus;</button>
              <input type="number" class="quantity-selector__input" value="1" min="1" readonly />
              <button type="button" class="quantity-selector__btn" data-action="qty-increase" aria-label="Increase quantity">&plus;</button>
            </div>
          </div>

          <div class="product-details__actions">
            <button
              type="button"
              class="btn btn--primary btn--block"
              data-action="add-to-cart"
              data-product-id="${product.id}"
              data-slug="${product.slug}"
              data-name="${product.name}"
              data-price="${product.price}"
              data-image="${product.image}"
            >
              Add to Cart
            </button>
            <button
              type="button"
              class="btn btn--secondary btn--block ${wishlisted ? "is-active" : ""}"
              data-action="toggle-wishlist"
              data-product-id="${product.id}"
              data-slug="${product.slug}"
              data-name="${product.name}"
              data-price="${product.price}"
              data-image="${product.image}"
              data-category="${product.category}"
              aria-pressed="${wishlisted}"
            >
              ${wishlisted ? "Remove from Wishlist" : "Add to Wishlist"}
            </button>
          </div>

          <div class="product-details__meta">
            ${product.paperSize ? `<p><strong>Size:</strong> ${product.paperSize}</p>` : ""}
            ${product.pageCount ? `<p><strong>Pages:</strong> ${product.pageCount}</p>` : ""}
            ${product.binding ? `<p><strong>Binding:</strong> ${product.binding}</p>` : ""}
            <p><strong>Age Range:</strong> ${product.ageRange}</p>
            <p><strong>Tags:</strong> ${product.tags.join(", ")}</p>
          </div>
        </div>
      </div>

      <div class="product-details__description">
        <h2>Product Description</h2>
        <p>${product.description}</p>

        <h3>Features</h3>
        <ul class="product-details__features">
          ${product.features.map((feature) => `<li>${feature}</li>`).join("")}
        </ul>
      </div>

      ${renderRelatedProducts(product, products)}
    </section>
  `;
}
