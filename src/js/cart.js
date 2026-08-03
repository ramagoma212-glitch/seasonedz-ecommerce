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

// Version 7, Milestone 159: optional paid gift wrapping — display-only
// mirror of the backend's own authoritative config
// (backend/src/config/giftWrap.ts). Used here purely to show an
// estimate before checkout; the backend independently recomputes and
// validates every fee itself from the same R30/150 rule, never trusting
// anything this file (or the request body) claims — see
// order.service.ts's verifyItems().
export const GIFT_WRAP_FEE_PER_ITEM = 30;
export const GIFT_MESSAGE_MAX_LENGTH = 150;

// Version 7, Milestone 159: a cart LINE is a product plus its gift-wrap
// configuration, not just a product — a wrapped and unwrapped copy of
// the same product, or two wrapped copies with different messages,
// must never silently merge into one line (doing so would either lose
// a customer's gift message or incorrectly charge/not-charge R30 for
// part of the quantity). For an UNWRAPPED item, lineId is deliberately
// identical to productId — every existing cart entry (saved before
// this milestone, or added via a flow that never mentions gift
// wrapping) already satisfies this by construction, so nothing else in
// this file or its callers needs to change for the plain, no-wrap case.
function computeLineId(productId, giftWrap, giftMessage) {
  if (!giftWrap) return productId;
  return `${productId}::gift::${encodeURIComponent((giftMessage || "").trim())}`;
}

// Version 7, Milestone 159: migrates an item saved before gift wrapping
// existed (or before lineId existed) to the current shape, in place, on
// every read — same "old data still works, treated as the safe
// default" discipline productType || "PHYSICAL" already uses elsewhere
// in this file. Never mutates Local Storage itself (saveCart() is the
// only writer); a pre-existing item is simply presented with these
// fields filled in every time getCart() runs.
//
// Re-enforces the same physical-only eligibility rule addToCart()
// applies at write time — a DIGITAL item's giftWrap is always forced
// false here too, so a directly-edited Local Storage entry (or any
// other future write path that skips addToCart) can never display a
// gift-wrap fee estimate for a digital product, even though the
// backend would independently reject the charge anyway (see
// order.service.ts's verifyItems()). Defense in depth, not the actual
// authority — that's still the backend, never this file.
function normalizeCartItem(item) {
  const productType = item.productType || "PHYSICAL";
  const giftWrap = item.giftWrap === true && productType === "PHYSICAL";
  const giftMessage = giftWrap && item.giftMessage ? item.giftMessage : null;
  return {
    ...item,
    productType,
    giftWrap,
    giftMessage,
    lineId: item.lineId || computeLineId(item.productId, giftWrap, giftMessage),
  };
}

// Exported (Version 7, Milestone 150) so display-only copy elsewhere
// (e.g. the homepage FAQ) can quote the real current fee/threshold
// instead of hard-coding a second copy that could drift out of sync —
// this is a read of the existing config, not a new delivery rule.
export const STANDARD_DELIVERY_FEE = 80;
// Owner-requested change (2026-07-30, deployed together with Milestone
// 152B): raised from R500 to R650 — kept in sync with the backend's
// own source of truth (backend/src/config/delivery.ts).
export const REGISTERED_FREE_DELIVERY_THRESHOLD = 650;

// Version 7, Milestone 131: free delivery is a registered-account
// benefit, not a flat subtotal threshold for every visitor — R80
// standard, free only for a logged-in registered customer on orders of
// R650 or more. This is a client-side estimate for display purposes
// only (cart/checkout pages) — the backend independently recalculates
// the real fee at order-creation time from the verified customer
// session, never trusting anything this function returns. Will be
// replaced by real courier-calculated rates once courier integration
// exists — see the milestone roadmap.
// Version 7, Milestone 152B: `hasPhysicalItems` defaults to `true` so
// every existing call site keeps its exact prior behaviour unless it
// explicitly says otherwise — a digital-only cart has nothing to
// deliver, so it's never charged a delivery fee, matching the
// backend's own utils/money.ts calculateDeliveryFee().
export function calculateDeliveryFee(subtotal, isRegisteredCustomer = false, hasPhysicalItems = true) {
  if (!hasPhysicalItems) return 0;
  return isRegisteredCustomer && subtotal >= REGISTERED_FREE_DELIVERY_THRESHOLD ? 0 : STANDARD_DELIVERY_FEE;
}

