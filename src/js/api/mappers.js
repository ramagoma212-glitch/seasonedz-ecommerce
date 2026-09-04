// Maps backend API response shapes onto the exact shape the existing
// frontend code (product cards, cart, wishlist, search/filter/sort,
// checkout) already expects — the same shape src/data/products.js and
// src/data/categories.js provide. Nothing downstream needs to know or
// care whether a product/category came from the API or the static
// fallback data.

import { withBase } from "../paths.js";

// Uses the product's slug as its frontend `id` (not the database's
// internal cuid) — the static data's id and slug were always identical
// strings, and cart/wishlist Local Storage entries are keyed by this
// id, so anything already saved in a customer's browser keeps matching
// correctly regardless of whether products load from the API or the
// static fallback.
export function mapApiProductToFrontendShape(apiProduct) {
  return {
    id: apiProduct.slug,
    slug: apiProduct.slug,
    name: apiProduct.name,
    // Version 7, Milestone 171I: only ever real admin-set data — never
    // fabricated when absent (see productDetails.js's buildProductStructuredData()
    // and scripts/generate-static-routes.mjs's Merchant Center feed,
    // both of which only add a sku/mpn field when this is truthy).
    sku: apiProduct.sku || null,
    category: apiProduct.category?.name ?? "",
    categorySlug: apiProduct.category?.slug ?? "",
    price: apiProduct.price,
    oldPrice: apiProduct.oldPrice,
    image: apiProduct.image ? withBase(apiProduct.image) : "",
    gallery: (apiProduct.gallery || []).map(withBase),
    shortDescription: apiProduct.shortDescription || "",
    description: apiProduct.description || "",
    features: apiProduct.features || [],
    ageRange: apiProduct.ageRange || "",
    stockStatus: apiProduct.stockStatus,
    rating: apiProduct.ratingAverage,
    reviewCount: apiProduct.reviewCount,
    tags: apiProduct.tags || [],
    isFeatured: apiProduct.isFeatured,
    isBestSeller: apiProduct.isBestSeller,
    isNewArrival: apiProduct.isNewArrival,
    discountLabel: apiProduct.discountLabel,
    // Version 7, Milestone 152: secure digital downloads. productType
    // defaults "PHYSICAL" for the static fallback catalogue (src/data/
    // products.js), which predates this field entirely — every one of
    // those sample products is a real physical book/marker set.
    // digitalDownload is null for every physical product and for a
    // digital product with no active file (see product.service.ts's own
    // toProductOutput()) — never a guess at file details.
    productType: apiProduct.productType || "PHYSICAL",
    digitalDownload: apiProduct.digitalDownload || null,
    // Milestone 181, Part J: computed backend-side (product.service.ts's
    // toProductOutput()) — never a raw admin flag. isPreorder is only
    // ever true for a currently-open, explicitly-enabled preorder
    // window; preorderReleaseAt is only ever populated alongside it.
    isPreorder: apiProduct.isPreorder || false,
    isPreorderDiscountEligible: apiProduct.isPreorderDiscountEligible || false,
    preorderReleaseAt: apiProduct.preorderReleaseAt || null,
  };
}

export function mapApiCategoryToFrontendShape(apiCategory) {
  return {
    id: apiCategory.id,
    slug: apiCategory.slug,
    name: apiCategory.name,
    description: apiCategory.description || "",
    image: apiCategory.imageUrl ? withBase(apiCategory.imageUrl) : "",
    productCount: apiCategory.productCount,
  };
}

// Frontend payment method values (checkout radio buttons, unchanged
// from Version 1 — see src/js/orders.js) vs. the backend's
// PaymentMethod enum.
const PAYMENT_METHOD_TO_BACKEND = {
  "bank-transfer": "BANK_TRANSFER",
  payfast: "PAYFAST",
  "cash-on-delivery": "CASH_ON_DELIVERY",
};

export function mapPaymentMethodToBackend(frontendValue) {
  return PAYMENT_METHOD_TO_BACKEND[frontendValue] || null;
}
