// Shared product-discovery UI: the filter panel, the sort select, the
// active-filters chip row, the product count line and empty states.
// Used by both the shop page and the search results page so filter and
// sort markup only exists in one place.

import {
  PRICE_RANGES,
  STOCK_OPTIONS,
  SORT_OPTIONS,
  escapeHtml,
  buildRemoveFilterHref,
  buildClearFiltersHref,
} from "../js/search.js";

function renderSelect({ label, name, options, currentValue, allLabel }) {
  return `
    <div class="filter-panel__group">
      <label class="filter-panel__label" for="filter-${name}">${label}</label>
      <select id="filter-${name}" class="filter-panel__select" data-filter="${name}">
        <option value="">${allLabel}</option>
        ${options
          .map(
            (option) => `
              <option value="${option.value}" ${option.value === currentValue ? "selected" : ""}>
                ${option.label}
              </option>
            `
          )
          .join("")}
      </select>
    </div>
  `;
}

// path: the current page's route, e.g. "/shop" or "/search" (used to
// build the "Clear Filters" href). query: the current URLSearchParams.
export function renderFilterBar({ path, query, categories, ageRanges, tags }) {
  const currentCategory = query?.get("category") || "";
  const currentPrice = query?.get("price") || "";
  const currentAge = query?.get("age") || "";
  const currentStock = query?.get("stock") || "";
  const currentTag = query?.get("tag") || "";

  const categoryOptions = categories.map((category) => ({ value: category.slug, label: category.name }));
  const ageOptions = ageRanges.map((age) => ({ value: age, label: age }));
  const tagOptions = tags.map((tag) => ({ value: tag, label: tag.charAt(0).toUpperCase() + tag.slice(1) }));

  return `
    <h3 class="filter-panel__heading">Filters</h3>
    ${renderSelect({
      label: "Category",
      name: "category",
      options: categoryOptions,
      currentValue: currentCategory,
      allLabel: "All Categories",
    })}
    ${renderSelect({
      label: "Price",
      name: "price",
      options: PRICE_RANGES,
      currentValue: currentPrice,
      allLabel: "Any Price",
    })}
    ${renderSelect({
      label: "Age Range",
      name: "age",
      options: ageOptions,
      currentValue: currentAge,
      allLabel: "Any Age",
    })}
    ${renderSelect({
      label: "Availability",
      name: "stock",
      options: STOCK_OPTIONS,
      currentValue: currentStock,
      allLabel: "Any Availability",
    })}
    ${renderSelect({
      label: "Tag",
      name: "tag",
      options: tagOptions,
      currentValue: currentTag,
      allLabel: "All Tags",
    })}
    <a class="filter-panel__clear" href="${buildClearFiltersHref(path, query)}">Clear Filters</a>
  `;
}

export function renderSortSelect(sort) {
  return `
    <select class="shop-toolbar__sort" data-filter="sort" aria-label="Sort products">
      ${SORT_OPTIONS.map(
        (option) => `<option value="${option.value}" ${option.value === sort ? "selected" : ""}>${option.label}</option>`
      ).join("")}
    </select>
  `;
}

const FILTER_LABELS = {
  category: "Category",
  price: "Price",
  age: "Age",
  stock: "Availability",
  tag: "Tag",
};

function activeFilterValueLabel(key, value, categories) {
  if (key === "category") return categories.find((category) => category.slug === value)?.name || value;
  if (key === "price") return PRICE_RANGES.find((range) => range.value === value)?.label || value;
  if (key === "stock") return STOCK_OPTIONS.find((option) => option.value === value)?.label || value;
  if (key === "tag") return value.charAt(0).toUpperCase() + value.slice(1);
  return value;
}

export function renderActiveFilters({ path, query, categories }) {
  const activeKeys = Object.keys(FILTER_LABELS).filter((key) => query?.get(key));
  if (!activeKeys.length) return "";

  return `
    <div class="active-filters">
      <span class="active-filters__label">Active filters:</span>
      ${activeKeys
        .map((key) => {
          const value = query.get(key);
          return `
            <a class="active-filters__chip" href="${buildRemoveFilterHref(path, query, key)}">
              ${escapeHtml(FILTER_LABELS[key])}: ${escapeHtml(activeFilterValueLabel(key, value, categories))}
              <span aria-hidden="true">&times;</span>
            </a>
          `;
        })
        .join("")}
    </div>
  `;
}

// Renders "Showing N products", "Showing N products in <Category>" or
// "Showing N results for "<term>"" depending on what's active.
export function renderProductCount({ count, categoryName, term }) {
  const isSearch = Boolean(term);
  const noun = count === 1 ? (isSearch ? "result" : "product") : isSearch ? "results" : "products";

  let text = `Showing ${count} ${noun}`;
  if (isSearch) {
    text += ` for &ldquo;${escapeHtml(term)}&rdquo;`;
  } else if (categoryName) {
    text += ` in ${escapeHtml(categoryName)}`;
  }

  return `<p class="shop-toolbar__count">${text}</p>`;
}

export function renderEmptyState({ title, message, actionHref, actionLabel }) {
  return `
    <div class="empty-state">
      <h3 class="empty-state__title">${title}</h3>
      <p class="empty-state__text">${message}</p>
      <a class="btn btn--primary" href="${actionHref}">${actionLabel}</a>
    </div>
  `;
}
