// Product/category data source for every product-browsing page (home
// rails, shop, categories, product details, search). Tries the
// backend API first; if it's unreachable (not running locally, or not
// yet deployed anywhere GitHub Pages can reach), falls back to the
// existing static data files so the site still works exactly as it
// did in Version 1 — just with a console warning, never a
// customer-facing error, since a missing backend is an expected,
// normal state during local development.
//
// Filtering/sorting (src/js/search.js) still runs entirely client-side
// against whichever array this returns, unchanged from Version 1 —
// the two datasets are the same shape, so search.js never needs to
// know which one it's looking at. This was a deliberate choice over
// pushing filters through API query params: the catalogue is small
// (10 products), the existing filter UI (price *ranges*, a "low-stock"
// option) doesn't map 1:1 onto the API's query params (plain
// minPrice/maxPrice, only in-stock/out-of-stock), and reusing the
// already-working, already-tested filter code is lower risk than
// rebuilding it around the API for this milestone.

import { apiGet } from "../apiClient.js";
import { mapApiCategoryToFrontendShape, mapApiProductToFrontendShape } from "./mappers.js";
import { products as staticProducts } from "../../data/products.js";
import { categories as staticCategories } from "../../data/categories.js";

// Cached for the lifetime of the page (resets on a real page reload) —
// avoids re-fetching the whole catalogue on every route change.
let cachedCatalog = null;

function warnFallback(error) {
  console.warn(
    "[Seasonedz] Could not load products/categories from the backend API — using the built-in sample data instead. " +
      "Start the backend locally (cd backend && npm run dev) to browse live data.",
    error
  );
}

// Version 7, Milestone 83: a category's own stored image (Category.imageUrl,
// set once and never revisited) is a separate field from any product's
// image — uploading real photos for products (Milestones 69-74) never
// touches it, which is exactly why category cards kept showing the
// original shared placeholder graphics after real product photos went
// live. Rather than adding a whole separate category-image admin
// feature, each category's card now shows one of its own products'
// current primary image instead — always in sync with real product
// photos, with nothing new to remember to update. Falls back to the
// category's own stored image only if it somehow has no products at
// all (never happens in current data, but kept as a safety net).
function withRepresentativeCategoryImages(categories, products) {
  return categories.map((category) => {
    const representativeProduct = products.find((product) => product.categorySlug === category.slug);
    return {
      ...category,
      image: representativeProduct ? representativeProduct.image : category.image,
    };
  });
}

export async function getCatalog() {
  if (cachedCatalog) return cachedCatalog;

  try {
    const [productsResponse, categoriesResponse] = await Promise.all([apiGet("/products"), apiGet("/categories")]);
    const products = productsResponse.data.products.map(mapApiProductToFrontendShape);

    cachedCatalog = {
      products,
      categories: withRepresentativeCategoryImages(
        categoriesResponse.data.categories.map(mapApiCategoryToFrontendShape),
        products
      ),
      source: "api",
    };
  } catch (error) {
    warnFallback(error);
    cachedCatalog = {
      products: staticProducts,
      categories: withRepresentativeCategoryImages(staticCategories, staticProducts),
      source: "static",
    };
  }

  return cachedCatalog;
}

export async function getProductBySlug(slug) {
  const { products } = await getCatalog();
  return products.find((product) => product.slug === slug) || null;
}
