// Google Analytics 4 + ecommerce conversion tracking (Milestone 183).
//
// Scope: page views, product views, cart activity, checkout starts and
// completed purchases, so Seasonedz can see which traffic sources and
// products actually lead to sales. This is a small, self-contained
// module — every other file that needs to record something calls one
// of the exported track*() functions; nothing outside this file ever
// touches window.gtag or window.dataLayer directly.
//
// Gating (all three must be true before a single analytics byte ever
// leaves the browser):
//   1. A real Measurement ID is configured — VITE_GA_MEASUREMENT_ID,
//      following this project's own import.meta.env.VITE_* convention
//      (see js/apiClient.js/js/orders.js). Never hardcoded here, and
//      never guessed — see .github/workflows/deploy.yml for how the
//      production build supplies it.
//   2. Not running in Vite's dev server (import.meta.env.DEV). This is
//      on top of (1), not instead of it — a stray Measurement ID in a
//      developer's local .env must still never fire real analytics
//      from `npm run dev`.
//   3. The customer has actually granted analytics consent — see
//      js/consent.js, the pre-existing (Milestone 171H) consent
//      manager built with exactly this future use in mind
//      (subscribeToConsentChanges's own header comment). This file
//      integrates with that system; it does not build a second one.
//
// Automated tests (Playwright) build via the exact same `vite build`
// pipeline as production, so gate (2) alone can't tell a CI/test build
// apart from the real one — playwright.config.js's own build command
// deliberately never sets VITE_GA_MEASUREMENT_ID (mirroring how it
// already never sets VITE_API_BASE_URL, for the same "test content
// must never depend on live/external services" reason), so gate (1)
// is what keeps analytics off there. Unit tests import this module
// directly and mock window.gtag/consent rather than relying on either
// gate — see analytics.test.mjs.
//
// Failure safety (Part Q of the brief): nothing in this file may ever
// throw into a caller. Every exported function is wrapped so a missing
// gtag (ad-blocked), a network failure, or a bad input never breaks
// Product/Cart/Checkout/Order Confirmation for the customer.

import { hasConsent, subscribeToConsentChanges } from "./consent.js";
import { getStorageItem, setStorageItem } from "./storage.js";
import { getNavigationEpoch } from "./router.js";

const MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID || "").trim();
const CURRENCY = "ZAR";

// Persisted, not a component variable — Part J: a refresh/revisit of
// Order Confirmation (or a PayFast customer who separately lands on
// both /payment-success and /order-confirmation for the same order)
// must never record the same purchase twice. Keyed by the real,
// backend-issued orderNumber, never anything this file invents.
const PURCHASE_TRACKED_KEY = "seasonedz_ga_purchase_tracked";

let gtagLoaded = false;
let analyticsAllowed = false; // consent + config gates, re-evaluated on every consent change
let initialized = false;

// One dedup guard for every "fires once per real page view" ecommerce
// event (view_item, view_cart, begin_checkout) — keyed by event name,
// compared against router.js's own navigation epoch (see its header
// comment). router.js's rerenderCurrentRoute() (used after a cart/
// wishlist Local Storage change, 50+ call sites) re-runs the same
// page's render function without a real navigation ever having
// happened; without this, e.g. clicking the cart quantity stepper
// would re-fire view_cart on every click. add_to_cart/remove_from_cart/
// purchase are direct user-action events, not render side effects, so
// they never need this — they're wired to one-shot action handlers.
const firedThisNavigation = new Map();

function isConfigured() {
  return MEASUREMENT_ID.length > 0;
}

function isDevMode() {
  return Boolean(import.meta.env.DEV);
}

function shouldBeActive() {
  return isConfigured() && !isDevMode() && hasConsent("analytics");
}

function ensureGtagLoaded() {
  if (gtagLoaded || !isConfigured()) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args) {
    window.dataLayer.push(args);
  };

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(script);

  // Analytics only — Part K/C: advertising/personalisation signals are
  // explicitly denied and never requested to be granted anywhere in
  // this file. The script is never injected at all until the customer
  // has already granted analytics consent (see initializeAnalytics()
  // below), so there is no "pre-consent" traffic to model here; this
  // is the simple, stricter form of Consent Mode (deny non-analytics
  // signals, load nothing until analytics itself is granted) rather
  // than the fuller "always load, gate via signals" pattern, which
  // would need advertising use cases this project doesn't have.
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });

  // send_page_view: false — Part D: page views are sent explicitly by
  // trackPageView() on every real navigation (including the first),
  // never GA4's own automatic pageview, so there is exactly one
  // page_view per real navigation, never a double count on load.
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, { send_page_view: false });

  gtagLoaded = true;
}

