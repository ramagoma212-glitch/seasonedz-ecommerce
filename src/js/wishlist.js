// Wishlist logic, persisted to Local Storage.
//
// This is a guest, frontend-only wishlist for now. Once customer
// accounts and login exist, wishlist data should be linked to the
// logged-in customer (e.g. synced to their account) instead of living
// only in this browser's Local Storage.

import { getStorageItem, setStorageItem, clearStorageItem } from "./storage.js";

const WISHLIST_KEY = "seasonedz_wishlist";

export function getWishlist() {
  return getStorageItem(WISHLIST_KEY, []);
}

export function saveWishlist(list) {
  setStorageItem(WISHLIST_KEY, list);
}

export function isInWishlist(productId) {
  return getWishlist().some((item) => item.productId === productId);
}

// product: { productId, slug, name, price, image, category }
// A product can only appear once — adding an already-saved product is a no-op.
export function addToWishlist(product) {
  if (isInWishlist(product.productId)) return getWishlist();

  const list = getWishlist();
  list.push({
    productId: product.productId,
    slug: product.slug,
    name: product.name,
    price: product.price,
    image: product.image,
    category: product.category,
  });
  saveWishlist(list);
  return list;
}

export function removeFromWishlist(productId) {
  const list = getWishlist().filter((item) => item.productId !== productId);
  saveWishlist(list);
  return list;
}

// Adds the product if it isn't saved yet, removes it if it already is.
// Returns the new saved state (true = now in the wishlist) so the
// caller can update a button's label/icon without a extra lookup.
export function toggleWishlist(product) {
  if (isInWishlist(product.productId)) {
    removeFromWishlist(product.productId);
    return false;
  }

  addToWishlist(product);
  return true;
}

export function clearWishlist() {
  clearStorageItem(WISHLIST_KEY);
}

export function getWishlistCount() {
  return getWishlist().length;
}
