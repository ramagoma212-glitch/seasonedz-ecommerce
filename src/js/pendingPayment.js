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

export function savePendingPayment({ orderNumber, paymentMethod }) {
  setStorageItem(PENDING_PAYMENT_KEY, {
    orderNumber,
    paymentMethod,
    createdAt: new Date().toISOString(),
  });
}

export function getPendingPayment() {
  return getStorageItem(PENDING_PAYMENT_KEY, null);
}

export function clearPendingPayment() {
  removeStorageItem(PENDING_PAYMENT_KEY);
}