function safeGtag(...args) {
  try {
    if (!analyticsAllowed) return;
    ensureGtagLoaded();
    window.gtag?.(...args);
  } catch {
    // Analytics must never break the shopping experience (Part Q).
  }
}

function sendEvent(name, params) {
  safeGtag("event", name, params);
}

function fireOncePerNavigation(key, run) {
  try {
    const epoch = getNavigationEpoch();
    if (firedThisNavigation.get(key) === epoch) return;
    firedThisNavigation.set(key, epoch);
    run();
  } catch {
    // never break the page over an analytics dedup bookkeeping error
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Builds a GA4 item object from whatever shape the caller has on hand
// (a cart line, a Product, or a real backend OrderItem) — deliberately
// narrow: only ever the standard, non-personal ecommerce fields ever
// leave this file (Part F). item_category is only included when the
// source object genuinely has one (Product pages/cart lines do; real
// backend order lines don't carry category — never invented).
function toGa4Item(source, { idKey = "slug", nameKey = "name", priceKey = "price" } = {}) {
  const item = {
    item_id: source[idKey],
    item_name: source[nameKey],
    price: Number(source[priceKey]) || 0,
    quantity: Number(source.quantity) || 1,
  };
  if (source.category) item.item_category = source.category;
  return item;
}

function hasPurchaseBeenTracked(orderNumber) {
  const tracked = getStorageItem(PURCHASE_TRACKED_KEY, []);
  return Array.isArray(tracked) && tracked.includes(orderNumber);
}

function markPurchaseTracked(orderNumber) {
  const tracked = getStorageItem(PURCHASE_TRACKED_KEY, []);
  const next = Array.isArray(tracked) ? tracked : [];
  if (!next.includes(orderNumber)) next.push(orderNumber);
  // Cheap, permanent bound — a customer's browser will never
  // realistically place thousands of orders; keeps this key from
  // growing without limit over a very long-lived browser profile.
  setStorageItem(PURCHASE_TRACKED_KEY, next.slice(-500));
}

// Part J, corrected in Milestone 183A: a GA4 purchase must never
// overstate Seasonedz revenue. A full backend lifecycle audit
// (order.service.ts, payfast.service.ts, adminPaymentConfirmation
// .service.ts) confirmed that EVERY order, of EVERY payment method, is
// created paymentStatus PENDING — nothing is auto-confirmed at order
// creation:
//   - PayFast: only a verified PayFast ITN ever sets paymentStatus
//     PAID (and Order.status CONFIRMED with it).
//   - Bank Transfer: stays PENDING until an admin has genuinely
//     verified the money landed in the bank account and records that
//     — the only non-PayFast path to PAID (adminPaymentConfirmation
//     .service.ts).
//   - Cash on Delivery: the same manual admin confirmation, which the
//     backend additionally refuses until the order is DELIVERED.
// So "order created" is never "money received" for any method, and
// Order.status reaching CONFIRMED does not mean paid either (an admin
// can advance a still-unpaid Bank Transfer/COD order). The one
// authoritative, method-independent signal that Seasonedz has actually
// been paid is paymentStatus === "PAID" — that, and only that, is a
// GA4 purchase. A customer who reaches Order Confirmation straight
// after a Bank Transfer / COD checkout sees paymentStatus PENDING and
// nothing is recorded; the purchase is recorded later — once — when
// they return to an order page (the Order Confirmation link, or their
// account order detail) after the payment has genuinely been
// confirmed.
function isPurchaseEligible(order) {
  if (!order || !order.orderNumber) return false;
  return order.paymentStatus === "PAID";
}

// --- Public API -------------------------------------------------------

// Wires the consent subscription and the router's navigation event.
// Safe to call once at app start (see js/app.js's mountApp()) — never
// throws, and does nothing at all when no Measurement ID is configured
// or we're in Vite's dev server, regardless of consent.
export function initializeAnalytics() {
  if (initialized) return;
  initialized = true;

  if (!isConfigured() || isDevMode()) return;

  // Fires immediately with the current stored choice, then again on
  // every future change (js/consent.js's own documented contract) — so
  // a customer who accepts analytics mid-session starts being tracked
  // from that point on, and one who revokes it stops immediately: this
  // file keeps re-checking analyticsAllowed on every safeGtag() call,
  // it never assumes a granted-at-init state stays true forever.
  subscribeToConsentChanges((consentRecord) => {
    analyticsAllowed = shouldBeActive();
    if (analyticsAllowed) ensureGtagLoaded();
  });

  try {
    window.addEventListener("seasonedz:navigation", (event) => {
      trackPageView(event.detail || {});
    });
  } catch {
    // window/addEventListener unavailable — never fatal, analytics
    // just won't record page views in that environment.
  }
}

// Part D: called once per real navigation (see router.js's
// resolveRoute()) — page_location includes the full URL, so UTM
// parameters already on it (Part L — never stripped by this SPA's own
// routing, confirmed by audit) are captured on the very first page
// view of a session exactly like a traditional multi-page site.
export function trackPageView({ path, title } = {}) {
  try {
    if (!analyticsAllowed) return;
    sendEvent("page_view", {
      page_location: window.location.href,
      page_path: path || window.location.pathname,
      page_title: title || document.title,
    });
  } catch {
    // never break navigation over analytics
  }
}

export function trackViewItem(product) {
  fireOncePerNavigation(`view_item:${product?.slug}`, () => {
    if (!isPlainObject(product)) return;
    sendEvent("view_item", {
      currency: CURRENCY,
      value: Number(product.price) || 0,
      items: [toGa4Item({ ...product, quantity: 1 })],
    });
  });
}

// Called from the one delegated Add to Cart handler (js/app.js's
// handleAddToCart()) — a single, non-duplicating action, never fired
// merely from opening a Product page (Part H).
export function trackAddToCart(product, quantity = 1) {
  try {
    if (!isPlainObject(product)) return;
    const item = toGa4Item({ ...product, quantity });
    sendEvent("add_to_cart", { currency: CURRENCY, value: item.price * item.quantity, items: [item] });
  } catch {
    // never break Add to Cart over analytics
  }
}

// Called with the cart line as it existed immediately before removal
// (js/app.js's "cart-remove" action reads it first) — removeFromCart()
// itself only takes a lineId, so the real name/price/quantity being
// removed has to be captured by the caller, not this file.
export function trackRemoveFromCart(item) {
  try {
    if (!isPlainObject(item)) return;
    const ga4Item = toGa4Item(item);
    sendEvent("remove_from_cart", { currency: CURRENCY, value: ga4Item.price * ga4Item.quantity, items: [ga4Item] });
  } catch {
    // never break cart removal over analytics
  }
}

// Called from cartPage.js's own render — deduped per navigation so
// clicking the quantity stepper (which re-renders the same page via
// rerenderCurrentRoute(), not a real navigation) never re-fires this.
export function trackViewCart(items, value) {
  fireOncePerNavigation("view_cart", () => {
    if (!Array.isArray(items) || !items.length) return;
    sendEvent("view_cart", {
      currency: CURRENCY,
      value: Number(value) || 0,
      items: items.map((item) => toGa4Item(item)),
    });
  });
}

// Called from checkoutPage.js's own render — this is a genuine
// "customer reached the checkout page" signal, not the submit action;
// deduped per navigation for the same reason as trackViewCart above.
export function trackBeginCheckout(items, value) {
  fireOncePerNavigation("begin_checkout", () => {
    if (!Array.isArray(items) || !items.length) return;
    sendEvent("begin_checkout", {
      currency: CURRENCY,
      value: Number(value) || 0,
      items: items.map((item) => toGa4Item(item)),
    });
  });
}

// Part J — the most important event. `order` is always the real,
// backend-authoritative Order (OrderOutput from GET /api/orders/:id),
// never a client-side cart/checkout snapshot — order.total is the
// backend's own final figure (subtotal + giftWrap + delivery -
// discounts), never recalculated here. Safe to call with ANY order
// this app has on hand (Bank Transfer/COD/PayFast alike, PAID or not)
// — isPurchaseEligible() (paymentStatus must be "PAID", every method,
// see its comment) and the persisted dedup guard above decide whether
// anything is actually sent, so callers (orderConfirmation.js,
// paymentSuccess.js, accountOrderDetail.js) never need their own
// gating or dedup logic.
export function trackPurchase(order) {
  try {
    if (!analyticsAllowed) return;
    if (!isPurchaseEligible(order)) return;
    if (hasPurchaseBeenTracked(order.orderNumber)) return;

    // Marked BEFORE sending, so this can never double-fire even if
    // called twice in the same tick.
    markPurchaseTracked(order.orderNumber);

    const items = (order.items || []).map((item) =>
      toGa4Item(item, { idKey: "productSlug", nameKey: "productName", priceKey: "unitPrice" })
    );

    sendEvent("purchase", {
      transaction_id: order.orderNumber,
      currency: CURRENCY,
      value: Number(order.total) || 0,
      shipping: Number(order.deliveryFee) || 0,
      items,
    });
  } catch {
    // never break Order Confirmation / Payment Success over analytics
  }
}
