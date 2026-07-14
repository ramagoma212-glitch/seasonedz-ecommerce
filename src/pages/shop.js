// Shop (full product catalog) page.
// Reads category/price/age/stock/tag/sort (and, if present, a search
// term) from the URL query string via getProductResults, so any
// combination of filters is a shareable link.
//
// Product/category data now loads from the backend API where
// possible, falling back to the static data files if it's unavailable
// — see js/api/productsApi.js. Filtering/sorting itself still runs
// client-side (js/search.js), unchanged, against whichever array that
// returns.

import { renderProductCard } from "../components/productCard.js";
import {
  renderFilterBar,
  renderSortSelect,
  renderActiveFilters,
  renderProductCount,
  renderEmptyState,
} from "../components/filterBar.js";
import { getProductResults, getDistinctAgeRanges, getDistinctTags } from "../js/search.js";
import { getCatalog } from "../js/api/productsApi.js";

export async function renderShop({ query } = {}) {
  const { products, categories } = await getCatalog();
  const { results, term, activeCategory, sort } = getProductResults(products, categories, query);
  const ageRanges = getDistinctAgeRanges(products);
  const tags = getDistinctTags(products);

  return `
    <section class="stub-page container shop-page">
      <h1 class="stub-page__title">Shop</h1>
      <p class="stub-page__text">
        Browse our full range of colouring books, Bible colouring books,
        mindfulness colouring, markers, crayons and bundles.
      </p>

      <div class="shop-layout">
        <aside class="filter-panel" aria-label="Filter products">
          ${renderFilterBar({ path: "/shop", query, categories, ageRanges, tags })}
        </aside>

        <div class="shop-main">
          ${renderActiveFilters({ path: "/shop", query, categories })}

          <div class="shop-toolbar">
            ${renderProductCount({ count: results.length, categoryName: activeCategory?.name, term })}
            ${renderSortSelect(sort)}
          </div>

          ${
            results.length
              ? `<div class="grid grid--3">${results.map((product) => renderProductCard(product)).join("")}</div>`
              : renderEmptyState({
                  title: "No products found",
                  message: "Try adjusting or clearing your filters.",
                  actionHref: "#/shop",
                  actionLabel: "View All Products",
                })
          }
        </div>
      </div>
    </section>
  `;
}
