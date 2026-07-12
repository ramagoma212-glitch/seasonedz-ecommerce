// Search results page. Reads ?q= (set by the header search form) plus
// the same category/price/age/stock/tag/sort params the shop page
// uses, via getProductResults, so search and filters combine cleanly.

import { products } from "../data/products.js";
import { categories } from "../data/categories.js";
import { renderProductCard } from "../components/productCard.js";
import {
  renderFilterBar,
  renderSortSelect,
  renderActiveFilters,
  renderProductCount,
  renderEmptyState,
} from "../components/filterBar.js";
import { getProductResults, getDistinctAgeRanges, getDistinctTags, escapeHtml } from "../js/search.js";

function renderNoSearchYet() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Search</h1>
      <p class="stub-page__text">
        Use the search bar above to find colouring books, markers, crayons and bundles.
      </p>
      <a class="btn btn--primary" href="#/shop">Browse the Shop</a>
    </section>
  `;
}

export function renderSearchResults({ query } = {}) {
  const { results, term, sort } = getProductResults(products, categories, query);
  if (!term) return renderNoSearchYet();

  const ageRanges = getDistinctAgeRanges(products);
  const tags = getDistinctTags(products);

  return `
    <section class="stub-page container shop-page">
      <h1 class="stub-page__title">Search Results</h1>
      <p class="stub-page__text">
        Showing results for &ldquo;${escapeHtml(term)}&rdquo;.
        <a class="search-results__clear" href="#/shop">Clear Search</a>
      </p>

      <div class="shop-layout">
        <aside class="filter-panel" aria-label="Filter search results">
          ${renderFilterBar({ path: "/search", query, categories, ageRanges, tags })}
        </aside>

        <div class="shop-main">
          ${renderActiveFilters({ path: "/search", query, categories })}

          <div class="shop-toolbar">
            ${renderProductCount({ count: results.length, term })}
            ${renderSortSelect(sort)}
          </div>

          ${
            results.length
              ? `<div class="grid grid--3">${results.map((product) => renderProductCard(product)).join("")}</div>`
              : renderEmptyState({
                  title: `No results for &ldquo;${escapeHtml(term)}&rdquo;`,
                  message: "Try a different search term, or browse our full range instead.",
                  actionHref: "#/shop",
                  actionLabel: "Back to Shop",
                })
          }
        </div>
      </div>
    </section>
  `;
}
