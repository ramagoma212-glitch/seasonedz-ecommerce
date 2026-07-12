// Full category listing page. Each category card links into the shop
// page pre-filtered to that category.

import { categories } from "../data/categories.js";
import { renderCategoryCard } from "../components/categoryCard.js";

export function renderCategories() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Categories</h1>
      <p class="stub-page__text">
        Browse our range of product categories, from colouring books to
        classroom-ready packs for schools and churches.
      </p>
      <div class="grid grid--3">
        ${categories.map((category) => renderCategoryCard(category)).join("")}
      </div>
    </section>
  `;
}
