// Reusable category card. Used on the homepage and the categories page.
// Links to this category's own real page — Version 7, Milestone 171I:
// changed from a "/shop?category=<slug>" query-filtered link to the
// new path-based "/category/<slug>" route (see categoryPage.js), which
// self-canonicalises correctly and gets its own static/sitemap entry;
// the old query-string form still works, this is just the stronger
// primary link now.

import { getCardImageUrl } from "../js/imageTransforms.js";

// Version 7, Milestone 92A: see productCard.js's comment for the
// eager/width/height reasoning — same pattern here.
export function renderCategoryCard(category, { eager = false } = {}) {
  return `
    <a class="card category-card" href="/category/${category.slug}">
      <img
        class="card__image"
        src="${getCardImageUrl(category.image)}"
        data-original-src="${category.image}"
        alt="${category.name}"
        width="400"
        height="400"
        loading="${eager ? "eager" : "lazy"}"
        decoding="async"
      />
      <div class="card__body">
        <h3 class="card__title">${category.name}</h3>
        <p class="card__subtitle">${category.productCount} product${category.productCount === 1 ? "" : "s"}</p>
        <p class="category-card__desc">${category.description}</p>
      </div>
    </a>
  `;
}
