// Shared "Try PayFast Again" retry UI (Version 4, Milestone 31) — used
// by payment-success/cancelled/failed for orders whose payment can
// safely be retried.
//
// isPayfastRetryEligible() only ever decides whether to *show* the
// button — it mirrors RETRY_ELIGIBLE_STATUSES in
// backend/src/services/payfast.service.ts for a consistent customer
// experience, but is never the authority: the backend independently
// re-checks eligibility again the moment a retry request actually
// arrives (always with context: "retry" — see js/app.js), and rejects
// PENDING regardless of what this frontend copy says. Getting this out
// of sync would at worst show a button the backend still correctly
// rejects on its own — never a security concern.
//
// Version 5, Milestone 34: PENDING deliberately removed — a still-
// PENDING order's first attempt might still complete, so retrying is
// never offered while pending. See VERSION_5_RETRY_PENDING_RISK_FIX.md
// and the payment-success/cancelled/failed pages' own PENDING handling.

import { escapeHtml } from "../js/search.js";

const RETRY_ELIGIBLE_PAYMENT_STATUSES = ["FAILED", "CANCELLED"];

export function isPayfastRetryEligible(tracking) {
  return tracking.paymentMethod === "PAYFAST" && RETRY_ELIGIBLE_PAYMENT_STATUSES.includes(tracking.paymentStatus);
}

// The error span is toggled by app.js's retry-payfast click handler on
// failure — never populated at render time, since nothing has failed
// yet.
export function renderPayfastRetryButton(orderNumber) {
  return `
    <button type="button" class="btn btn--primary" data-action="retry-payfast" data-order-number="${escapeHtml(orderNumber)}">Try PayFast Again</button>
    <span class="form-banner form-banner--error" data-retry-error hidden></span>
  `;
}
