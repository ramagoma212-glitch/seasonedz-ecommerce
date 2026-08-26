// Version 7, Milestone 172B.4: referral attribution capture, storage
// and clearing — the frontend half of the referral discount/commission
// programme (backend/src/services/referralCapture.service.ts and
// order.service.ts). Local Storage only, exactly like this project's
// existing cart/wishlist/cookie-consent state (js/cart.js, js/wishlist.js,
// js/consent.js) — this site has never used a cookie for anything
// customer-facing, and this doesn't start now.
//
// The stored object is ONLY ever { code, capturedAt, signature,
// pendingOrderNumber? } — no PII, no rate, no discount amount, no
// affiliate id, no fingerprinting. `signature` is issued by the backend
// at capture time (see referralApi.js) and is opaque here: this file
// never re-derives or checks it — that's the backend's job, at real
// checkout time, using a server-only secret this frontend never has
// access to (see utils/referralAttributionToken.ts). This file exists
// to store and relay that token verbatim, and to decide WHEN to clear
// it, never to decide whether it's still valid.

import { getStorageItem, setStorageItem, removeStorageItem } from "./storage.js";
import { captureReferral } from "./api/referralApi.js";

const REFERRAL_KEY = "seasonedz_referral";
const REF_QUERY_PARAM = "ref";

// Same shape rule as the backend's own referral-code format
// (backend/src/services/referralAffiliate.service.ts's
// validateReferralCodeFormat): lowercase letters, digits and single
// hyphens, 3-30 characters. This is a CLIENT-SIDE shape check only —
// used purely to decide whether it's even worth calling the capture
// endpoint, never trusted as the real validation (the backend re-checks
// this exact shape itself, and is the only side that decides
// eligibility).
const REFERRAL_CODE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidReferralCodeShape(code) {
  return typeof code === "string" && code.length >= 3 && code.length <= 30 && REFERRAL_CODE_PATTERN.test(code);
}

export function getRawRefParam(query) {
  const raw = query?.get(REF_QUERY_PARAM);
  return typeof raw === "string" ? raw.trim().toLowerCase() : null;
}

// Called on every route render (router.js) — detects a ?ref=CODE query
// param on the CURRENT page, and if it's present and shaped like a real
// code, asks the backend to mint and return a signed capture token,
// then stores it verbatim. Best-effort and silent: a network hiccup or
// backend error here must never break page navigation — the customer
// just doesn't get attributed for this visit, exactly like an invalid/
// unknown code degrades silently at real checkout time. Never blocks or
// awaits the page render itself; router.js fires this and moves on.
export async function captureReferralFromUrl(query) {
  const code = getRawRefParam(query);
  if (!code || !isValidReferralCodeShape(code)) return;

  try {
    const response = await captureReferral(code);
    storeReferralAttribution(response.data);
  } catch {
    // Silent — see this function's own comment above.
  }
}

// The exact object sent back as part of an order (js/api/ordersApi.js) —
// never anything more. Returns null if nothing is stored, or if what's
// stored doesn't even have the right shape (defensive against a
// directly-edited Local Storage entry) — a shape problem here is never
// fatal, it just means "no referral applies", same silent-degrade
// discipline the backend itself uses for an invalid/expired one.
export function getStoredReferralAttribution() {
  const record = getStorageItem(REFERRAL_KEY, null);
  if (!record || typeof record.code !== "string" || typeof record.capturedAt !== "string" || typeof record.signature !== "string") {
    return null;
  }
  return { code: record.code, capturedAt: record.capturedAt, signature: record.signature };
}

// Called once a real signed capture token has been issued by the
// backend (js/api/referralApi.js's captureReferral()) — stores it
// verbatim, replacing whatever was there before ("last valid referral
// wins", the approved attribution rule). Never merges with a previous
// entry: a fresh capture is a fresh attribution, full stop.
export function storeReferralAttribution({ code, capturedAt, signature }) {
  setStorageItem(REFERRAL_KEY, { code, capturedAt, signature });
}

// Marks the currently-stored attribution as "used by this order, but
// not yet confirmed" — set right after a PayFast order is created
// (checkout submits, but payment hasn't been confirmed yet), so
// paymentSuccess.js knows whether a later PAID result belongs to THIS
// referral before clearing it. Never called for Bank Transfer/Cash on
// Delivery, which clear immediately instead (see js/app.js) — those
// have no separate "payment confirmed" step to wait for.
export function markReferralAttributionPendingOrder(orderNumber) {
  const stored = getStorageItem(REFERRAL_KEY, null);
  if (!stored) return;
  setStorageItem(REFERRAL_KEY, { ...stored, pendingOrderNumber: orderNumber });
}

export function getReferralPendingOrderNumber() {
  return getStorageItem(REFERRAL_KEY, null)?.pendingOrderNumber ?? null;
}

// Only ever called after a genuinely successful/confirmed order — never
// on checkout-page-open, PayFast-redirect-start, payment failure, or
// cancellation (see js/app.js's handleCheckoutSubmit and
// pages/paymentSuccess.js). Clearing here is what makes "repeat use"
// work correctly: once cleared, the customer has no stored referral at
// all, and a fresh ?ref=CODE visit is needed to attribute a future
// order — the same one-capture-per-order design the backend's own
// signed-token expiry exists to protect (see
// utils/referralAttributionToken.ts's own header comment on why a
// capture must not silently self-renew).
export function clearReferralAttribution() {
  removeStorageItem(REFERRAL_KEY);
}

// Clears the stored attribution ONLY if it's still flagged as pending
// for exactly this order — never touches a referral captured fresh
// since (e.g. the customer started a new browsing session with a new
// ?ref= link while an old PayFast payment was still resolving).
export function clearReferralAttributionIfPendingForOrder(orderNumber) {
  if (getReferralPendingOrderNumber() === orderNumber) {
    clearReferralAttribution();
  }
}
