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
import { setPageMeta } from "../js/seo.js";

// Version 6, Milestone 48: when a category filter is active, this page
// doubles as that category's own page — overriding the router's
// generic "Shop" title/description with one naming the actual
// category, "where possible" per VERSION_6_PRODUCT_PAGES_AND_SEO_PLAN.md.
// There's no separate per-category route/URL today, so this is the
// only page a category filter can ever set metadata from.
function categoryIntro(activeCategory) {
  if (!activeCategory) {
    return "Browse our full range of colouring books, Bible colouring books, mindfulness colouring, markers, crayons and bundles.";
  }
  return activeCategory.description || `Browse our ${activeCategory.name} range from Seasonedz Group.`;
}

export async function renderShop({ query } = {}) {
  const { products, categories } = await getCatalog();
  const { results, term, activeCategory, sort } = getProductResults(products, categories, query);
  const ageRanges = getDistinctAgeRanges(products);
  const tags = getDistinctTags(products);

  if (activeCategory) {
    setPageMeta({
      title: activeCategory.name,
      description: `Shop ${activeCategory.name} from Seasonedz Group. ${categoryIntro(activeCategory)}`.slice(0, 160),
    });
  }

  return `
    <section class="stub-page container shop-page">
      <h1 class="stub-page__title">${activeCategory ? activeCategory.name : "Shop"}</h1>
      <p class="stub-page__text">
        ${categoryIntro(activeCategory)}
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
              ? `<div class="product-grid">${results.map((product, index) => renderProductCard(product, { eager: index < 4 })).join("")}</div>`
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
