// A small, non-sensitive Local Storage record of the most recent
// PayFast payment attempt (Version 3, Milestone 23) — kept only so the
// payment-success/payment-cancelled/payment-failed pages can still
// find the right order number if the customer's browser somehow comes
// back from PayFast without one in the URL.
//
// This is NOT proof of anything and is never treated as such: it only
// ever stores orderNumber/paymentMethod/createdAt, never a payment
// status, a signature, or any PayFast field. Every page that reads
// this still re-fetches the order's real status from the backend
// before showing anything — see src/pages/paymentSuccess.js etc.

import { getStorageItem, setStorageItem, removeStorageItem } from "./storage.js";

const PENDING_PAYMENT_KEY = "seasonedz_pending_payment";

// A PayFast attempt from days ago is no longer a useful hint — the
// customer has almost certainly moved on, and continuing to resurface
// a stale order number could point them at the wrong thing. Expiring
// it is just good hygiene, not a security control (see file header).
const PENDING_PAYMENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function savePendingPayment({ orderNumber, paymentMethod }) {
  setStorageItem(PENDING_PAYMENT_KEY, {
    orderNumber,
    paymentMethod,
    createdAt: new Date().toISOString(),
  });
}

export function getPendingPayment() {
  const record = getStorageItem(PENDING_PAYMENT_KEY, null);
  if (!record) return null;

  const createdAt = Date.parse(record.createdAt);
  if (Number.isNaN(createdAt) || Date.now() - createdAt > PENDING_PAYMENT_MAX_AGE_MS) {
    removeStorageItem(PENDING_PAYMENT_KEY);
    return null;
  }

  return record;
}

export function clearPendingPayment() {
  removeStorageItem(PENDING_PAYMENT_KEY);
}
