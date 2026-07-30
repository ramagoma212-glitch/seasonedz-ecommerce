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

// Exported (Version 7, Milestone 150) so display-only copy elsewhere
// (e.g. the homepage FAQ) can quote the real current fee/threshold
// instead of hard-coding a second copy that could drift out of sync —
// this is a read of the existing config, not a new delivery rule.
export const STANDARD_DELIVERY_FEE = 80;
export const REGISTERED_FREE_DELIVERY_THRESHOLD = 500;

// Version 7, Milestone 131: free delivery is a registered-account
// benefit, not a flat subtotal threshold for every visitor — R80
// standard, free only for a logged-in registered customer on orders of
// R500 or more. This is a client-side estimate for display purposes
// only (cart/checkout pages) — the backend independently recalculates
// the real fee at order-creation time from the verified customer
// session, never trusting anything this function returns. Will be
// replaced by real courier-calculated rates once courier integration
// exists — see the milestone roadmap.
export function calculateDeliveryFee(subtotal, isRegisteredCustomer = false) {
  return isRegisteredCustomer && subtotal >= REGISTERED_FREE_DELIVERY_THRESHOLD ? 0 : STANDARD_DELIVERY_FEE;
}

export function getCart() {
  return getStorageItem(CART_KEY, []);
}

export function saveCart(cart) {
  setStorageItem(CART_KEY, cart);
}

// product: { productId, slug, name, price, image, productType }
// Version 7, Milestone 152: `productType` defaults to "PHYSICAL" when
// absent — both for a caller that predates this field (none do today,
// but defensive) and for any cart item already saved in a customer's
// browser from before this milestone, which is always safely a
// physical product (digital products didn't exist yet).
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
      productType: product.productType || "PHYSICAL",
      quantity,
    });
  }

  saveCart(cart);
  return cart;
}

// Version 7, Milestone 152: used by cart/checkout to decide which
// delivery messaging to show. A cart item with no productType at all
// (saved before this milestone existed) is treated as PHYSICAL — the
// safe default, since every product in this catalogue was physical
// until now.
export function getCartComposition(items) {
  const hasPhysical = items.some((item) => (item.productType || "PHYSICAL") === "PHYSICAL");
  const hasDigital = items.some((item) => item.productType === "DIGITAL");
  return { hasPhysical, hasDigital, isDigitalOnly: hasDigital && !hasPhysical, isMixed: hasDigital && hasPhysical };
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

// Convenience bundle for pages that need the items, count, subtotal,
// delivery fee and total together (avoids reading/looping over the
// cart several separate times). `isRegisteredCustomer` defaults to
// false (guest) — callers that already know the logged-in state
// (cartPage.js, checkoutPage.js — via GET /api/customers/me) pass it
// through explicitly.
export function getCartSummary(isRegisteredCustomer = false) {
  const items = getCart();
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  const deliveryFee = calculateDeliveryFee(subtotal, isRegisteredCustomer);
  const total = subtotal + deliveryFee;
  return { items, itemCount, subtotal, deliveryFee, total, composition: getCartComposition(items) };
}

export function isInCart(productId) {
  return getCart().some((item) => item.productId === productId);
}
