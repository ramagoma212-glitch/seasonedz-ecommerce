// Shared "Try PayFast Again" retry UI (Version 4, Milestone 31) — used
// by payment-success/cancelled/failed for orders whose payment can
// safely be retried.
//
// isPayfastRetryEligible() only ever decides whether to *show* the
// button — it mirrors PAYFAST_RETRY_ELIGIBLE_STATUSES in
// backend/src/services/payfast.service.ts for a consistent customer
// experience, but is never the authority: the backend independently
// re-checks eligibility again the moment a retry request actually
// arrives. Getting this frontend copy out of sync would at worst show
// (or hide) a button that the backend still correctly accepts (or
// rejects) on its own — never a security concern.

import { escapeHtml } from "../js/search.js";

const RETRY_ELIGIBLE_PAYMENT_STATUSES = ["PENDING", "FAILED", "CANCELLED"];

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
