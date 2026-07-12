// Product search, filter and sort logic.
// Pure functions only (no DOM here) so the shop page and the search
// results page can both call the exact same code instead of duplicating
// filter/search logic. URL building helpers live here too, since they
// operate on the same filter keys these functions understand.

export const PRICE_RANGES = [
  { value: "0-100", label: "Under R100" },
  { value: "100-200", label: "R100 - R200" },
  { value: "200-300", label: "R200 - R300" },
  { value: "300-99999", label: "R300 and Above" },
];

export const STOCK_OPTIONS = [
  { value: "in-stock", label: "In Stock" },
  { value: "low-stock", label: "Low Stock" },
  { value: "out-of-stock", label: "Out of Stock" },
];

export const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "rating-desc", label: "Best Rating" },
  { value: "newest", label: "Newest" },
  { value: "name-asc", label: "Name: A to Z" },
];

// The filter keys that can appear together in a query string, e.g.
// "#/shop?category=bundles&price=100-200&stock=in-stock".
const FILTER_KEYS = ["category", "price", "age", "stock", "tag"];

// Turns "In Stock" into "in-stock" so it matches the URL scheme used by
// the ?stock= query param.
export function slugifyStock(status) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

// Escapes text before it is placed inside an HTML template string.
// Needed anywhere a customer-typed search term is displayed, since it
// is otherwise untrusted text going straight into innerHTML.
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Simple case-insensitive search across every field a customer might
// reasonably expect to match on.
export function searchProducts(products, term) {
  const needle = term.trim().toLowerCase();
  if (!needle) return products;

  return products.filter((product) => {
    const haystack = [
      product.name,
      product.category,
      product.shortDescription,
      product.description,
      ...(product.features || []),
      ...(product.tags || []),
      product.ageRange,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(needle);
  });
}

// Applies every active filter as an AND condition. Any filter left
// blank/undefined is skipped, so filters combine freely.
export function filterProducts(products, filters = {}) {
  let result = products;

  if (filters.category) {
    result = result.filter((product) => product.categorySlug === filters.category);
  }

  if (filters.price) {
    const [min, max] = filters.price.split("-").map(Number);
    result = result.filter((product) => product.price >= min && product.price <= max);
  }

  if (filters.age) {
    result = result.filter((product) => product.ageRange === filters.age);
  }

  if (filters.stock) {
    result = result.filter((product) => slugifyStock(product.stockStatus) === filters.stock);
  }

  if (filters.tag) {
    const needle = filters.tag.toLowerCase();
    result = result.filter((product) => (product.tags || []).some((tag) => tag.toLowerCase() === needle));
  }

  return result;
}

export function sortProducts(products, sortKey) {
  const sorted = [...products];

  switch (sortKey) {
    case "price-asc":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-desc":
      return sorted.sort((a, b) => b.price - a.price);
    case "rating-desc":
      return sorted.sort((a, b) => b.rating - a.rating);
    case "newest":
      return sorted.sort((a, b) => Number(b.isNewArrival) - Number(a.isNewArrival));
    case "name-asc":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "featured":
    default:
      return sorted.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
  }
}

// Distinct age ranges present in the catalog, ordered by their leading
// number (so "3-8 years" comes before "16+ years") rather than
// alphabetically.
export function getDistinctAgeRanges(products) {
  const unique = [...new Set(products.map((product) => product.ageRange))];
  return unique.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

// Distinct tags present in the catalog, alphabetically sorted.
export function getDistinctTags(products) {
  const all = products.flatMap((product) => product.tags || []);
  return [...new Set(all)].sort((a, b) => a.localeCompare(b));
}

// The single entry point the shop page and search results page both
// call: reads q/category/price/age/stock/tag/sort from the current URL
// query string and returns the matching, filtered, sorted products.
export function getProductResults(products, categories, query) {
  const params = query instanceof URLSearchParams ? query : new URLSearchParams(query || "");

  const term = (params.get("q") || "").trim();
  const filters = {
    category: params.get("category") || "",
    price: params.get("price") || "",
    age: params.get("age") || "",
    stock: params.get("stock") || "",
    tag: params.get("tag") || "",
  };
  const sort = params.get("sort") || "featured";

  let results = term ? searchProducts(products, term) : products;
  results = filterProducts(results, filters);
  results = sortProducts(results, sort);

  const activeCategory = filters.category
    ? categories.find((category) => category.slug === filters.category) || null
    : null;

  return { results, term, filters, sort, activeCategory };
}

// Builds a hash href for `path` using `query` as the starting point,
// applying `overrides` on top (a falsy value removes that key).
export function buildHref(path, query, overrides = {}) {
  const params = new URLSearchParams(query ? query.toString() : "");

  Object.entries(overrides).forEach(([key, value]) => {
    if (value) params.set(key, value);
    else params.delete(key);
  });

  const queryString = params.toString();
  return `#${path}${queryString ? `?${queryString}` : ""}`;
}

export function buildRemoveFilterHref(path, query, key) {
  return buildHref(path, query, { [key]: "" });
}

// Clears every filter key but keeps the search term (if any), so
// "Clear Filters" on the search results page doesn't also clear q.
export function buildClearFiltersHref(path, query) {
  const overrides = {};
  FILTER_KEYS.forEach((key) => {
    overrides[key] = "";
  });
  return buildHref(path, query, overrides);
}
