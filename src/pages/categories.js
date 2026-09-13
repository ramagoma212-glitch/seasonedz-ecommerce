// Full category listing page. Each category card links into the shop
// page pre-filtered to that category.
//
// Category data now loads from the backend API where possible,
// falling back to the static data file if it's unavailable — see
// js/api/productsApi.js.
//
// Milestone 184 SEO audit fix: only categories with real products are
// shown/linked here — mirrors scripts/generate-static-routes.mjs's own
// `productCount > 0` filter for which categories get a generated
// static page. Before this fix the two disagreed: a genuine, active,
// zero-product category (e.g. "Schools and Wholesale", before it has
// any products assigned) still rendered a clickable card here, linking
// to a /category/:slug route that had no static file and returned a
// real HTTP 404 — a broken internal link, found via a live crawl.

import { renderCategoryCard } from "../components/categoryCard.js";
import { getCatalog } from "../js/api/productsApi.js";

export async function renderCategories() {
  const { categories } = await getCatalog();
  const categoriesWithProducts = categories.filter((category) => category.productCount > 0);

  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Categories</h1>
      <p class="stub-page__text">
        Browse our range of product categories, from colouring books to
        classroom-ready packs for schools and churches.
      </p>
      <div class="category-grid">
        ${categoriesWithProducts.map((category, index) => renderCategoryCard(category, { eager: index < 3 })).join("")}
      </div>
    </section>
  `;
}