export function getCart() {
  return getStorageItem(CART_KEY, []).map(normalizeCartItem);
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
// Version 7, Milestone 159: `giftOptions` defaults to {} so every
// existing caller (shop grid/homepage quick-add, which never mentions
// gift wrapping) keeps adding a plain, unwrapped line exactly as
// before. Matches by lineId, not productId — a wrapped and unwrapped
// add of the same product become two separate lines instead of merging
// (see computeLineId's own comment above); two wrapped adds with the
// SAME message still merge (increment quantity), same as the plain
// case always has.
export function addToCart(product, quantity = 1, giftOptions = {}) {
  const giftWrap = giftOptions.giftWrap === true && (product.productType || "PHYSICAL") === "PHYSICAL";
  const giftMessage = giftWrap && giftOptions.giftMessage ? giftOptions.giftMessage.trim().slice(0, GIFT_MESSAGE_MAX_LENGTH) || null : null;
  const lineId = computeLineId(product.productId, giftWrap, giftMessage);

  const cart = getCart();
  const existing = cart.find((item) => item.lineId === lineId);

  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({
      productId: product.productId,
      lineId,
      slug: product.slug,
      name: product.name,
      price: product.price,
      image: product.image,
      productType: product.productType || "PHYSICAL",
      giftWrap,
      giftMessage,
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

// Version 7, Milestone 159: identifies a cart line by lineId, not
// productId — for an unwrapped item these are identical (see
// computeLineId), so every pre-existing call site that still passes a
// bare productId keeps working exactly as before. Only a wrapped line
// (whose lineId differs from its productId) needs its caller to pass
// the real lineId, which cartItem.js's markup now does.
export function removeFromCart(lineId) {
  const cart = getCart().filter((item) => item.lineId !== lineId);
  saveCart(cart);
  return cart;
}

// Sets a cart item's quantity directly (e.g. from a typed input).
// Quantity can never go below 1 — use removeFromCart to delete an item.
export function updateCartQuantity(lineId, quantity) {
  const cart = getCart();
  const item = cart.find((cartItem) => cartItem.lineId === lineId);
  if (!item) return cart;

  item.quantity = Math.max(1, Math.round(quantity));
  saveCart(cart);
  return cart;
}

export function increaseCartQuantity(lineId, step = 1) {
  const cart = getCart();
  const item = cart.find((cartItem) => cartItem.lineId === lineId);
  if (!item) return cart;

  item.quantity += step;
  saveCart(cart);
  return cart;
}

export function decreaseCartQuantity(lineId, step = 1) {
  const cart = getCart();
  const item = cart.find((cartItem) => cartItem.lineId === lineId);
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

// Version 7, Milestone 159: R30 per wrapped UNIT, not per line/order —
// a wrapped line of quantity 3 costs 3x this. Display-only estimate;
// see this file's own header note on GIFT_WRAP_FEE_PER_ITEM.
export function getCartGiftWrapTotal(items) {
  return items.reduce((total, item) => total + (item.giftWrap ? GIFT_WRAP_FEE_PER_ITEM * item.quantity : 0), 0);
}

// Convenience bundle for pages that need the items, count, subtotal,
// gift-wrap total, delivery fee and total together (avoids reading/
// looping over the cart several separate times). `isRegisteredCustomer`
// defaults to false (guest) — callers that already know the logged-in
// state (cartPage.js, checkoutPage.js — via GET /api/customers/me) pass
// it through explicitly.
export function getCartSummary(isRegisteredCustomer = false) {
  const items = getCart();
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  const giftWrapTotal = getCartGiftWrapTotal(items);
  const composition = getCartComposition(items);
  const deliveryFee = calculateDeliveryFee(subtotal, isRegisteredCustomer, composition.hasPhysical);
  const total = subtotal + giftWrapTotal + deliveryFee;
  return { items, itemCount, subtotal, giftWrapTotal, deliveryFee, total, composition };
}

export function isInCart(productId) {
  return getCart().some((item) => item.productId === productId);
}
