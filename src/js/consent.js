// Cookie/storage consent manager (Version 7, Milestone 171H).
//
// Scope, confirmed by a full audit of this codebase before writing any
// of this file (see the milestone's own final report for the complete
// inventory): Seasonedz Group has ZERO third-party analytics or
// marketing trackers anywhere today — no Google Analytics, GTM, Meta/
// Facebook/TikTok Pixel, Hotjar, Microsoft Clarity, or anything else.
// This manager exists to (a) give the customer real, working Accept/
// Reject/Preferences control, and (b) provide the gate future optional
// scripts must check before ever loading — see hasConsent() below.
//
// STRICTLY NECESSARY items (never gated by anything in this file):
//   - customer_session / admin_session / oauth_state — backend-set,
//     HttpOnly cookies, invisible to this or any other frontend script
//     (see backend/src/services/customerAuth.service.ts,
//     adminAuth.service.ts, oauthState.service.ts) — login, OAuth
//     CSRF/PKCE/nonce protection, and admin sessions.
//   - seasonedz_cart / seasonedz_wishlist (js/cart.js, js/wishlist.js)
//     — explicitly customer-requested ecommerce functionality (adding
//     an item to a cart or wishlist is a direct action the customer
//     took, expecting it to persist), not optional tracking.
//   - seasonedz_pending_payment (js/pendingPayment.js) — a non-
//     sensitive PayFast order-number hint, self-expiring after 24h.
//   - this consent record itself (CONSENT_STORAGE_KEY below) —
//     recording the customer's own choice is itself required to
//     respect that choice.
//
// No genuinely optional "Preferences" storage exists anywhere in this
// codebase today (audited: no theme/currency/language selector, no
// other optional customer-facing setting) — the `preferences` field
// below exists only for schema forward-compatibility with the
// milestone brief's own conceptual record shape; it always reads
// `true` and is never surfaced as a toggle in the UI, since there is
// genuinely nothing behind it to disable yet.

import { getStorageItem, setStorageItem } from "./storage.js";

export const COOKIE_CONSENT_VERSION = "1";
const CONSENT_STORAGE_KEY = "seasonedz_cookie_consent";

// 6 months, per the milestone brief's own target — re-prompts the
// customer periodically rather than treating one decision as permanent
// forever.
const CONSENT_MAX_AGE_MS = 6 * 30 * 24 * 60 * 60 * 1000;

const OPTIONAL_CATEGORIES = ["analytics", "marketing"];

function defaultConsent() {
  return {
    version: COOKIE_CONSENT_VERSION,
    necessary: true,
    preferences: true,
    analytics: false,
    marketing: false,
    timestamp: null,
    updatedAt: null,
  };
}

// Never returns null — callers always get a valid, current-shape
// record back, so nothing else in this file needs to re-check for a
// missing/malformed value.
export function getConsent() {
  const stored = getStorageItem(CONSENT_STORAGE_KEY, null);
  if (!stored || typeof stored !== "object") return defaultConsent();
  return { ...defaultConsent(), ...stored };
}

// A prompt is needed when: no decision has ever been recorded, the
// recorded decision is for an older consent version (the category
// definitions materially changed), or the recorded decision is older
// than the re-consent window — never merely because time passed with
// no interaction, and never treated as implied by scrolling/browsing
// (this function is the ONLY thing that decides whether the banner
// shows; nothing else in the UI counts as consent).
export function needsConsentPrompt() {
  const stored = getStorageItem(CONSENT_STORAGE_KEY, null);
  if (!stored || typeof stored !== "object") return true;
  if (stored.version !== COOKIE_CONSENT_VERSION) return true;
  if (!stored.timestamp) return true;

  const recordedAt = Date.parse(stored.timestamp);
  if (Number.isNaN(recordedAt)) return true;

  return Date.now() - recordedAt > CONSENT_MAX_AGE_MS;
}

// `categories` may set any of analytics/marketing (never `necessary`,
// which is structurally always true) — a partial object is merged over
// the customer's existing choice, e.g. saving preferences after
// changing only one toggle.
export function saveConsent(categories = {}) {
  const existing = getConsent();
  const now = new Date().toISOString();

  const record = {
    ...existing,
    ...categories,
    version: COOKIE_CONSENT_VERSION,
    necessary: true,
    preferences: true,
    timestamp: existing.timestamp || now,
    updatedAt: now,
  };

  setStorageItem(CONSENT_STORAGE_KEY, record);
  notifySubscribers(record);
  return record;
}

export function acceptAllConsent() {
  return saveConsent({ analytics: true, marketing: true });
}

export function rejectNonEssentialConsent() {
  return saveConsent({ analytics: false, marketing: false });
}

// Safe for any category name, including ones this file doesn't define
// yet — an unknown category is never accidentally treated as granted.
export function hasConsent(category) {
  if (category === "necessary" || category === "preferences") return true;
  if (!OPTIONAL_CATEGORIES.includes(category)) return false;
  return getConsent()[category] === true;
}

const subscribers = new Set();

// For future optional scripts: `callback(consentRecord)` fires once
// immediately with the current state, then again every time the
// customer changes their choice — so a future analytics/marketing
// loader can start listening once and never need to poll.
export function subscribeToConsentChanges(callback) {
  if (typeof callback !== "function") return () => {};
  subscribers.add(callback);
  callback(getConsent());
  return () => subscribers.delete(callback);
}

function notifySubscribers(record) {
  for (const callback of subscribers) {
    try {
      callback(record);
    } catch {
      // A broken subscriber must never break consent handling for
      // every other subscriber or for the customer's own choice being
      // saved correctly.
    }
  }
}
