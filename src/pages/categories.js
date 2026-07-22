// Full category listing page. Each category card links into the shop
// page pre-filtered to that category.
//
// Category data now loads from the backend API where possible,
// falling back to the static data file if it's unavailable — see
// js/api/productsApi.js.

import { renderCategoryCard } from "../components/categoryCard.js";
import { getCatalog } from "../js/api/productsApi.js";

export async function renderCategories() {
  const { categories } = await getCatalog();

  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Categories</h1>
      <p class="stub-page__text">
        Browse our range of product categories, from colouring books to
        classroom-ready packs for schools and churches.
      </p>
      <div class="grid grid--3">
        ${categories.map((category, index) => renderCategoryCard(category, { eager: index < 3 })).join("")}
      </div>
    </section>
  `;
}
