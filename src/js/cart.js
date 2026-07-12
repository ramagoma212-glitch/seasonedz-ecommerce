// Shopping cart logic, persisted to Local Storage.
//
// IMPORTANT (future backend note): this cart — including every price
// in it — lives entirely in the customer's browser. It is convenient
// for showing totals on the frontend, but it must never be trusted as
// the source of truth once a real backend exists. When checkout is
// wired up to a server in a later milestone, every price and every
// item's availability must be re-verified server-side before an order
// is accepted.

import { getStorageItem, setStorageItem, clearStorageItem } from "./storage.js";

const CART_KEY = "seasonedz_cart";

export function getCart() {
  return getStorageItem(CART_KEY, []);
}

export function saveCart(cart) {
  setStorageItem(CART_KEY, cart);
}

// product: { productId, slug, name, price, image }
export function addToCart(product, quantity = 1) {
  const cart = getCart();
  const existing = cart.find((item) => item.productId === product.productId);

  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({
      productId: product.productId,
      slug: product.slug,
      name: product.name,
      price: product.price,
      image: product.image,
      quantity,
    });
  }

  saveCart(cart);
  return cart;
}

export function removeFromCart(productId) {
  const cart = getCart().filter((item) => item.productId !== productId);
  saveCart(cart);
  return cart;
}

// Sets a cart item's quantity directly (e.g. from a typed input).
// Quantity can never go below 1 — use removeFromCart to delete an item.
export function updateCartQuantity(productId, quantity) {
  const cart = getCart();
  const item = cart.find((cartItem) => cartItem.productId === productId);
  if (!item) return cart;

  item.quantity = Math.max(1, Math.round(quantity));
  saveCart(cart);
  return cart;
}

export function increaseCartQuantity(productId, step = 1) {
  const cart = getCart();
  const item = cart.find((cartItem) => cartItem.productId === productId);
  if (!item) return cart;

  item.quantity += step;
  saveCart(cart);
  return cart;
}

export function decreaseCartQuantity(productId, step = 1) {
  const cart = getCart();
  const item = cart.find((cartItem) => cartItem.productId === productId);
  if (!item) return cart;

  item.quantity = Math.max(1, item.quantity - step);
  saveCart(cart);
  return cart;
}

export function clearCart() {
  clearStorageItem(CART_KEY);
}

export function getCartItemCount() {
  return getCart().reduce((total, item) => total + item.quantity, 0);
}

export function getCartSubtotal() {
  return getCart().reduce((total, item) => total + item.price * item.quantity, 0);
}

// Convenience bundle for pages that need the items, count and subtotal
// together (avoids reading/looping over the cart three separate times).
export function getCartSummary() {
  const items = getCart();
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  return { items, itemCount, subtotal };
}

export function isInCart(productId) {
  return getCart().some((item) => item.productId === productId);
}
